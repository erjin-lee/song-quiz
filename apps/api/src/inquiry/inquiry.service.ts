import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { RoomGateway } from '../room/room.gateway';
import { SubmitInquiryRequestDto } from './dto/submit-inquiry-request.dto';
import { SubmitInquiryResponseDto } from './dto/submit-inquiry-response.dto';
import { Inquiry } from './entities/inquiry.entity';
import { InquiryActionService } from './inquiry-action.service';
import { InquiryGptClient, InquirySongContext } from './inquiry-gpt.client';
import {
  AddAnswerArgs,
  ChangeLinkArgs,
  ChangeStartTimeArgs,
  InquiryConfidence,
  InquiryFunctionName,
  InquiryStatus,
} from './inquiry.types';

const MAX_INQUIRIES_PER_GAME = 5;
const RECEIVED_MESSAGE = '문의가 접수되었습니다. 확인 후 알려드릴게요.';
const REJECTED_MESSAGE =
  '요청 내용을 확인했지만 자동으로 처리하기 어려운 문의예요. 관리자가 다시 확인할게요.';

class InquiryArgsValidationError extends Error {}

@Injectable()
export class InquiryService {
  private readonly logger = new Logger(InquiryService.name);

  constructor(
    @InjectRepository(Inquiry)
    private readonly inquiryRepository: Repository<Inquiry>,
    @InjectRepository(QuizSong)
    private readonly quizSongRepository: Repository<QuizSong>,
    private readonly gptClient: InquiryGptClient,
    private readonly actionService: InquiryActionService,
    private readonly roomGateway: RoomGateway,
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
      await this.finish(inquiry, 'FAILED', null, null, null, null);
      return;
    }

    const songContext: InquirySongContext = {
      quizSongId: quizSong.quizSongId,
      songNm: quizSong.song.songNm,
      atstNm: quizSong.song.artist.atstNm,
      startSec: quizSong.startSec,
      youtubeUrl: quizSong.youtubeUrl,
    };

    const classifyResult = await this.gptClient.classify(
      songContext,
      inquiry.content,
    );
    if (!classifyResult.matchedFunction || !classifyResult.args) {
      await this.finish(inquiry, 'NO_MATCH', null, null, null, null);
      return;
    }

    const { matchedFunction, args } = classifyResult;
    const confidence = await this.gptClient.verifyConfidence(
      matchedFunction,
      songContext,
      inquiry.content,
      args,
    );

    if (confidence === 'LOW') {
      await this.finish(
        inquiry,
        'REJECTED',
        matchedFunction,
        args,
        confidence,
        REJECTED_MESSAGE,
      );
      return;
    }

    try {
      await this.executeAction(
        matchedFunction,
        quizSong.quizSongId,
        args,
        confidence,
      );
      await this.finish(
        inquiry,
        'COMPLETED',
        matchedFunction,
        args,
        confidence,
        this.buildSuccessMessage(matchedFunction),
      );
    } catch (error) {
      this.logger.error(`문의 조치 실행 실패(inquiryId: ${inquiryId})`, error);
      await this.finish(
        inquiry,
        'FAILED',
        matchedFunction,
        args,
        confidence,
        null,
      );
    }
  }

  private async executeAction(
    functionName: InquiryFunctionName,
    quizSongId: string,
    args: Record<string, unknown>,
    confidence: InquiryConfidence,
  ): Promise<void> {
    switch (functionName) {
      case 'CHANGE_START_TIME':
        await this.actionService.changeStartTime(
          quizSongId,
          this.parseChangeStartTimeArgs(args),
        );
        return;
      case 'CHANGE_LINK':
        await this.actionService.changeLink(
          quizSongId,
          this.parseChangeLinkArgs(args),
        );
        return;
      case 'ADD_ANSWER':
        await this.actionService.addAnswer(
          quizSongId,
          this.parseAddAnswerArgs(args),
          confidence,
        );
        return;
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

  /** NO_MATCH/FAILED는 DB에만 기록하고(침묵), REJECTED/COMPLETED만 유저에게 소켓으로 알린다. */
  private async finish(
    inquiry: Inquiry,
    status: InquiryStatus,
    matchedFunction: InquiryFunctionName | null,
    matchedArgs: Record<string, unknown> | null,
    confidence: InquiryConfidence | null,
    resultMessage: string | null,
  ): Promise<void> {
    inquiry.status = status;
    inquiry.matchedFunction = matchedFunction;
    inquiry.matchedArgs = matchedArgs;
    inquiry.confidence = confidence;
    inquiry.resultMessage = resultMessage;
    await this.inquiryRepository.save(inquiry);

    if (status === 'REJECTED' || status === 'COMPLETED') {
      this.roomGateway.emitInquiryResult(inquiry.userId, {
        inquiryId: inquiry.inquiryId,
        status,
        message: resultMessage ?? '',
      });
    }
  }
}
