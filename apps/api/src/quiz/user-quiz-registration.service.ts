import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  NotificationService,
  CreateNotificationParams,
} from '../notification/notification.service';
import { NotificationType } from '../notification/notification.constants';
import { UserService } from '../user/user.service';
import {
  buildYoutubeWatchUrl,
  parseYoutubeUrl,
} from '../common/youtube-url.util';
import { CreateQuizRequestDto } from './dto/create-quiz-request.dto';
import { CreateQuizResultDto } from './dto/create-quiz-result.dto';
import { CreateQuizSongInputDto } from './dto/create-quiz-song-input.dto';
import { RegistrationEligibilityDto } from './dto/registration-eligibility.dto';
import { QuizAnswer } from './entities/quiz-answer.entity';
import { QuizArtist } from './entities/quiz-artist.entity';
import { QuizSong } from './entities/quiz-song.entity';
import { Quiz } from './entities/quiz.entity';
import { Song } from './entities/song.entity';
import {
  MIN_USER_QUIZ_SONG_COUNT,
  QUIZ_REGISTRATION_INTERVAL_MS,
} from './quiz.constants';
import { YoutubeLinkValidationService } from './youtube-link-validation.service';

interface ExcludedSongInfo {
  songNm: string;
  reason: string;
}

/**
 * 로그인 유저의 퀴즈 등록(docs/features/user-quiz-registration/spec.md 3.3, 3.7,
 * 3.8). POST /quizzes는 이미 곡별 즉시 검증(youtube-link-validation.service.ts)을
 * 통과한 데이터로 곧바로 퀴즈를 만들고 응답한 뒤, 안전망 재검증은 응답 후
 * 백그라운드에서 진행한다.
 */
@Injectable()
export class UserQuizRegistrationService {
  private readonly logger = new Logger(UserQuizRegistrationService.name);

  constructor(
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    @InjectRepository(QuizSong)
    private readonly quizSongRepository: Repository<QuizSong>,
    @InjectRepository(QuizAnswer)
    private readonly quizAnswerRepository: Repository<QuizAnswer>,
    @InjectRepository(QuizArtist)
    private readonly quizArtistRepository: Repository<QuizArtist>,
    @InjectRepository(Song)
    private readonly songRepository: Repository<Song>,
    private readonly userService: UserService,
    private readonly youtubeLinkValidationService: YoutubeLinkValidationService,
    private readonly notificationService: NotificationService,
  ) {}

  async getEligibility(userId: string): Promise<RegistrationEligibilityDto> {
    const userKey = await this.resolveUserKey(userId);
    return this.computeEligibility(userKey);
  }

  async createQuiz(
    userId: string,
    dto: CreateQuizRequestDto,
  ): Promise<CreateQuizResultDto> {
    const userKey = await this.resolveUserKey(userId);
    this.validateSongsInput(dto.songs);

    const eligibility = await this.computeEligibility(userKey);
    if (!eligibility.eligible) {
      throw new HttpException(
        {
          message: `아직 등록할 수 없습니다. ${Math.ceil(eligibility.remainingSeconds / 60)}분 후 다시 시도해주세요.`,
          remainingSeconds: eligibility.remainingSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const songById = await this.resolveSongsOrThrow(
      dto.songs.map((song) => song.songId),
    );

    const quiz = await this.quizRepository.save(
      this.quizRepository.create({
        quizTtl: dto.quizTtl,
        quizDesc: dto.quizDesc ?? null,
        crtUserKey: userKey,
      }),
    );

    const quizSongs = await this.saveQuizSongsAndAnswers(
      quiz.quizId,
      dto.songs,
    );
    await this.populateQuizArtists(quiz.quizId, Array.from(songById.values()));

    // 응답을 기다리게 하지 않고 안전망 재검증은 백그라운드에서 진행한다.
    void this.runBackgroundSafetyNet(
      quiz.quizId,
      userKey,
      dto.quizTtl,
      dto.songs,
      quizSongs,
      songById,
    );

    return { quizId: quiz.quizId };
  }

  async updateQuiz(
    userId: string,
    quizId: string,
    dto: CreateQuizRequestDto,
  ): Promise<CreateQuizResultDto> {
    const userKey = await this.resolveUserKey(userId);
    const quiz = await this.getOwnedQuizOrThrow(quizId, userKey);
    this.validateSongsInput(dto.songs);

    const songById = await this.resolveSongsOrThrow(
      dto.songs.map((song) => song.songId),
    );

    quiz.quizTtl = dto.quizTtl;
    quiz.quizDesc = dto.quizDesc ?? null;
    await this.quizRepository.save(quiz);

    // 기존 출제곡/정답/아티스트 연결을 전부 지우고 새 목록으로 다시 만든다 -
    // 클라이언트가 계산한 최종 리스트를 그대로 반영하는 게 스펙 의도라, 부분
    // upsert로 곡 순서·추가/삭제를 각각 맞추는 것보다 이 편이 훨씬 단순하다.
    const existingQuizSongIds = (
      await this.quizSongRepository.find({
        where: { quizId },
        select: { quizSongId: true },
      })
    ).map((quizSong) => quizSong.quizSongId);
    if (existingQuizSongIds.length > 0) {
      await this.quizAnswerRepository.delete({
        quizSongId: In(existingQuizSongIds),
      });
    }
    await this.quizSongRepository.delete({ quizId });
    await this.quizArtistRepository.delete({ quizId });

    const quizSongs = await this.saveQuizSongsAndAnswers(quizId, dto.songs);
    await this.populateQuizArtists(quizId, Array.from(songById.values()));

    void this.runBackgroundSafetyNet(
      quizId,
      userKey,
      dto.quizTtl,
      dto.songs,
      quizSongs,
      songById,
    );

    return { quizId };
  }

  async deleteQuiz(userId: string, quizId: string): Promise<void> {
    const userKey = await this.resolveUserKey(userId);
    const quiz = await this.getOwnedQuizOrThrow(quizId, userKey);
    quiz.useYn = 'N';
    await this.quizRepository.save(quiz);
  }

  private async getOwnedQuizOrThrow(
    quizId: string,
    userKey: string,
  ): Promise<Quiz> {
    const quiz = await this.quizRepository.findOne({ where: { quizId } });
    if (!quiz) {
      throw new NotFoundException(
        `퀴즈를 찾을 수 없습니다. (quizId: ${quizId})`,
      );
    }
    if (quiz.crtUserKey !== userKey) {
      throw new ForbiddenException(
        '본인이 등록한 퀴즈만 수정/삭제할 수 있습니다.',
      );
    }
    return quiz;
  }

  private validateSongsInput(songs: CreateQuizSongInputDto[]): void {
    if (songs.length < MIN_USER_QUIZ_SONG_COUNT) {
      throw new BadRequestException(
        `퀴즈는 최소 ${MIN_USER_QUIZ_SONG_COUNT}곡 이상이어야 합니다.`,
      );
    }
    const songIds = songs.map((song) => song.songId);
    if (new Set(songIds).size !== songIds.length) {
      throw new BadRequestException('같은 곡이 중복으로 담겨 있습니다.');
    }
  }

  private async resolveSongsOrThrow(
    songIds: string[],
  ): Promise<Map<string, Song>> {
    const songs = await this.songRepository.findBy({ songId: In(songIds) });
    if (songs.length !== songIds.length) {
      throw new NotFoundException('존재하지 않는 곡이 포함되어 있습니다.');
    }
    return new Map(songs.map((song) => [song.songId, song]));
  }

  private async saveQuizSongsAndAnswers(
    quizId: string,
    songs: CreateQuizSongInputDto[],
  ): Promise<QuizSong[]> {
    const quizSongs: QuizSong[] = [];
    let quizSeq = 1;
    for (const songInput of songs) {
      // 저장 값은 항상 videoId에서 다시 만든 URL을 쓴다(ADR-0009) - 클라이언트가
      // 보낸 문자열을 그대로 믿지 않는다.
      const { videoId } = parseYoutubeUrl(songInput.youtubeUrl);
      const normalizedUrl = videoId
        ? buildYoutubeWatchUrl(videoId, songInput.startSec)
        : songInput.youtubeUrl;

      const quizSong = await this.quizSongRepository.save(
        this.quizSongRepository.create({
          quizId,
          songId: songInput.songId,
          quizSeq: quizSeq++,
          youtubeUrl: normalizedUrl,
          youtubeVideoId: songInput.youtubeVideoId,
          durationSec: songInput.durationSec ?? null,
          startSec: songInput.startSec,
          endSec: songInput.endSec,
        }),
      );
      quizSongs.push(quizSong);

      await this.quizAnswerRepository.save(
        songInput.answers.map((answerTxt) =>
          this.quizAnswerRepository.create({
            quizSongId: quizSong.quizSongId,
            answerTxt,
          }),
        ),
      );
    }
    return quizSongs;
  }

  private async computeEligibility(
    userKey: string,
  ): Promise<RegistrationEligibilityDto> {
    const lastQuiz = await this.quizRepository.findOne({
      where: { crtUserKey: userKey },
      order: { crtDt: 'DESC' },
    });
    if (!lastQuiz) {
      return { eligible: true, remainingSeconds: 0 };
    }

    const remainingMs =
      QUIZ_REGISTRATION_INTERVAL_MS - (Date.now() - lastQuiz.crtDt.getTime());
    if (remainingMs <= 0) {
      return { eligible: true, remainingSeconds: 0 };
    }
    return {
      eligible: false,
      remainingSeconds: Math.ceil(remainingMs / 1000),
    };
  }

  private async populateQuizArtists(
    quizId: string,
    songs: Song[],
  ): Promise<void> {
    if (songs.length === 0) {
      return;
    }
    const songsWithMainArtist = await this.songRepository
      .createQueryBuilder('song')
      .innerJoinAndSelect(
        'song.songArtists',
        'songArtist',
        'songArtist.mainYn = :mainYn',
        { mainYn: 'Y' },
      )
      .where('song.songId IN (:...songIds)', {
        songIds: songs.map((song) => song.songId),
      })
      .getMany();

    const atstIds = new Set(
      songsWithMainArtist.flatMap((song) =>
        song.songArtists.map((songArtist) => songArtist.atstId),
      ),
    );
    if (atstIds.size === 0) {
      return;
    }

    await this.quizArtistRepository.save(
      Array.from(atstIds).map((atstId) =>
        this.quizArtistRepository.create({ quizId, atstId }),
      ),
    );
  }

  private async runBackgroundSafetyNet(
    quizId: string,
    userKey: string,
    quizTtl: string,
    songInputs: CreateQuizRequestDto['songs'],
    quizSongs: QuizSong[],
    songById: Map<string, Song>,
  ): Promise<void> {
    try {
      const excluded: ExcludedSongInfo[] = [];

      for (let i = 0; i < quizSongs.length; i++) {
        const quizSong = quizSongs[i];
        const songInput = songInputs[i];
        const song = songById.get(quizSong.songId);
        if (!song) {
          continue;
        }

        const result = await this.youtubeLinkValidationService
          .validate(quizSong.youtubeUrl, song.songNm, {
            skipContentCheck: songInput.linkSource === 'AUTO',
          })
          .catch((error) => {
            this.logger.warn(
              `안전망 재검증 실패(quizSongId: ${quizSong.quizSongId})`,
              error,
            );
            return null;
          });

        if (!result || !result.valid) {
          excluded.push({
            songNm: song.songNm,
            reason: result?.reason ?? '링크를 확인할 수 없습니다.',
          });
          await this.quizAnswerRepository.delete({
            quizSongId: quizSong.quizSongId,
          });
          await this.quizSongRepository.delete({
            quizSongId: quizSong.quizSongId,
          });
        }
      }

      await this.sendCompletionNotification(userKey, quizId, quizTtl, excluded);
    } catch (error) {
      this.logger.error(`퀴즈 등록 안전망 처리 실패(quizId: ${quizId})`, error);
    }
  }

  private async sendCompletionNotification(
    userKey: string,
    quizId: string,
    quizTtl: string,
    excluded: ExcludedSongInfo[],
  ): Promise<void> {
    const linkPath = `/quizzes/${quizId}/edit`;
    const params: CreateNotificationParams =
      excluded.length === 0
        ? {
            notiType: NotificationType.QUIZ_REG_COMPLETED,
            userKey,
            title: '퀴즈 등록이 완료됐어요',
            message: `'${quizTtl}' 퀴즈가 정상적으로 등록됐어요.`,
            params: { quizTtl, excludedSongs: [] },
            linkPath,
          }
        : {
            notiType: NotificationType.QUIZ_REG_COMPLETED,
            userKey,
            title: `퀴즈 등록이 완료됐어요 (${excluded.length}곡 제외)`,
            message: `'${quizTtl}' 퀴즈가 등록됐어요. 다음 곡은 링크 확인에 실패해 제외됐어요: ${excluded
              .map((song) => `${song.songNm}(${song.reason})`)
              .join(', ')}`,
            params: { quizTtl, excludedSongs: excluded },
            linkPath,
          };

    await this.notificationService.create(params);
  }

  private async resolveUserKey(userId: string): Promise<string> {
    const userKey = await this.userService.findUserKeyByUserId(userId);
    if (!userKey) {
      throw new UnauthorizedException('유효한 계정을 찾을 수 없습니다.');
    }
    return userKey;
  }
}
