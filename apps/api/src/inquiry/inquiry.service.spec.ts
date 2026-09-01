import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { InquiryActionLog } from './entities/inquiry-action-log.entity';
import { InquiryAction } from './entities/inquiry-action.entity';
import { Inquiry } from './entities/inquiry.entity';
import { GameNotifierClient } from './game-notifier.client';
import { InquiryActionService } from './inquiry-action.service';
import { InquiryGptClient } from './inquiry-gpt.client';
import { InquiryService } from './inquiry.service';
import { SlackNotifierClient } from './slack-notifier.client';

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
    song: {
      songNm: '너에게 닿기를',
      songArtists: [{ mainYn: 'Y', artist: { atstNm: '아이유' } }],
    },
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
  const actionLogRepositoryMock = {
    create: jest.fn((data) => data),
    save: jest.fn(async (data: unknown) => data),
  };
  // transitionAction이 쓰는 원자적 UPDATE(manager.createQueryBuilder().update().set()
  // .where()....execute())를 흉내낸 fluent 체인. execute()의 기본 반환값은 성공
  // (affected: 1)이고, 원자적 가드 실패를 재현하고 싶은 테스트만 execute를 덮어쓴다.
  const actionUpdateQueryBuilderMock = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };
  // transitionAction이 actionRepository.manager.transaction(...)으로 액션 UPDATE와
  // 로그 INSERT를 하나의 트랜잭션에 묶는다 - 콜백에 넘겨주는 manager를 흉내낸다.
  const transactionManagerMock = {
    createQueryBuilder: jest.fn(() => actionUpdateQueryBuilderMock),
    getRepository: jest.fn(() => actionLogRepositoryMock),
  };
  const actionRepositoryMock = {
    create: jest.fn((data) => data),
    save: jest.fn(async (data: unknown) => ({
      actionId: 'act1',
      ...(data as object),
    })),
    findOne: jest.fn(),
    manager: {
      transaction: jest.fn(async (cb: (manager: unknown) => Promise<unknown>) =>
        cb(transactionManagerMock),
      ),
    },
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
  const gameNotifierClientMock = {
    notifyInquiryResult: jest.fn(),
  };
  const slackNotifierClientMock = {
    send: jest.fn(),
  };

  const callProcess = (inquiryId: string) =>
    (service as unknown as { process(id: string): Promise<void> }).process(
      inquiryId,
    );

  beforeEach(async () => {
    jest.clearAllMocks();
    actionUpdateQueryBuilderMock.execute.mockResolvedValue({ affected: 1 });
    inquiryRepositoryMock.count.mockResolvedValue(0);
    inquiryRepositoryMock.findOne.mockResolvedValue({ ...baseInquiry });
    quizSongRepositoryMock.findOne.mockResolvedValue({
      ...baseQuizSong,
      song: {
        ...baseQuizSong.song,
        songArtists: baseQuizSong.song.songArtists,
      },
    });
    gptClientMock.verifyConfidence.mockResolvedValue({
      confidence: 'HIGH',
      reason: '판단 근거',
    });
    // executeAction이 {before, after}를 구조분해하므로 기본값을 채워둔다 - 개별 테스트는
    // 필요하면 mockRejectedValue 등으로 덮어쓴다.
    actionServiceMock.changeStartTime.mockResolvedValue({
      before: {},
      after: {},
    });
    actionServiceMock.changeLink.mockResolvedValue({ before: {}, after: {} });
    actionServiceMock.addAnswer.mockResolvedValue({ before: {}, after: {} });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InquiryService,
        {
          provide: getRepositoryToken(Inquiry),
          useValue: inquiryRepositoryMock,
        },
        {
          provide: getRepositoryToken(InquiryAction),
          useValue: actionRepositoryMock,
        },
        {
          provide: getRepositoryToken(InquiryActionLog),
          useValue: actionLogRepositoryMock,
        },
        {
          provide: getRepositoryToken(QuizSong),
          useValue: quizSongRepositoryMock,
        },
        { provide: InquiryGptClient, useValue: gptClientMock },
        { provide: InquiryActionService, useValue: actionServiceMock },
        { provide: GameNotifierClient, useValue: gameNotifierClientMock },
        { provide: SlackNotifierClient, useValue: slackNotifierClientMock },
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
      expect(actionRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('매칭되는 함수가 없으면 NO_MATCH로 종료하고 소켓 알림/액션 생성은 하지 않는다', async () => {
      gptClientMock.classify.mockResolvedValue({
        matchedFunction: null,
        args: null,
      });

      await callProcess('iq1');

      expect(inquiryRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'NO_MATCH' }),
      );
      expect(gameNotifierClientMock.notifyInquiryResult).not.toHaveBeenCalled();
      expect(actionRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('신뢰도가 LOW면 InquiryAction도 REJECTED로 전이하고 REJECTED로 종료한다', async () => {
      gptClientMock.classify.mockResolvedValue({
        matchedFunction: 'CHANGE_START_TIME',
        args: { startSec: 30 },
      });
      gptClientMock.verifyConfidence.mockResolvedValue({
        confidence: 'LOW',
        reason: '근거 불충분',
      });

      await callProcess('iq1');

      expect(actionServiceMock.changeStartTime).not.toHaveBeenCalled();
      // PROPOSED로 생성(.save)한 뒤 REJECTED로 원자적 전이(.createQueryBuilder().update())한다.
      expect(actionRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'PROPOSED',
          actionType: 'CHANGE_START_TIME',
          confidence: 'LOW',
          aiReason: '근거 불충분',
        }),
      );
      expect(actionUpdateQueryBuilderMock.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'REJECTED' }),
      );
      expect(actionLogRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'REJECTED', source: 'SYSTEM' }),
      );
      expect(inquiryRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'REJECTED',
          resultMessage:
            '요청하신 내용은 반려되었습니다. 자동으로 처리하기 어려운 문의라 관리자가 다시 확인할게요.',
        }),
      );
      expect(gameNotifierClientMock.notifyInquiryResult).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user1', status: 'REJECTED' }),
      );
      expect(slackNotifierClientMock.send).not.toHaveBeenCalled();
    });

    it('신뢰도가 MEDIUM이면 조치를 실행하지 않고 액션/문의 모두 PENDING_REVIEW로 종료한다', async () => {
      gptClientMock.classify.mockResolvedValue({
        matchedFunction: 'CHANGE_START_TIME',
        args: { startSec: 30 },
      });
      gptClientMock.verifyConfidence.mockResolvedValue({
        confidence: 'MEDIUM',
        reason: '추정값',
      });

      await callProcess('iq1');

      expect(actionServiceMock.changeStartTime).not.toHaveBeenCalled();
      expect(actionUpdateQueryBuilderMock.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PENDING_REVIEW' }),
      );
      expect(inquiryRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'PENDING_REVIEW',
          resultMessage:
            '요청하신 내용이 검토 목록에 추가되었습니다. 확인 후 반영해드릴게요.',
        }),
      );
      expect(gameNotifierClientMock.notifyInquiryResult).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user1', status: 'PENDING_REVIEW' }),
      );
      expect(slackNotifierClientMock.send).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('MEDIUM') }),
      );
    });

    it('신뢰도가 HIGH면 조치를 실행하고 액션/문의 모두 COMPLETED로 종료한다', async () => {
      gptClientMock.classify.mockResolvedValue({
        matchedFunction: 'CHANGE_START_TIME',
        args: { startSec: 30 },
      });
      gptClientMock.verifyConfidence.mockResolvedValue({
        confidence: 'HIGH',
        reason: '명확한 요청',
      });
      actionServiceMock.changeStartTime.mockResolvedValue({
        before: { startSec: 10 },
        after: { startSec: 30 },
      });

      await callProcess('iq1');

      expect(actionServiceMock.changeStartTime).toHaveBeenCalledWith('qs1', {
        startSec: 30,
      });
      // PROPOSED는 .save()로 생성, APPROVED -> EXECUTING -> COMPLETED는 원자적 UPDATE 3회.
      expect(actionUpdateQueryBuilderMock.set).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          status: 'COMPLETED',
          beforeValue: { startSec: 10 },
          afterValue: { startSec: 30 },
        }),
      );
      expect(inquiryRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'COMPLETED',
          resultMessage: '요청하신 재생 시작 시간이 반영되었습니다.',
        }),
      );
      expect(gameNotifierClientMock.notifyInquiryResult).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user1', status: 'COMPLETED' }),
      );
    });

    it('조치 인자가 유효하지 않으면 액션/문의 모두 FAILED로 종료한다', async () => {
      gptClientMock.classify.mockResolvedValue({
        matchedFunction: 'CHANGE_START_TIME',
        args: { startSec: -10 },
      });

      await callProcess('iq1');

      expect(actionServiceMock.changeStartTime).not.toHaveBeenCalled();
      expect(actionUpdateQueryBuilderMock.set).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'FAILED' }),
      );
      expect(inquiryRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED', resultMessage: null }),
      );
    });

    it('조치 실행 중 예외가 발생하면 액션/문의 모두 FAILED로 종료한다', async () => {
      gptClientMock.classify.mockResolvedValue({
        matchedFunction: 'ADD_ANSWER',
        args: { answerTxt: '너닿', answerType: null },
      });
      actionServiceMock.addAnswer.mockRejectedValue(new Error('DB 오류'));

      await callProcess('iq1');

      expect(actionUpdateQueryBuilderMock.set).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'FAILED' }),
      );
      expect(inquiryRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED', resultMessage: null }),
      );
      expect(gameNotifierClientMock.notifyInquiryResult).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    const pendingAction = {
      actionId: 'act1',
      inquiryId: 'iq1',
      actionSeq: 1,
      actionType: 'CHANGE_START_TIME',
      actionArgs: { startSec: 30 },
      confidence: 'MEDIUM',
      status: 'PENDING_REVIEW',
    };
    const adminActor = { userKey: 'admin1' };

    beforeEach(() => {
      actionRepositoryMock.findOne.mockResolvedValue({ ...pendingAction });
    });

    it('문의를 찾을 수 없으면 404를 던진다', async () => {
      inquiryRepositoryMock.findOne.mockResolvedValue(null);

      await expect(service.approve('iq1', adminActor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('승인할 조치 정보가 없으면 400을 던진다', async () => {
      actionRepositoryMock.findOne.mockResolvedValue(null);

      await expect(service.approve('iq1', adminActor)).rejects.toThrow(
        BadRequestException,
      );
      expect(actionServiceMock.changeStartTime).not.toHaveBeenCalled();
    });

    it('검토 대기 상태가 아니어도 조치가 있으면 승인할 수 있다', async () => {
      actionRepositoryMock.findOne.mockResolvedValue({
        ...pendingAction,
        status: 'REJECTED',
      });

      await service.approve('iq1', adminActor);

      expect(actionServiceMock.changeStartTime).toHaveBeenCalledWith('qs1', {
        startSec: 30,
      });
      expect(inquiryRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'COMPLETED' }),
      );
    });

    it('ADD_ANSWER는 원자적 가드(WHERE status NOT IN (...))를 건다', async () => {
      actionRepositoryMock.findOne.mockResolvedValue({
        ...pendingAction,
        actionType: 'ADD_ANSWER',
        actionArgs: { answerTxt: '너닿', answerType: null },
      });

      await service.approve('iq1', adminActor);

      expect(actionUpdateQueryBuilderMock.andWhere).toHaveBeenCalledWith(
        'status NOT IN (:...statusNotIn)',
        { statusNotIn: ['APPROVED', 'EXECUTING', 'COMPLETED'] },
      );
    });

    it('CHANGE_START_TIME/CHANGE_LINK는 원자적 가드를 걸지 않는다(중복 실행 허용)', async () => {
      await service.approve('iq1', adminActor);

      expect(actionUpdateQueryBuilderMock.andWhere).not.toHaveBeenCalled();
    });

    it('ADD_ANSWER 승인이 동시 요청과 경쟁해 원자적 가드에 걸리면(affected: 0) 400을 던지고 조치를 실행하지 않는다', async () => {
      actionRepositoryMock.findOne.mockResolvedValue({
        ...pendingAction,
        status: 'COMPLETED',
        actionType: 'ADD_ANSWER',
        actionArgs: { answerTxt: '너닿', answerType: null },
      });
      // 실제 DB에서는 이미 다른 요청이 먼저 COMPLETED로 바꿔버린 상황을 흉내낸다 -
      // WHERE 조건이 더 이상 만족되지 않아 UPDATE가 0행에 반영된다.
      actionUpdateQueryBuilderMock.execute.mockResolvedValue({ affected: 0 });

      await expect(service.approve('iq1', adminActor)).rejects.toThrow(
        BadRequestException,
      );
      expect(actionServiceMock.addAnswer).not.toHaveBeenCalled();
      expect(actionLogRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('완료된 시간/링크 변경 문의는 재승인할 수 있다', async () => {
      actionRepositoryMock.findOne.mockResolvedValue({
        ...pendingAction,
        status: 'COMPLETED',
      });

      await service.approve('iq1', adminActor);

      expect(actionServiceMock.changeStartTime).toHaveBeenCalledWith('qs1', {
        startSec: 30,
      });
    });

    it('조치를 실행하고 액션/문의 모두 COMPLETED로 종료하며, 검토자 정보를 남긴다', async () => {
      await service.approve('iq1', adminActor);

      expect(actionServiceMock.changeStartTime).toHaveBeenCalledWith('qs1', {
        startSec: 30,
      });
      // APPROVED 전이 때만 reviewedVia/reviewedByUserKey를 SET한다(이후 EXECUTING/
      // COMPLETED UPDATE에는 그 컬럼을 다시 포함하지 않아도 DB에는 이미 반영된 값이
      // 그대로 남아있다 - 매번 SET하지 않아도 되는 이유).
      expect(actionUpdateQueryBuilderMock.set).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          status: 'APPROVED',
          reviewedVia: 'ADMIN',
          reviewedByUserKey: 'admin1',
        }),
      );
      expect(actionUpdateQueryBuilderMock.set).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'COMPLETED',
          executedDt: expect.any(Date),
        }),
      );
      expect(actionLogRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'APPROVED',
          source: 'ADMIN',
          actorUserKey: 'admin1',
        }),
      );
      expect(inquiryRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'COMPLETED',
          resultMessage: '요청하신 재생 시작 시간이 반영되었습니다.',
        }),
      );
      expect(gameNotifierClientMock.notifyInquiryResult).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user1', status: 'COMPLETED' }),
      );
    });

    it('조치 실행 중 예외가 발생하면 FAILED로 종료하고 400을 던진다', async () => {
      actionServiceMock.changeStartTime.mockRejectedValue(new Error('DB 오류'));

      await expect(service.approve('iq1', adminActor)).rejects.toThrow(
        BadRequestException,
      );
      expect(inquiryRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED' }),
      );
      expect(actionLogRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'FAILED',
          detail: expect.objectContaining({ stage: 'EXECUTE' }),
        }),
      );
    });

    it('실제 조치는 성공했지만 COMPLETED 기록이 실패하면 detail에 RECORD 단계로 남긴다', async () => {
      // APPROVED, EXECUTING까지는 성공하고 COMPLETED 전이(세 번째 UPDATE)만 실패시킨다.
      actionUpdateQueryBuilderMock.execute
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({ affected: 1 })
        .mockRejectedValueOnce(new Error('DB 커넥션 끊김'));

      await expect(service.approve('iq1', adminActor)).rejects.toThrow(
        BadRequestException,
      );

      expect(actionServiceMock.changeStartTime).toHaveBeenCalledWith('qs1', {
        startSec: 30,
      });
      expect(actionLogRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'FAILED',
          detail: expect.objectContaining({ stage: 'RECORD' }),
        }),
      );
    });
  });

  describe('reject', () => {
    const pendingAction = {
      actionId: 'act1',
      inquiryId: 'iq1',
      actionSeq: 1,
      actionType: 'ADD_ANSWER',
      actionArgs: { answerTxt: '너닿', answerType: null },
      confidence: 'MEDIUM',
      status: 'PENDING_REVIEW',
    };
    const adminActor = { userKey: 'admin1' };

    beforeEach(() => {
      actionRepositoryMock.findOne.mockResolvedValue({ ...pendingAction });
    });

    it('문의를 찾을 수 없으면 404를 던진다', async () => {
      inquiryRepositoryMock.findOne.mockResolvedValue(null);

      await expect(service.reject('iq1', adminActor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('원자적 가드(WHERE status IN (PENDING_REVIEW))를 건다', async () => {
      await service.reject('iq1', adminActor);

      expect(actionUpdateQueryBuilderMock.andWhere).toHaveBeenCalledWith(
        'status IN (:...statusIn)',
        { statusIn: ['PENDING_REVIEW'] },
      );
    });

    it('검토 대기 상태가 아니어서 원자적 가드에 걸리면(affected: 0) 400을 던진다', async () => {
      // 실제 DB에서는 이미 다른 요청이 승인/실행을 먼저 끝낸 상황을 흉내낸다.
      actionUpdateQueryBuilderMock.execute.mockResolvedValue({ affected: 0 });

      await expect(service.reject('iq1', adminActor)).rejects.toThrow(
        BadRequestException,
      );
      expect(actionLogRepositoryMock.save).not.toHaveBeenCalled();
      expect(inquiryRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('REJECTED로 종료하고 소켓으로 알리며 검토자 정보를 남긴다', async () => {
      await service.reject('iq1', adminActor);

      expect(actionServiceMock.addAnswer).not.toHaveBeenCalled();
      expect(actionUpdateQueryBuilderMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'REJECTED',
          reviewedVia: 'ADMIN',
          reviewedByUserKey: 'admin1',
        }),
      );
      expect(inquiryRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'REJECTED',
          resultMessage: '요청하신 내용은 검토 후 반려되었습니다.',
        }),
      );
      expect(gameNotifierClientMock.notifyInquiryResult).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user1', status: 'REJECTED' }),
      );
    });
  });
});
