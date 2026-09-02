import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuizAnswer } from './entities/quiz-answer.entity';
import { Song } from './entities/song.entity';
import { issueLinkVerificationToken } from './link-verification-token.util';
import { stripFeatAnnotations } from './song-title-normalizer';
import {
  YoutubeLinkValidationResult,
  YoutubeLinkValidationService,
} from './youtube-link-validation.service';
import { YoutubeScraperClient } from './youtube-scraper.client';

const QUIZ_SONG_CLIP_SEC = 30;

type YoutubeLinkValidationResponse = YoutubeLinkValidationResult & {
  verificationToken: string | null;
};

/**
 * 퀴즈 빌더 화면에서 곡 하나씩 편집할 때(링크 검증/자동 채우기/정답 후보 조회)
 * 쓰는 서비스. 아직 퀴즈가 만들어지기 전(Quiz/QuizSong이 없는) 시점에 Song
 * 단위로 동작한다는 점이 QuizService/QuizGeneratorService와 다르다.
 */
@Injectable()
export class UserSongService {
  private readonly logger = new Logger(UserSongService.name);

  constructor(
    @InjectRepository(Song)
    private readonly songRepository: Repository<Song>,
    @InjectRepository(QuizAnswer)
    private readonly quizAnswerRepository: Repository<QuizAnswer>,
    private readonly youtubeLinkValidationService: YoutubeLinkValidationService,
    private readonly youtubeScraperClient: YoutubeScraperClient,
  ) {}

  async validateYoutubeLink(
    songId: string,
    youtubeUrl: string,
  ): Promise<YoutubeLinkValidationResponse> {
    const song = await this.getSongOrThrow(songId);
    const result = await this.youtubeLinkValidationService.validate(
      youtubeUrl,
      song.songNm,
    );
    // 직접 입력한 링크는 최종 등록 시에도 항상 콘텐츠 검증을 다시 하므로
    // 예외를 증명할 토큰이 필요 없다(autoFillYoutubeLink만 발급한다).
    return { ...result, verificationToken: null };
  }

  /** 링크가 공란인 곡을 "{아티스트} - {곡명}"으로 검색해 자동으로 채운다. */
  async autoFillYoutubeLink(
    songId: string,
  ): Promise<YoutubeLinkValidationResponse> {
    const { song, artistNm } = await this.getSongWithMainArtistOrThrow(songId);

    const searchResult = await this.youtubeScraperClient
      .search(`${artistNm} - ${song.songNm}`)
      .catch((error) => {
        this.logger.warn(`자동 유튜브 검색 실패(songId: ${songId})`, error);
        return null;
      });
    if (!searchResult) {
      return {
        valid: false,
        youtubeUrl: null,
        youtubeVideoId: null,
        durationSec: null,
        startSec: null,
        endSec: null,
        reason: '자동으로 링크를 찾지 못했습니다. 직접 입력해주세요.',
        verificationToken: null,
      };
    }

    // 아티스트+곡명 기준 검색이라 신뢰도가 높으므로 콘텐츠 검증(제목 매칭)은
    // 최종 등록 시 생략할 수 있다 - 단, 클라이언트가 이 사실을 스스로 주장하는
    // 게 아니라 서버가 서명한 토큰으로 증명해야 한다(link-verification-token.util.ts).
    const startSec = Math.round(searchResult.durationSec / 2);
    return {
      valid: true,
      youtubeUrl: `https://www.youtube.com/watch?v=${searchResult.videoId}&t=${startSec}`,
      youtubeVideoId: searchResult.videoId,
      durationSec: searchResult.durationSec,
      startSec,
      endSec: startSec + QUIZ_SONG_CLIP_SEC,
      reason: null,
      verificationToken: issueLinkVerificationToken(
        songId,
        searchResult.videoId,
        'AUTO',
      ),
    };
  }

  /**
   * 이미 다른 퀴즈에서 이 곡에 등록된 정답이 있으면 그걸 그대로 디폴트로 노출하고,
   * 없으면 규칙 기반으로 [원제목, Feat/Prod 등 제거한 제목]을 후보로 준다.
   */
  async getAnswerCandidates(songId: string): Promise<string[]> {
    const song = await this.getSongOrThrow(songId);

    const existingAnswers = await this.quizAnswerRepository
      .createQueryBuilder('answer')
      .innerJoin('answer.quizSong', 'quizSong')
      .where('quizSong.songId = :songId', { songId })
      .select('DISTINCT answer.answerTxt', 'answerTxt')
      .getRawMany<{ answerTxt: string }>();
    if (existingAnswers.length > 0) {
      return existingAnswers.map((row) => row.answerTxt);
    }

    const normalizedTitle = stripFeatAnnotations(song.songNm);
    return normalizedTitle === song.songNm
      ? [song.songNm]
      : [song.songNm, normalizedTitle];
  }

  private async getSongOrThrow(songId: string): Promise<Song> {
    const song = await this.songRepository.findOne({ where: { songId } });
    if (!song) {
      throw new NotFoundException(`곡을 찾을 수 없습니다. (songId: ${songId})`);
    }
    return song;
  }

  private async getSongWithMainArtistOrThrow(
    songId: string,
  ): Promise<{ song: Song; artistNm: string }> {
    const song = await this.songRepository
      .createQueryBuilder('song')
      .innerJoinAndSelect(
        'song.songArtists',
        'songArtist',
        'songArtist.mainYn = :mainYn',
        { mainYn: 'Y' },
      )
      .innerJoinAndSelect('songArtist.artist', 'artist')
      .where('song.songId = :songId', { songId })
      .getOne();
    if (!song || !song.songArtists?.[0]?.artist) {
      throw new NotFoundException(`곡을 찾을 수 없습니다. (songId: ${songId})`);
    }
    return { song, artistNm: song.songArtists[0].artist.atstNm };
  }
}
