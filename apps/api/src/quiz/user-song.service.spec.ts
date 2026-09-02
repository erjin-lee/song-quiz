import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { verifyLinkVerificationToken } from './link-verification-token.util';
import { QuizAnswer } from './entities/quiz-answer.entity';
import { Song } from './entities/song.entity';
import { UserSongService } from './user-song.service';
import { YoutubeLinkValidationService } from './youtube-link-validation.service';
import { YoutubeScraperClient } from './youtube-scraper.client';

describe('UserSongService', () => {
  let service: UserSongService;
  const originalSecret = process.env.USER_JWT_SECRET;

  const songRepositoryMock = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const quizAnswerRepositoryMock = { createQueryBuilder: jest.fn() };
  const youtubeLinkValidationServiceMock = { validate: jest.fn() };
  const youtubeScraperClientMock = { search: jest.fn() };

  function makeSongQueryBuilder(song: unknown) {
    const qb: Record<string, jest.Mock> = {};
    qb.innerJoinAndSelect = jest.fn().mockReturnValue(qb);
    qb.where = jest.fn().mockReturnValue(qb);
    qb.getOne = jest.fn().mockResolvedValue(song);
    return qb;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.USER_JWT_SECRET = 'test-secret';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserSongService,
        { provide: getRepositoryToken(Song), useValue: songRepositoryMock },
        {
          provide: getRepositoryToken(QuizAnswer),
          useValue: quizAnswerRepositoryMock,
        },
        {
          provide: YoutubeLinkValidationService,
          useValue: youtubeLinkValidationServiceMock,
        },
        { provide: YoutubeScraperClient, useValue: youtubeScraperClientMock },
      ],
    }).compile();

    service = module.get<UserSongService>(UserSongService);
  });

  afterAll(() => {
    process.env.USER_JWT_SECRET = originalSecret;
  });

  describe('validateYoutubeLink', () => {
    it('직접 입력 링크는 검증 결과에 verificationToken을 싣지 않는다(최종 등록 시에도 항상 콘텐츠 검증)', async () => {
      songRepositoryMock.findOne.mockResolvedValue({
        songId: 's1',
        songNm: '봄날',
      });
      youtubeLinkValidationServiceMock.validate.mockResolvedValue({
        valid: true,
        youtubeUrl: 'https://www.youtube.com/watch?v=v1',
        youtubeVideoId: 'v1',
        durationSec: 200,
        startSec: 0,
        endSec: 30,
        reason: null,
      });

      const result = await service.validateYoutubeLink('s1', 'raw-url');

      expect(result.verificationToken).toBeNull();
    });

    it('곡을 찾을 수 없으면 NotFoundException을 던진다', async () => {
      songRepositoryMock.findOne.mockResolvedValue(null);

      await expect(
        service.validateYoutubeLink('unknown', 'raw-url'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('autoFillYoutubeLink', () => {
    it('자동 검색에 성공하면 이 songId+videoId에 대한 AUTO 검증 토큰을 발급한다', async () => {
      songRepositoryMock.createQueryBuilder.mockReturnValue(
        makeSongQueryBuilder({
          songId: 's1',
          songNm: '봄날',
          songArtists: [{ artist: { atstNm: 'IU' } }],
        }),
      );
      youtubeScraperClientMock.search.mockResolvedValue({
        videoId: 'v1',
        durationSec: 200,
      });

      const result = await service.autoFillYoutubeLink('s1');

      expect(result.valid).toBe(true);
      expect(result.verificationToken).not.toBeNull();
      expect(
        verifyLinkVerificationToken(result.verificationToken, 's1', 'v1'),
      ).toBe('AUTO');
    });

    it('자동 검색에 실패하면 토큰 없이 실패를 반환한다', async () => {
      songRepositoryMock.createQueryBuilder.mockReturnValue(
        makeSongQueryBuilder({
          songId: 's1',
          songNm: '봄날',
          songArtists: [{ artist: { atstNm: 'IU' } }],
        }),
      );
      youtubeScraperClientMock.search.mockRejectedValue(new Error('실패'));

      const result = await service.autoFillYoutubeLink('s1');

      expect(result.valid).toBe(false);
      expect(result.verificationToken).toBeNull();
    });
  });
});
