import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OPENAI_MODEL } from '../openai/openai-chat.client';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { buildInquiryReviewSlackMessage } from './build-inquiry-review-slack-message';
import { SubmitInquiryRequestDto } from './dto/submit-inquiry-request.dto';
import { SubmitInquiryResponseDto } from './dto/submit-inquiry-response.dto';
import { InquiryActionLog } from './entities/inquiry-action-log.entity';
import { InquiryAction } from './entities/inquiry-action.entity';
import { Inquiry } from './entities/inquiry.entity';
import { GameNotifierClient } from './game-notifier.client';
import {
  InquiryActionService,
  InquiryActionSnapshot,
} from './inquiry-action.service';
import { INQUIRY_PROMPT_VERSION } from './inquiry-gpt.prompt';
import { InquiryGptClient, InquirySongContext } from './inquiry-gpt.client';
import {
  AddAnswerArgs,
  ChangeLinkArgs,
  ChangeStartTimeArgs,
  InquiryActionLogSource,
  InquiryActionStatus,
  InquiryConfidence,
  InquiryFunctionName,
  InquiryReviewActor,
  InquiryStatus,
} from './inquiry.types';
import { SlackNotifierClient } from './slack-notifier.client';

const MAX_INQUIRIES_PER_GAME = 5;
const RECEIVED_MESSAGE = '문의가 접수되었습니다. 확인 후 알려드릴게요.';
const REJECTED_MESSAGE =
  '요청하신 내용은 반려되었습니다. 자동으로 처리하기 어려운 문의라 관리자가 다시 확인할게요.';
const PENDING_REVIEW_MESSAGE =
  '요청하신 내용이 검토 목록에 추가되었습니다. 확인 후 반영해드릴게요.';
const ADMIN_REJECTED_MESSAGE = '요청하신 내용은 검토 후 반려되었습니다.';

class InquiryArgsValidationError extends Error {}

interface ActionTransitionExtra {
  reviewedVia?: InquiryAction['reviewedVia'];
  reviewedByUserKey?: string | null;
  reviewedDt?: Date | null;
  executedDt?: Date | null;
  beforeValue?: Record<string, unknown> | null;
  afterValue?: Record<string, unknown> | null;
  actorUserKey?: string | null;
  slackTeamId?: string | null;
  slackUserId?: string | null;
  detail?: Record<string, unknown> | null;
  /** 지정하면 현재 STATUS가 이 목록 중 하나일 때만 UPDATE가 실제로 반영된다(원자적 CAS). */
  guardStatusIn?: InquiryActionStatus[];
  /** 지정하면 현재 STATUS가 이 목록에 없을 때만 UPDATE가 실제로 반영된다(원자적 CAS). */
  guardStatusNotIn?: InquiryActionStatus[];
}

@Injectable()
export class InquiryService {
  private readonly logger = new Logger(InquiryService.name);

  constructor(
    @InjectRepository(Inquiry)
    private readonly inquiryRepository: Repository<Inquiry>,
    @InjectRepository(InquiryAction)
    private readonly actionRepository: Repository<InquiryAction>,
    @InjectRepository(InquiryActionLog)
    private readonly actionLogRepository: Repository<InquiryActionLog>,
    @InjectRepository(QuizSong)
    private readonly quizSongRepository: Repository<QuizSong>,
    private readonly gptClient: InquiryGptClient,
    private readonly actionService: InquiryActionService,
    private readonly gameNotifierClient: GameNotifierClient,
    private readonly slackNotifierClient: SlackNotifierClient,
  ) {}

  async submit(
    dto: SubmitInquiryRequestDto,
  ): Promise<SubmitInquiryResponseDto> {
    const submittedCount = await this.inquiryRepository.count({
      where: { roomId: dto.roomId, userId: dto.userId },
    });
    if (submittedCount >= MAX_INQUIRIES_PER_GAME) {
      throw new BadRequestException(
        `한 게임에서 남길 수 있는 문의는 최대 ${MAX_INQUIRIES_PER_GAME}건입니다.`,
      );
    }

    const inquiry = await this.inquiryRepository.save(
      this.inquiryRepository.create({
        quizSongId: dto.quizSongId,
        roomId: dto.roomId,
        userId: dto.userId,
        content: dto.content,
        status: 'RECEIVED',
      }),
    );

    void this.process(inquiry.inquiryId).catch((error: unknown) => {
      this.logger.error(
        `문의 처리 파이프라인 실패(inquiryId: ${inquiry.inquiryId})`,
        error,
      );
    });

    return { inquiryId: inquiry.inquiryId, message: RECEIVED_MESSAGE };
  }

  /**
   * 관리자/Slack이 문의를 승인한다: 판별된 조치를 실제로 실행하고 완료 처리한다.
   * CHANGE_START_TIME/CHANGE_LINK는 현재 액션 상태와 무관하게(재실행 포함) 승인할 수
   * 있다 - 의도된 동작이다(관리자가 몇 번이고 다시 반영할 수 있어야 함, 결과도
   * 멱등적이다). ADD_ANSWER만 재승인 시 정답이 중복으로 추가되므로 막아야 하는데,
   * 동시에 두 번 승인 요청이 들어오는 경우까지 막으려면 "이미 완료됐는지 확인 후
   * 승인 처리"가 아니라 DB UPDATE 자체의 WHERE 조건으로 원자적으로 막아야 한다
   * (그렇지 않으면 두 요청이 모두 확인을 통과한 뒤 둘 다 정답을 추가할 수 있다).
   * 설계 배경: ADR-0008.
   */
  async approve(inquiryId: string, actor: InquiryReviewActor): Promise<void> {
    const inquiry = await this.findInquiryOrThrow(inquiryId);
    const action = await this.findLatestActionOrThrow(inquiryId);

    const claimed = await this.transitionAction(action, 'APPROVED', actor.via, {
      reviewedVia: actor.via,
      reviewedByUserKey: actor.via === 'ADMIN' ? actor.userKey : null,
      reviewedDt: new Date(),
      actorUserKey: actor.via === 'ADMIN' ? actor.userKey : null,
      slackTeamId: actor.via === 'SLACK' ? actor.slackTeamId : null,
      slackUserId: actor.via === 'SLACK' ? actor.slackUserId : null,
      guardStatusNotIn:
        action.actionType === 'ADD_ANSWER'
          ? ['APPROVED', 'EXECUTING', 'COMPLETED']
          : undefined,
    });
    if (!claimed) {
      throw new BadRequestException(
        `이미 완료된 정답 추가 문의는 다시 승인할 수 없습니다. (inquiryId: ${inquiryId})`,
      );
    }

    try {
      await this.executeAndFinish(inquiry, action, inquiry.quizSongId);
    } catch {
      throw new BadRequestException(
        `조치 실행에 실패했습니다. (inquiryId: ${inquiryId})`,
      );
    }
  }

  /**
   * 검토 대기 문의를 관리자/Slack이 반려한다. PENDING_REVIEW인지 먼저 확인하고 나서
   * REJECTED로 바꾸는 게 아니라, UPDATE의 WHERE 조건으로 원자적으로 처리한다 - 그렇지
   * 않으면 동시에 승인이 먼저 실행돼 버린 뒤에도 반려가 뒤늦게 성공해서(반려 우회)
   * "이미 실행된 조치가 REJECTED로 표시되는" 상태 불일치가 생길 수 있다.
   * 설계 배경: ADR-0008.
   */
  async reject(inquiryId: string, actor: InquiryReviewActor): Promise<void> {
    const inquiry = await this.findInquiryOrThrow(inquiryId);
    const action = await this.findLatestActionOrThrow(inquiryId);

    const claimed = await this.transitionAction(action, 'REJECTED', actor.via, {
      reviewedVia: actor.via,
      reviewedByUserKey: actor.via === 'ADMIN' ? actor.userKey : null,
      reviewedDt: new Date(),
      actorUserKey: actor.via === 'ADMIN' ? actor.userKey : null,
      slackTeamId: actor.via === 'SLACK' ? actor.slackTeamId : null,
      slackUserId: actor.via === 'SLACK' ? actor.slackUserId : null,
      guardStatusIn: ['PENDING_REVIEW'],
    });
    if (!claimed) {
      throw new BadRequestException(
        `검토 대기 상태의 문의만 처리할 수 있습니다. (inquiryId: ${inquiryId})`,
      );
    }

    await this.finish(inquiry, 'REJECTED', ADMIN_REJECTED_MESSAGE);
  }

  private async findInquiryOrThrow(inquiryId: string): Promise<Inquiry> {
    const inquiry = await this.inquiryRepository.findOne({
      where: { inquiryId },
    });
    if (!inquiry) {
      throw new NotFoundException(
        `문의를 찾을 수 없습니다. (inquiryId: ${inquiryId})`,
      );
    }
    return inquiry;
  }

  private async findLatestActionOrThrow(
    inquiryId: string,
  ): Promise<InquiryAction> {
    const action = await this.actionRepository.findOne({
      where: { inquiryId },
      order: { actionSeq: 'DESC' },
    });
    if (!action) {
      throw new BadRequestException(
        `승인/반려할 조치 정보가 없습니다. (inquiryId: ${inquiryId})`,
      );
    }
    return action;
  }

  private async process(inquiryId: string): Promise<void> {
    const inquiry = await this.inquiryRepository.findOne({
      where: { inquiryId },
    });
    if (!inquiry) {
      return;
    }

    const quizSong = await this.quizSongRepository.findOne({
      where: { quizSongId: inquiry.quizSongId },
      relations: { song: { artist: true } },
    });
    if (!quizSong) {
      await this.finish(inquiry, 'FAILED', null);
      return;
    }

    const songContext: InquirySongContext = {
      quizSongId: quizSong.quizSongId,
      songNm: quizSong.song.songNm,
      atstNm: quizSong.song.artist.atstNm,
      startSec: quizSong.startSec,
      youtubeUrl: quizSong.youtubeUrl,
      durationSec: quizSong.durationSec,
    };

    const classifyResult = await this.gptClient.classify(
      songContext,
      inquiry.content,
    );
    if (!classifyResult.matchedFunction || !classifyResult.args) {
      await this.finish(inquiry, 'NO_MATCH', null);
      return;
    }

    const { matchedFunction, args } = classifyResult;
    const { confidence, reason } = await this.gptClient.verifyConfidence(
      matchedFunction,
      songContext,
      inquiry.content,
      args,
    );

    const action = await this.actionRepository.save(
      this.actionRepository.create({
        inquiryId: inquiry.inquiryId,
        actionSeq: 1,
        actionType: matchedFunction,
        actionArgs: args,
        confidence,
        aiModel: OPENAI_MODEL,
        promptVersion: INQUIRY_PROMPT_VERSION,
        aiReason: reason,
        status: 'PROPOSED',
      }),
    );
    await this.actionLogRepository.save(
      this.actionLogRepository.create({
        actionId: action.actionId,
        inquiryId: action.inquiryId,
        eventType: 'PROPOSED',
        source: 'AI',
      }),
    );

    if (confidence === 'LOW') {
      await this.transitionAction(action, 'REJECTED', 'SYSTEM');
      await this.finish(inquiry, 'REJECTED', REJECTED_MESSAGE);
      return;
    }

    if (confidence === 'MEDIUM') {
      await this.transitionAction(action, 'PENDING_REVIEW', 'SYSTEM');
      await this.finish(inquiry, 'PENDING_REVIEW', PENDING_REVIEW_MESSAGE);
      await this.slackNotifierClient.send(
        buildInquiryReviewSlackMessage({
          inquiryId: inquiry.inquiryId,
          content: inquiry.content,
          song: songContext,
          matchedFunction,
          args,
        }),
      );
      return;
    }

    // HIGH: 사람 검토 없이 즉시 승인/실행한다.
    await this.transitionAction(action, 'APPROVED', 'SYSTEM');
    try {
      await this.executeAndFinish(inquiry, action, quizSong.quizSongId);
    } catch {
      // executeAndFinish가 이미 액션/문의 상태를 FAILED로 마무리하고 로깅했다.
    }
  }

  /** EXECUTING으로 전이 후 실제 조치를 실행하고, 성공/실패에 따라 액션과 문의 상태를 마무리한다. 실패 시 원본 에러를 다시 던진다. */
  private async executeAndFinish(
    inquiry: Inquiry,
    action: InquiryAction,
    quizSongId: string,
  ): Promise<void> {
    await this.transitionAction(action, 'EXECUTING', 'SYSTEM');
    try {
      const { before, after } = await this.executeAction(
        action.actionType,
        quizSongId,
        action.actionArgs ?? {},
        action.confidence ?? 'HIGH',
      );
      await this.transitionAction(action, 'COMPLETED', 'SYSTEM', {
        executedDt: new Date(),
        beforeValue: before,
        afterValue: after,
      });
      await this.finish(
        inquiry,
        'COMPLETED',
        this.buildSuccessMessage(action.actionType),
      );
    } catch (error) {
      this.logger.error(
        `문의 조치 실행 실패(inquiryId: ${inquiry.inquiryId})`,
        error,
      );
      await this.transitionAction(action, 'FAILED', 'SYSTEM', {
        detail: { error: (error as Error).message },
      });
      await this.finish(inquiry, 'FAILED', null);
      throw error;
    }
  }

  /**
   * InquiryAction의 상태를 바꿔 저장하고, 같은 전이를 감사 로그(SQ_INQUIRY_ACTION_LOG)
   * 한 건으로 남긴다. guardStatusIn/guardStatusNotIn을 주면 "현재 상태 확인 후 저장"이
   * 아니라 UPDATE 문 자체의 WHERE 조건으로 원자적으로 처리한다 - MySQL은 UPDATE 실행
   * 중 해당 행에 락을 걸므로, 동시에 들어온 다른 요청은 이 트랜잭션이 끝날 때까지
   * 대기했다가 바뀐 상태 기준으로 WHERE를 다시 평가받는다(TOCTOU 경쟁 상태 방지).
   * 가드 조건 때문에 실제로 반영되지 않았으면 false를 반환하고 아무것도 하지 않는다.
   */
  private async transitionAction(
    action: InquiryAction,
    status: InquiryActionStatus,
    source: InquiryActionLogSource,
    extra?: ActionTransitionExtra,
  ): Promise<boolean> {
    const qb = this.actionRepository
      .createQueryBuilder()
      .update(InquiryAction)
      .set({
        status,
        ...(extra?.reviewedVia !== undefined && {
          reviewedVia: extra.reviewedVia,
        }),
        ...(extra?.reviewedByUserKey !== undefined && {
          reviewedByUserKey: extra.reviewedByUserKey,
        }),
        ...(extra?.reviewedDt !== undefined && {
          reviewedDt: extra.reviewedDt,
        }),
        ...(extra?.executedDt !== undefined && {
          executedDt: extra.executedDt,
        }),
        ...(extra?.beforeValue !== undefined && {
          beforeValue: extra.beforeValue,
        }),
        ...(extra?.afterValue !== undefined && {
          afterValue: extra.afterValue,
        }),
      })
      .where('actionId = :id', { id: action.actionId });
    if (extra?.guardStatusIn) {
      qb.andWhere('status IN (:...statusIn)', {
        statusIn: extra.guardStatusIn,
      });
    }
    if (extra?.guardStatusNotIn) {
      qb.andWhere('status NOT IN (:...statusNotIn)', {
        statusNotIn: extra.guardStatusNotIn,
      });
    }
    const result = await qb.execute();
    if (!result.affected) {
      return false;
    }

    action.status = status;
    if (extra?.reviewedVia !== undefined)
      action.reviewedVia = extra.reviewedVia;
    if (extra?.reviewedByUserKey !== undefined)
      action.reviewedByUserKey = extra.reviewedByUserKey;
    if (extra?.reviewedDt !== undefined) action.reviewedDt = extra.reviewedDt;
    if (extra?.executedDt !== undefined) action.executedDt = extra.executedDt;
    if (extra?.beforeValue !== undefined)
      action.beforeValue = extra.beforeValue;
    if (extra?.afterValue !== undefined) action.afterValue = extra.afterValue;

    await this.actionLogRepository.save(
      this.actionLogRepository.create({
        actionId: action.actionId,
        inquiryId: action.inquiryId,
        eventType: status,
        source,
        actorUserKey: extra?.actorUserKey ?? null,
        slackTeamId: extra?.slackTeamId ?? null,
        slackUserId: extra?.slackUserId ?? null,
        beforeValue: extra?.beforeValue ?? null,
        afterValue: extra?.afterValue ?? null,
        detail: extra?.detail ?? null,
      }),
    );
    return true;
  }

  private async executeAction(
    functionName: InquiryFunctionName,
    quizSongId: string,
    args: Record<string, unknown>,
    confidence: InquiryConfidence,
  ): Promise<InquiryActionSnapshot> {
    switch (functionName) {
      case 'CHANGE_START_TIME':
        return this.actionService.changeStartTime(
          quizSongId,
          this.parseChangeStartTimeArgs(args),
        );
      case 'CHANGE_LINK':
        return this.actionService.changeLink(
          quizSongId,
          this.parseChangeLinkArgs(args),
        );
      case 'ADD_ANSWER':
        return this.actionService.addAnswer(
          quizSongId,
          this.parseAddAnswerArgs(args),
          confidence,
        );
    }
  }

  private parseChangeStartTimeArgs(
    args: Record<string, unknown>,
  ): ChangeStartTimeArgs {
    const startSec = Number(args.startSec);
    if (!Number.isFinite(startSec) || startSec < 0) {
      throw new InquiryArgsValidationError(
        `startSec 값이 올바르지 않습니다: ${String(args.startSec)}`,
      );
    }
    return { startSec: Math.round(startSec) };
  }

  private parseChangeLinkArgs(args: Record<string, unknown>): ChangeLinkArgs {
    const youtubeUrl = args.youtubeUrl;
    if (typeof youtubeUrl !== 'string' || youtubeUrl.trim().length === 0) {
      throw new InquiryArgsValidationError(
        `youtubeUrl 값이 올바르지 않습니다: ${String(args.youtubeUrl)}`,
      );
    }
    return { youtubeUrl: youtubeUrl.trim() };
  }

  private parseAddAnswerArgs(args: Record<string, unknown>): AddAnswerArgs {
    const answerTxt = args.answerTxt;
    if (typeof answerTxt !== 'string' || answerTxt.trim().length === 0) {
      throw new InquiryArgsValidationError(
        `answerTxt 값이 올바르지 않습니다: ${String(args.answerTxt)}`,
      );
    }
    const answerType = args.answerType;
    return {
      answerTxt: answerTxt.trim(),
      answerType:
        typeof answerType === 'string' && answerType.trim().length > 0
          ? answerType.trim()
          : null,
    };
  }

  private buildSuccessMessage(functionName: InquiryFunctionName): string {
    switch (functionName) {
      case 'CHANGE_START_TIME':
        return '요청하신 재생 시작 시간이 반영되었습니다.';
      case 'CHANGE_LINK':
        return '요청하신 링크로 교체되었습니다.';
      case 'ADD_ANSWER':
        return '요청하신 답안이 정답으로 추가되었습니다.';
    }
  }

  /**
   * NO_MATCH/FAILED는 DB에만 기록하고(침묵),
   * REJECTED/PENDING_REVIEW/COMPLETED만 유저에게 소켓으로 알린다.
   */
  private async finish(
    inquiry: Inquiry,
    status: InquiryStatus,
    resultMessage: string | null,
  ): Promise<void> {
    inquiry.status = status;
    inquiry.resultMessage = resultMessage;
    await this.inquiryRepository.save(inquiry);

    if (
      status === 'REJECTED' ||
      status === 'PENDING_REVIEW' ||
      status === 'COMPLETED'
    ) {
      await this.gameNotifierClient.notifyInquiryResult({
        userId: inquiry.userId,
        inquiryId: inquiry.inquiryId,
        status,
        message: resultMessage ?? '',
      });
    }
  }
}
