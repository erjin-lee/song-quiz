import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QuizAnswer } from '../quiz/entities/quiz-answer.entity';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { YoutubeScraperClient } from '../quiz/youtube-scraper.client';
import { InquiryActionService } from './inquiry-action.service';

describe('InquiryActionService', () => {
  let service: InquiryActionService;

  const baseQuizSong = {
    quizSongId: 'qs1',
    youtubeUrl: 'https://www.youtube.com/watch?v=old&t=5',
    youtubeVideoId: 'old',
    durationSec: 100,
    startSec: 5,
    endSec: 35,
  };

  const quizSongRepositoryMock = {
    findOne: jest.fn(),
    save: jest.fn(async (data: unknown) => data),
  };
  const quizAnswerRepositoryMock = {
    create: jest.fn((data) => data),
    save: jest.fn(async (data: unknown) => data),
    findOne: jest.fn(),
  };
  const youtubeScraperClientMock = {
    getDurationSec: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    quizSongRepositoryMock.findOne.mockResolvedValue({ ...baseQuizSong });
    // addAnswer의 중복 방지 조회 - 기본값은 "기존 정답 없음"이고, 멱등성을 검증하는
    // 테스트만 이 값을 덮어쓴다.
    quizAnswerRepositoryMock.findOne.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InquiryActionService,
        {
          provide: getRepositoryToken(QuizSong),
          useValue: quizSongRepositoryMock,
        },
        {
          provide: getRepositoryToken(QuizAnswer),
          useValue: quizAnswerRepositoryMock,
        },
        { provide: YoutubeScraperClient, useValue: youtubeScraperClientMock },
      ],
    }).compile();

    service = module.get<InquiryActionService>(InquiryActionService);
  });

  describe('changeStartTime', () => {
    it('시작 시간과 링크의 t 파라미터를 함께 갱신한다', async () => {
      await service.changeStartTime('qs1', { startSec: 20 });

      expect(quizSongRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          startSec: 20,
          youtubeUrl: 'https://www.youtube.com/watch?v=old&t=20',
        }),
      );
    });

    it('출제곡을 찾을 수 없으면 404를 반환한다', async () => {
      quizSongRepositoryMock.findOne.mockResolvedValueOnce(null);

      await expect(
        service.changeStartTime('missing', { startSec: 20 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('changeLink', () => {
    it('새 링크에 t 파라미터가 있으면 그 값을 시작 시간으로 쓰고, 영상 길이도 스크래핑해 저장한다', async () => {
      youtubeScraperClientMock.getDurationSec.mockResolvedValue(180);

      await service.changeLink('qs1', {
        youtubeUrl: 'https://www.youtube.com/watch?v=new&t=50',
      });

      expect(youtubeScraperClientMock.getDurationSec).toHaveBeenCalledWith(
        'new',
        'quizSongId: qs1',
      );
      expect(quizSongRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          youtubeUrl: 'https://www.youtube.com/watch?v=new&t=50',
          youtubeVideoId: 'new',
          durationSec: 180,
          startSec: 50,
          endSec: 80,
        }),
      );
    });

    it('새 링크에 t 파라미터가 없으면 스크래핑한 영상 길이의 절반을 시작 시간으로 쓴다', async () => {
      youtubeScraperClientMock.getDurationSec.mockResolvedValue(200);

      await service.changeLink('qs1', {
        youtubeUrl: 'https://www.youtube.com/watch?v=new',
      });

      expect(quizSongRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          durationSec: 200,
          startSec: 100,
          endSec: 130,
        }),
      );
    });

    it('영상 길이 스크래핑에 실패하면 durationSec은 null로 저장하고 기존 startSec을 유지한다', async () => {
      youtubeScraperClientMock.getDurationSec.mockResolvedValue(null);

      await service.changeLink('qs1', {
        youtubeUrl: 'https://www.youtube.com/watch?v=new',
      });

      expect(quizSongRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          durationSec: null,
          startSec: baseQuizSong.startSec,
          endSec: baseQuizSong.startSec + 30,
        }),
      );
    });

    it('videoId를 파싱할 수 없는 링크는 저장하지 않고 거부한다', async () => {
      await expect(
        service.changeLink('qs1', { youtubeUrl: '유효하지 않은 URL' }),
      ).rejects.toThrow(BadRequestException);

      expect(youtubeScraperClientMock.getDurationSec).not.toHaveBeenCalled();
      expect(quizSongRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('유튜브가 아닌 호스트의 링크(v 파라미터가 있어도)는 저장하지 않고 거부한다', async () => {
      await expect(
        service.changeLink('qs1', {
          youtubeUrl: 'https://example.com/?v=abc123',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(quizSongRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('유튜브 호스트라도 /watch 경로가 아닌 링크(예: 검색결과/홈)는 저장하지 않고 거부한다', async () => {
      await expect(
        service.changeLink('qs1', {
          youtubeUrl: 'https://www.youtube.com/results?v=abc123',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(quizSongRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('저장되는 youtubeUrl은 검증된 videoId/startSec으로 정규화한 URL이다(제출한 URL에 불필요한 파라미터가 섞여 있어도)', async () => {
      youtubeScraperClientMock.getDurationSec.mockResolvedValue(180);

      await service.changeLink('qs1', {
        youtubeUrl:
          'https://www.youtube.com/watch?v=new&t=50&list=PLxxxx&index=3',
      });

      expect(quizSongRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          youtubeUrl: 'https://www.youtube.com/watch?v=new&t=50',
        }),
      );
    });

    it('새 링크의 t가 음수면 youtubeUrl/startSec/endSec 모두 0으로 일관되게 보정한다', async () => {
      youtubeScraperClientMock.getDurationSec.mockResolvedValue(180);

      await service.changeLink('qs1', {
        youtubeUrl: 'https://www.youtube.com/watch?v=new&t=-60',
      });

      expect(quizSongRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          youtubeUrl: 'https://www.youtube.com/watch?v=new&t=0',
          startSec: 0,
          endSec: 30,
        }),
      );
    });

    it('t가 스크래핑된 영상 길이를 넘으면 영상 길이 안쪽으로 보정한다', async () => {
      youtubeScraperClientMock.getDurationSec.mockResolvedValue(100);

      await service.changeLink('qs1', {
        youtubeUrl: 'https://www.youtube.com/watch?v=new&t=99999',
      });

      expect(quizSongRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          youtubeUrl: 'https://www.youtube.com/watch?v=new&t=99',
          startSec: 99,
          endSec: 129,
        }),
      );
    });

    it('출제곡을 찾을 수 없으면 404를 반환한다', async () => {
      quizSongRepositoryMock.findOne.mockResolvedValueOnce(null);

      await expect(
        service.changeLink('missing', {
          youtubeUrl: 'https://www.youtube.com/watch?v=new',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('addAnswer', () => {
    it('정답 후보를 활성 상태로 저장한다', async () => {
      await service.addAnswer(
        'qs1',
        { answerTxt: '너에게 닿기를', answerType: 'ORIGINAL' },
        'HIGH',
      );

      expect(quizAnswerRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          quizSongId: 'qs1',
          answerTxt: '너에게 닿기를',
          answerType: 'ORIGINAL',
          confidence: 'HIGH',
          isActive: 'Y',
        }),
      );
    });

    it('answerType 길이가 최대치를 넘으면 잘라서 저장한다', async () => {
      await service.addAnswer(
        'qs1',
        { answerTxt: '답', answerType: 'ABCDEFGHIJKLMNOP' },
        'MEDIUM',
      );

      expect(quizAnswerRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ answerType: 'ABCDEFGHIJKL' }),
      );
    });

    it('같은 quizSongId+answerTxt로 이미 활성화된 정답이 있으면 새로 추가하지 않는다(재승인 시 중복 삽입 방지)', async () => {
      quizAnswerRepositoryMock.findOne.mockResolvedValue({
        quizSongId: 'qs1',
        answerTxt: '너에게 닿기를',
        answerType: 'ORIGINAL',
        isActive: 'Y',
      });

      const result = await service.addAnswer(
        'qs1',
        { answerTxt: '너에게 닿기를', answerType: 'ALIAS' },
        'HIGH',
      );

      expect(quizAnswerRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { quizSongId: 'qs1', answerTxt: '너에게 닿기를', isActive: 'Y' },
      });
      expect(quizAnswerRepositoryMock.save).not.toHaveBeenCalled();
      expect(result).toEqual({
        before: { answerTxt: '너에게 닿기를', answerType: 'ORIGINAL' },
        after: { answerTxt: '너에게 닿기를', answerType: 'ORIGINAL' },
      });
    });
  });
});
