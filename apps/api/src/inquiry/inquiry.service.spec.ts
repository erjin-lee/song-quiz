import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { RoomGateway } from '../room/room.gateway';
import { Inquiry } from './entities/inquiry.entity';
import { InquiryActionService } from './inquiry-action.service';
import { InquiryGptClient } from './inquiry-gpt.client';
import { InquiryService } from './inquiry.service';

describe('InquiryService', () => {
  let service: InquiryService;

  const baseInquiry = {
    inquiryId: 'iq1',
    quizSongId: 'qs1',
    roomId: 'room1',
    userId: 'user1',
    content: '시작이 너무 늦어요',
    status: 'RECEIVED',
  };

  const baseQuizSong = {
    quizSongId: 'qs1',
    startSec: 10,
    durationSec: 200,
    youtubeUrl: 'https://www.youtube.com/watch?v=abc',
    song: { songNm: '너에게 닿기를', artist: { atstNm: '아이유' } },
  };

  const inquiryRepositoryMock = {
    count: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (data: unknown) => ({
      inquiryId: 'iq1',
      ...(data as object),
    })),
    findOne: jest.fn(),
  };
  const quizSongRepositoryMock = {
    findOne: jest.fn(),
  };
  const gptClientMock = {
    classify: jest.fn(),
    verifyConfidence: jest.fn(),
  };
  const actionServiceMock = {
    changeStartTime: jest.fn(),
    changeLink: jest.fn(),
    addAnswer: jest.fn(),
  };
  const roomGatewayMock = {
    emitInquiryResult: jest.fn(),
  };

  const callProcess = (inquiryId: string) =>
    (service as unknown as { process(id: string): Promise<void> }).process(
      inquiryId,
    );

  beforeEach(async () => {
    jest.clearAllMocks();
    inquiryRepositoryMock.count.mockResolvedValue(0);
    inquiryRepositoryMock.findOne.mockResolvedValue({ ...baseInquiry });
    quizSongRepositoryMock.findOne.mockResolvedValue({
      ...baseQuizSong,
      song: { ...baseQuizSong.song, artist: { ...baseQuizSong.song.artist } },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InquiryService,
        {
          provide: getRepositoryToken(Inquiry),
          useValue: inquiryRepositoryMock,
        },
        {
          provide: getRepositoryToken(QuizSong),
          useValue: quizSongRepositoryMock,
        },
        { provide: InquiryGptClient, useValue: gptClientMock },
        { provide: InquiryActionService, useValue: actionServiceMock },
        { provide: RoomGateway, useValue: roomGatewayMock },
      ],
    }).compile();

    service = module.get<InquiryService>(InquiryService);
  });

  describe('submit', () => {
    it('한 게임 내 문의 횟수를 초과하면 400을 반환한다', async () => {
      inquiryRepositoryMock.count.mockResolvedValue(5);

      await expect(
        service.submit({
          quizSongId: 'qs1',
          roomId: 'room1',
          userId: 'user1',
          content: '문의',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(inquiryRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('문의를 저장하고 접수 응답을 즉시 반환한다', async () => {
      // process()는 백그라운드(fire-and-forget)로 실행되므로, 여기서는 조용히
      // 종료되도록 문의를 찾지 못하는 상태로 둔다.
      inquiryRepositoryMock.findOne.mockResolvedValue(null);

      const result = await service.submit({
        quizSongId: 'qs1',
        roomId: 'room1',
        userId: 'user1',
        content: '문의',
      });

      expect(result).toEqual({
        inquiryId: 'iq1',
        message: '문의가 접수되었습니다. 확인 후 알려드릴게요.',
      });
    });
  });

  describe('process (문의 처리 파이프라인)', () => {
    it('출제곡을 찾을 수 없으면 FAILED로 종료한다', async () => {
      quizSongRepositoryMock.findOne.mockResolvedValue(null);

      await callProcess('iq1');

      expect(inquiryRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED' }),
      );
      expect(gptClientMock.classify).not.toHaveBeenCalled();
    });

    it('매칭되는 함수가 없으면 NO_MATCH로 종료하고 소켓 알림은 보내지 않는다', async () => {
      gptClientMock.classify.mockResolvedValue({
        matchedFunction: null,
        args: null,
      });

      await callProcess('iq1');

      expect(inquiryRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'NO_MATCH' }),
      );
      expect(roomGatewayMock.emitInquiryResult).not.toHaveBeenCalled();
    });

    it('신뢰도가 LOW면 REJECTED로 종료하고 소켓으로 알린다', async () => {
      gptClientMock.classify.mockResolvedValue({
        matchedFunction: 'CHANGE_START_TIME',
        args: { startSec: 30 },
      });
      gptClientMock.verifyConfidence.mockResolvedValue('LOW');

      await callProcess('iq1');

      expect(actionServiceMock.changeStartTime).not.toHaveBeenCalled();
      expect(inquiryRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'REJECTED',
          resultMessage:
            '요청 내용을 확인했지만 자동으로 처리하기 어려운 문의예요. 관리자가 다시 확인할게요.',
        }),
      );
      expect(roomGatewayMock.emitInquiryResult).toHaveBeenCalledWith(
        'user1',
        expect.objectContaining({ status: 'REJECTED' }),
      );
    });

    it('신뢰도가 충분하면 조치를 실행하고 COMPLETED로 종료한다', async () => {
      gptClientMock.classify.mockResolvedValue({
        matchedFunction: 'CHANGE_START_TIME',
        args: { startSec: 30 },
      });
      gptClientMock.verifyConfidence.mockResolvedValue('HIGH');

      await callProcess('iq1');

      expect(actionServiceMock.changeStartTime).toHaveBeenCalledWith('qs1', {
        startSec: 30,
      });
      expect(inquiryRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'COMPLETED',
          resultMessage: '요청하신 재생 시작 시간이 반영되었습니다.',
        }),
      );
      expect(roomGatewayMock.emitInquiryResult).toHaveBeenCalledWith(
        'user1',
        expect.objectContaining({ status: 'COMPLETED' }),
      );
    });

    it('조치 인자가 유효하지 않으면 FAILED로 종료한다', async () => {
      gptClientMock.classify.mockResolvedValue({
        matchedFunction: 'CHANGE_START_TIME',
        args: { startSec: -10 },
      });
      gptClientMock.verifyConfidence.mockResolvedValue('HIGH');

      await callProcess('iq1');

      expect(actionServiceMock.changeStartTime).not.toHaveBeenCalled();
      expect(inquiryRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED', resultMessage: null }),
      );
    });

    it('조치 실행 중 예외가 발생하면 FAILED로 종료한다', async () => {
      gptClientMock.classify.mockResolvedValue({
        matchedFunction: 'ADD_ANSWER',
        args: { answerTxt: '너닿', answerType: null },
      });
      gptClientMock.verifyConfidence.mockResolvedValue('MEDIUM');
      actionServiceMock.addAnswer.mockRejectedValue(new Error('DB 오류'));

      await callProcess('iq1');

      expect(inquiryRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED', resultMessage: null }),
      );
      expect(roomGatewayMock.emitInquiryResult).not.toHaveBeenCalled();
    });
  });
});
