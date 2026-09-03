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
import { EntityManager, In, Repository } from 'typeorm';
import {
  buildYoutubeWatchUrl,
  parseYoutubeUrl,
} from '../common/youtube-url.util';
import {
  CreateNotificationParams,
  NotificationService,
} from '../notification/notification.service';
import { NotificationType } from '../notification/notification.constants';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { CreateQuizRequestDto } from './dto/create-quiz-request.dto';
import { CreateQuizResultDto } from './dto/create-quiz-result.dto';
import { CreateQuizSongInputDto } from './dto/create-quiz-song-input.dto';
import { MyQuizListItemDto } from './dto/my-quiz-list-item.dto';
import { QuizEditDetailDto } from './dto/quiz-edit-detail.dto';
import { RegistrationEligibilityDto } from './dto/registration-eligibility.dto';
import { QuizAnswer } from './entities/quiz-answer.entity';
import { QuizArtist } from './entities/quiz-artist.entity';
import { QuizSong } from './entities/quiz-song.entity';
import { Quiz } from './entities/quiz.entity';
import { Song } from './entities/song.entity';
import {
  issueLinkVerificationToken,
  verifyLinkVerificationToken,
} from './link-verification-token.util';
import {
  MIN_USER_QUIZ_SONG_COUNT,
  QUIZ_REGISTRATION_INTERVAL_MS,
} from './quiz.constants';
import { QuizService } from './quiz.service';
import { YoutubeLinkValidationService } from './youtube-link-validation.service';

interface ExcludedSongInfo {
  songNm: string;
  reason: string;
}

/** 기존 자동 생성 플로우(quiz-generator.service.ts)와 동일한 클립 길이. */
const QUIZ_SONG_CLIP_SEC = 30;

/**
 * 로그인 유저의 퀴즈 등록(docs/features/user-quiz-registration/spec.md 3.3, 3.7,
 * 3.8). POST /quizzes는 이미 곡별 즉시 검증(youtube-link-validation.service.ts)을
 * 통과한 데이터로 곧바로 퀴즈를 만들고 응답한 뒤, 안전망 재검증은 응답 후
 * 백그라운드에서 진행한다.
 *
 * 생성/수정은 전부 트랜잭션 안에서 처리하고, 등록 유저(SQ_USER) 행에 비관적
 * 락을 걸어 24시간 등록 제한 확인과 퀴즈 생성 사이에 동시 요청이 끼어들 수
 * 없게 한다(코드 리뷰에서 지적된 두 문제 - 부분 실패 시 데이터 유실, 여러 탭
 * 동시 등록으로 제한 우회 - 를 함께 해결한다).
 */
@Injectable()
export class UserQuizRegistrationService {
  private readonly logger = new Logger(UserQuizRegistrationService.name);

  constructor(
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    private readonly userService: UserService,
    private readonly youtubeLinkValidationService: YoutubeLinkValidationService,
    private readonly notificationService: NotificationService,
    private readonly quizService: QuizService,
  ) {}

  async getEligibility(userId: string): Promise<RegistrationEligibilityDto> {
    const userKey = await this.resolveUserKey(userId);
    // 안내용 단순 조회라 락이 필요 없다(트랜잭션 밖에서 호출되는데, 비관적
    // 락은 활성 트랜잭션이 없으면 TypeORM이 예외를 던진다).
    return this.computeEligibility(this.quizRepository.manager, userKey, {
      lock: false,
    });
  }

  /** 마이페이지 "내가 등록한 퀴즈" 목록(4.6) - 최신 등록순. */
  async getMyQuizzes(userId: string): Promise<MyQuizListItemDto[]> {
    const userKey = await this.resolveUserKey(userId);
    const quizzes = await this.quizRepository.find({
      where: { crtUserKey: userKey, useYn: 'Y' },
      order: { crtDt: 'DESC' },
    });
    if (quizzes.length === 0) {
      return [];
    }

    const songCountRows = await this.quizRepository.manager
      .createQueryBuilder(QuizSong, 'quizSong')
      .select('quizSong.quizId', 'quizId')
      .addSelect('COUNT(*)', 'count')
      .where('quizSong.quizId IN (:...quizIds)', {
        quizIds: quizzes.map((quiz) => quiz.quizId),
      })
      .groupBy('quizSong.quizId')
      .getRawMany<{ quizId: string; count: string }>();
    const songCountByQuizId = new Map(
      songCountRows.map((row) => [row.quizId, Number(row.count)]),
    );

    return quizzes.map((quiz) => ({
      quizId: quiz.quizId,
      quizTtl: quiz.quizTtl,
      quizDesc: quiz.quizDesc,
      songCount: songCountByQuizId.get(quiz.quizId) ?? 0,
      playCnt: quiz.playCnt,
      crtDt: quiz.crtDt.toISOString(),
    }));
  }

  /**
   * 수정 화면(/quizzes/:quizId/edit) 프리필용 - 본인 소유 퀴즈만 조회 가능.
   * 각 곡을 조회 시점에 다시 검증해서, 여전히 유효하면 토큰을 함께 내려준다 -
   * 그래야 빌더가 기존 곡을 전부 "미확인"으로 띄우고 유저가 일일이 다시
   * 확인해야 하는 상황을 피할 수 있다(토큰은 발급 즉시 소모되는 값이라 DB에
   * 저장해둘 수 없으므로, 조회 때마다 새로 만든다). 저장된 링크가 원래
   * AUTO(자동 검색)로 채워졌던 경우에도 여기서는 항상 제목 매칭까지 포함한
   * 전체 재검증을 한다 - "아직 안 고친 것" 문서 참고, 제목 표기가 크게
   * 다른 극소수 AUTO 링크는 여기서 실패로 뜰 수 있고 그럴 때만 유저가
   * 다시 확인하면 된다.
   */
  async getQuizForEdit(
    userId: string,
    quizId: string,
  ): Promise<QuizEditDetailDto> {
    const userKey = await this.resolveUserKey(userId);
    const quiz = await this.quizRepository.findOne({ where: { quizId } });
    if (!quiz) {
      throw new NotFoundException(
        `퀴즈를 찾을 수 없습니다. (quizId: ${quizId})`,
      );
    }
    if (quiz.crtUserKey !== userKey) {
      throw new ForbiddenException('본인이 등록한 퀴즈만 수정할 수 있습니다.');
    }

    const songs = await this.quizService.getQuizSongs(quizId);
    const songsWithVerification = await Promise.all(
      songs.map(async (song) => {
        // QuizService.getQuizSongs()의 youtubeUrl은 재생용으로 t=를 1초
        // 앞당겨 보정한 값이다(플레이어 로딩 버퍼 대응) - 그 값을 그대로
        // 수정 화면에 돌려주면, 건드리지 않은 곡도 저장할 때마다 시작
        // 지점이 계속 1초씩 줄어든다. 원본 videoId+startSec으로 다시
        // 조합한 URL을 써야 한다.
        const editYoutubeUrl = song.youtubeVideoId
          ? buildYoutubeWatchUrl(song.youtubeVideoId, song.startSec)
          : song.youtubeUrl;

        const result = await this.youtubeLinkValidationService.validate(
          editYoutubeUrl,
          song.songNm,
        );
        const verificationToken =
          result.valid && result.youtubeVideoId
            ? issueLinkVerificationToken(
                song.songId,
                result.youtubeVideoId,
                'MANUAL',
              )
            : null;

        return {
          songId: song.songId,
          songNm: song.songNm,
          atstNm: song.atstNm,
          youtubeUrl: editYoutubeUrl,
          answers: song.answers.map((answer) => answer.answerTxt),
          verificationToken,
          failReason: result.valid
            ? null
            : (result.reason ?? '링크를 확인할 수 없습니다.'),
        };
      }),
    );

    return {
      quizId: quiz.quizId,
      quizTtl: quiz.quizTtl,
      quizDesc: quiz.quizDesc,
      songs: songsWithVerification,
    };
  }

  async createQuiz(
    userId: string,
    dto: CreateQuizRequestDto,
  ): Promise<CreateQuizResultDto> {
    const userKey = await this.resolveUserKey(userId);
    this.validateSongsInput(dto.songs);

    const { quiz, quizSongs, songById, skipContentCheckByQuizSongId } =
      await this.quizRepository.manager.transaction(async (manager) => {
        // 이 유저 행을 잠가서, 같은 유저가 동시에 두 번 요청해도 뒤 트랜잭션은
        // 앞 트랜잭션이 커밋될 때까지 기다린 뒤에야 아래 등록 가능 여부를 본다.
        const lockedUser = await manager.findOne(User, {
          where: { userKey },
          lock: { mode: 'pessimistic_write' },
        });
        if (!lockedUser) {
          throw new UnauthorizedException('유효한 계정을 찾을 수 없습니다.');
        }

        const eligibility = await this.computeEligibility(manager, userKey, {
          lock: true,
        });
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
          manager,
          dto.songs.map((song) => song.songId),
        );

        const quiz = await manager.save(
          Quiz,
          manager.create(Quiz, {
            quizTtl: dto.quizTtl,
            quizDesc: dto.quizDesc ?? null,
            crtUserKey: userKey,
          }),
        );

        const { quizSongs, skipContentCheckByQuizSongId } =
          await this.saveQuizSongsAndAnswers(manager, quiz.quizId, dto.songs);
        await this.populateQuizArtists(
          manager,
          quiz.quizId,
          Array.from(songById.values()),
        );

        return { quiz, quizSongs, songById, skipContentCheckByQuizSongId };
      });

    // 응답을 기다리게 하지 않고 안전망 재검증은 커밋이 끝난 뒤 백그라운드에서 진행한다.
    void this.runBackgroundSafetyNet(
      quiz.quizId,
      userKey,
      dto.quizTtl,
      quizSongs,
      songById,
      skipContentCheckByQuizSongId,
    );

    return { quizId: quiz.quizId };
  }

  async updateQuiz(
    userId: string,
    quizId: string,
    dto: CreateQuizRequestDto,
  ): Promise<CreateQuizResultDto> {
    const userKey = await this.resolveUserKey(userId);
    this.validateSongsInput(dto.songs);

    const { quizSongs, songById, skipContentCheckByQuizSongId } =
      await this.quizRepository.manager.transaction(async (manager) => {
        const quiz = await manager.findOne(Quiz, {
          where: { quizId },
          lock: { mode: 'pessimistic_write' },
        });
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

        const songById = await this.resolveSongsOrThrow(
          manager,
          dto.songs.map((song) => song.songId),
        );

        quiz.quizTtl = dto.quizTtl;
        quiz.quizDesc = dto.quizDesc ?? null;
        await manager.save(Quiz, quiz);

        // 기존 출제곡/정답/아티스트 연결을 전부 지우고 새 목록으로 다시 만든다 -
        // 클라이언트가 계산한 최종 리스트를 그대로 반영하는 게 스펙 의도라, 부분
        // upsert로 곡 순서·추가/삭제를 각각 맞추는 것보다 이 편이 훨씬 단순하다.
        // 트랜잭션 하나로 묶여 있어 중간에 실패해도 기존 구성이 사라지지 않는다.
        const existingQuizSongIds = (
          await manager.find(QuizSong, {
            where: { quizId },
            select: { quizSongId: true },
          })
        ).map((quizSong) => quizSong.quizSongId);
        if (existingQuizSongIds.length > 0) {
          await manager.delete(QuizAnswer, {
            quizSongId: In(existingQuizSongIds),
          });
        }
        await manager.delete(QuizSong, { quizId });
        await manager.delete(QuizArtist, { quizId });

        const { quizSongs, skipContentCheckByQuizSongId } =
          await this.saveQuizSongsAndAnswers(manager, quizId, dto.songs);
        await this.populateQuizArtists(
          manager,
          quizId,
          Array.from(songById.values()),
        );

        return { quizSongs, songById, skipContentCheckByQuizSongId };
      });

    void this.runBackgroundSafetyNet(
      quizId,
      userKey,
      dto.quizTtl,
      quizSongs,
      songById,
      skipContentCheckByQuizSongId,
    );

    return { quizId };
  }

  async deleteQuiz(userId: string, quizId: string): Promise<void> {
    const userKey = await this.resolveUserKey(userId);
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
    quiz.useYn = 'N';
    await this.quizRepository.save(quiz);
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
    manager: EntityManager,
    songIds: string[],
  ): Promise<Map<string, Song>> {
    const songs = await manager.find(Song, { where: { songId: In(songIds) } });
    if (songs.length !== songIds.length) {
      throw new NotFoundException('존재하지 않는 곡이 포함되어 있습니다.');
    }
    return new Map(songs.map((song) => [song.songId, song]));
  }

  /**
   * videoId/재생 구간/영상 길이는 전부 서버가 youtubeUrl을 다시 파싱해서 계산한
   * 값만 저장한다(ADR-0009) - 클라이언트가 URL과 별개로 videoId나 구간을 보낼
   * 수 있게 하면, 곡 제목과 일치하는 URL로 즉시 검증은 통과시키고 실제로는
   * 전혀 다른 영상 ID를 등록하는 우회가 가능해진다(퀴즈 재생 화면은 videoId를
   * 그대로 쓴다 - quiz.service.ts getQuizSongs).
   */
  private async saveQuizSongsAndAnswers(
    manager: EntityManager,
    quizId: string,
    songs: CreateQuizSongInputDto[],
  ): Promise<{
    quizSongs: QuizSong[];
    skipContentCheckByQuizSongId: Map<string, boolean>;
  }> {
    const quizSongs: QuizSong[] = [];
    const skipContentCheckByQuizSongId = new Map<string, boolean>();
    let quizSeq = 1;
    for (const songInput of songs) {
      const { videoId, startSec: parsedStartSec } = parseYoutubeUrl(
        songInput.youtubeUrl,
      );
      if (!videoId) {
        throw new BadRequestException(
          `유튜브 링크 형식이 올바르지 않은 곡이 있습니다. (songId: ${songInput.songId})`,
        );
      }
      const startSec = parsedStartSec ?? 0;
      const endSec = startSec + QUIZ_SONG_CLIP_SEC;

      // 이 songId+videoId 조합이 즉시 검증(.../validate 또는 .../auto)을
      // 통과했다는 사실 자체를 토큰으로 증명해야 등록을 받는다
      // (link-verification-token.util.ts) - 이 게이트가 없으면 즉시 검증
      // API를 아예 안 거치고 형식만 맞는 URL을 바로 제출해 콘텐츠 검증 없이
      // 퀴즈를 공개할 수 있다(spec.md 4.1 "최종 등록 조건", 코드 리뷰 지적).
      // 토큰 출처가 AUTO일 때만 안전망이 제목 매칭을 생략한다.
      const verifiedSource = verifyLinkVerificationToken(
        songInput.verificationToken,
        songInput.songId,
        videoId,
      );
      if (!verifiedSource) {
        throw new BadRequestException(
          `링크 검증이 확인되지 않았거나 만료됐습니다. 다시 검증해주세요. (songId: ${songInput.songId})`,
        );
      }

      const quizSong = await manager.save(
        QuizSong,
        manager.create(QuizSong, {
          quizId,
          songId: songInput.songId,
          quizSeq: quizSeq++,
          youtubeUrl: buildYoutubeWatchUrl(videoId, startSec),
          youtubeVideoId: videoId,
          durationSec: null,
          startSec,
          endSec,
        }),
      );
      quizSongs.push(quizSong);
      skipContentCheckByQuizSongId.set(
        quizSong.quizSongId,
        verifiedSource === 'AUTO',
      );

      // 같은 곡에 중복 정답을 보내도 유니크 제약과 충돌하지 않도록 dedupe한다.
      const uniqueAnswers = Array.from(new Set(songInput.answers));
      await manager.save(
        QuizAnswer,
        uniqueAnswers.map((answerTxt) =>
          manager.create(QuizAnswer, {
            quizSongId: quizSong.quizSongId,
            answerTxt,
          }),
        ),
      );
    }
    return { quizSongs, skipContentCheckByQuizSongId };
  }

  private async computeEligibility(
    manager: EntityManager,
    userKey: string,
    options: { lock: boolean },
  ): Promise<RegistrationEligibilityDto> {
    // pessimistic_read: 이 유저 행의 락(위 createQuiz)으로 동시 요청은 이미
    // 직렬화됐지만, 일반 조회는 InnoDB REPEATABLE READ 스냅샷 때문에 방금
    // 커밋된 다른 트랜잭션의 결과를 못 볼 수 있다 - 락 조회는 항상 최신
    // 커밋본을 읽으므로 이 스냅샷 문제를 피한다. 단, 비관적 락은 활성
    // 트랜잭션 안에서만 걸 수 있어 createQuiz의 트랜잭션 안에서만 켠다 -
    // 단순 조회용 getEligibility()는 트랜잭션 밖에서 호출되므로 락을 걸면
    // TypeORM이 PessimisticLockTransactionRequiredError를 던진다.
    const lastQuiz = await manager.findOne(Quiz, {
      where: { crtUserKey: userKey },
      order: { crtDt: 'DESC' },
      ...(options.lock ? { lock: { mode: 'pessimistic_read' as const } } : {}),
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
    manager: EntityManager,
    quizId: string,
    songs: Song[],
  ): Promise<void> {
    if (songs.length === 0) {
      return;
    }
    const songsWithMainArtist = await manager
      .createQueryBuilder(Song, 'song')
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

    await manager.save(
      QuizArtist,
      Array.from(atstIds).map((atstId) =>
        manager.create(QuizArtist, { quizId, atstId }),
      ),
    );
  }

  private async runBackgroundSafetyNet(
    quizId: string,
    userKey: string,
    quizTtl: string,
    quizSongs: QuizSong[],
    songById: Map<string, Song>,
    skipContentCheckByQuizSongId: Map<string, boolean>,
  ): Promise<void> {
    try {
      const excluded: ExcludedSongInfo[] = [];

      for (const quizSong of quizSongs) {
        const song = songById.get(quizSong.songId);
        if (!song) {
          continue;
        }

        const result = await this.youtubeLinkValidationService
          .validate(quizSong.youtubeUrl, song.songNm, {
            skipContentCheck:
              skipContentCheckByQuizSongId.get(quizSong.quizSongId) ?? false,
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
          await this.quizRepository.manager.delete(QuizAnswer, {
            quizSongId: quizSong.quizSongId,
          });
          await this.quizRepository.manager.delete(QuizSong, {
            quizSongId: quizSong.quizSongId,
          });
        } else {
          // 검증 시점에 다시 계산한 재생 구간/길이로 갱신한다(제출 시점 값은
          // 사용자가 URL의 t= 파라미터로 넣은 값이라 최적이 아닐 수 있다).
          await this.quizRepository.manager.update(
            QuizSong,
            { quizSongId: quizSong.quizSongId },
            {
              durationSec: result.durationSec,
              startSec: result.startSec ?? quizSong.startSec,
              endSec: result.endSec ?? quizSong.endSec,
            },
          );
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
