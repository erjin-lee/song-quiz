import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QuizAnswer } from './entities/quiz-answer.entity';
import { QuizSong } from './entities/quiz-song.entity';
import { GptAnswerClient } from './gpt-answer.client';
import { QuizAnswerGeneratorService } from './quiz-answer-generator.service';
import { QuizSongReuseService } from './quiz-song-reuse.service';

describe('QuizAnswerGeneratorService.fillAnswers', () => {
  let service: QuizAnswerGeneratorService;

  function buildQuizSongFixture(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      quizSongId: `qs${i + 1}`,
      quizId: '1',
      songId: `s${i + 1}`,
      youtubeUrl: `https://www.youtube.com/watch?v=${i + 1}`,
      song: {
        songNm: i === 0 ? 'Song A' : `Song ${i + 1}`,
        songArtists: [{ mainYn: 'Y', artist: { atstNm: `Artist${i + 1}` } }],
      },
    }));
  }

  const quizSongFixture = buildQuizSongFixture(2);

  const queryBuilderMock: {
    innerJoinAndSelect: jest.Mock;
    innerJoin: jest.Mock;
    leftJoin: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  } = {
    innerJoinAndSelect: jest.fn(),
    innerJoin: jest.fn(),
    leftJoin: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    getMany: jest.fn(),
  };

  const quizSongRepositoryMock = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
  };
  const quizAnswerRepositoryMock = {
    create: jest.fn((data: unknown) => data),
    save: jest.fn(async (data: unknown) => data),
  };
  const gptAnswerClientMock = {
    generateAnswersBatch: jest.fn(),
  };
  const quizSongReuseServiceMock = {
    findReusableYoutubeInfo: jest.fn(),
    copyReusableAnswers: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    quizSongReuseServiceMock.copyReusableAnswers.mockResolvedValue(0);
    queryBuilderMock.innerJoinAndSelect.mockReturnValue(queryBuilderMock);
    queryBuilderMock.innerJoin.mockReturnValue(queryBuilderMock);
    queryBuilderMock.leftJoin.mockReturnValue(queryBuilderMock);
    queryBuilderMock.where.mockReturnValue(queryBuilderMock);
    queryBuilderMock.andWhere.mockReturnValue(queryBuilderMock);
    queryBuilderMock.orderBy.mockReturnValue(queryBuilderMock);
    queryBuilderMock.getMany.mockResolvedValue(
      quizSongFixture.map((quizSong) => ({
        ...quizSong,
        song: { ...quizSong.song, songArtists: quizSong.song.songArtists },
      })),
    );
    gptAnswerClientMock.generateAnswersBatch.mockImplementation(
      async (songs: { quizSongId: string; songNm: string }[]) => {
        const result = new Map<
          string,
          {
            answerTxt: string;
            answerType: string | null;
            confidence: string | null;
          }[]
        >();
        for (const song of songs) {
          if (song.songNm === 'Song A') {
            result.set(song.quizSongId, [
              {
                answerTxt: 'Song A',
                answerType: 'ORIGINAL',
                confidence: 'HIGH',
              },
              {
                answerTxt: 'song a',
                answerType: 'NORMALIZ',
                confidence: 'MEDIUM',
              },
            ]);
          }
        }
        return result;
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizAnswerGeneratorService,
        { provide: GptAnswerClient, useValue: gptAnswerClientMock },
        {
          provide: getRepositoryToken(QuizSong),
          useValue: quizSongRepositoryMock,
        },
        {
          provide: getRepositoryToken(QuizAnswer),
          useValue: quizAnswerRepositoryMock,
        },
        {
          provide: QuizSongReuseService,
          useValue: quizSongReuseServiceMock,
        },
      ],
    }).compile();

    service = module.get<QuizAnswerGeneratorService>(
      QuizAnswerGeneratorService,
    );
  });

  it('대상 출제곡이 없으면 400을 반환한다', async () => {
    queryBuilderMock.getMany.mockResolvedValueOnce([]);

    await expect(service.fillAnswers()).rejects.toThrow(BadRequestException);
  });

  it('정답이 없고 유튜브 링크는 있는 출제곡만 조회해, 생성된 곡은 저장하고 실패한 곡은 건너뛴다', async () => {
    const result = await service.fillAnswers();

    expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
      'quizSong.youtubeUrl != :emptyUrl',
      { emptyUrl: '' },
    );
    expect(gptAnswerClientMock.generateAnswersBatch).toHaveBeenCalledTimes(1);
    expect(gptAnswerClientMock.generateAnswersBatch).toHaveBeenCalledWith([
      { quizSongId: 'qs1', songNm: 'Song A', atstNm: 'Artist1' },
      { quizSongId: 'qs2', songNm: 'Song 2', atstNm: 'Artist2' },
    ]);
    expect(quizAnswerRepositoryMock.save).toHaveBeenCalledTimes(1);
    expect(quizAnswerRepositoryMock.save).toHaveBeenCalledWith([
      {
        quizSongId: 'qs1',
        answerTxt: 'Song A',
        answerType: 'ORIGINAL',
        confidence: 'HIGH',
      },
      {
        quizSongId: 'qs1',
        answerTxt: 'song a',
        answerType: 'NORMALIZ',
        confidence: 'MEDIUM',
      },
    ]);
    expect(result).toMatchObject({
      targetSongCount: 2,
      savedSongCount: 1,
      savedAnswerCount: 2,
      skippedSongCount: 1,
    });
  });

  it('출제곡이 50개를 넘으면 GPT 요청을 여러 번(청크 단위)으로 나눠 보낸다', async () => {
    const manySongs = buildQuizSongFixture(60);
    queryBuilderMock.getMany.mockResolvedValueOnce(manySongs);

    const result = await service.fillAnswers();

    expect(gptAnswerClientMock.generateAnswersBatch).toHaveBeenCalledTimes(2);
    expect(
      gptAnswerClientMock.generateAnswersBatch.mock.calls[0][0],
    ).toHaveLength(50);
    expect(
      gptAnswerClientMock.generateAnswersBatch.mock.calls[1][0],
    ).toHaveLength(10);
    expect(result.targetSongCount).toBe(60);
  });

  it('동일 곡을 출제한 다른 퀴즈에 정답이 있으면 GPT 호출 없이 재사용하고, 나머지 곡만 GPT로 채운다', async () => {
    quizSongReuseServiceMock.copyReusableAnswers.mockImplementation(
      async (songId: string) => (songId === 's1' ? 2 : 0),
    );

    const result = await service.fillAnswers();

    expect(quizSongReuseServiceMock.copyReusableAnswers).toHaveBeenCalledWith(
      's1',
      'qs1',
    );
    expect(gptAnswerClientMock.generateAnswersBatch).toHaveBeenCalledWith([
      { quizSongId: 'qs2', songNm: 'Song 2', atstNm: 'Artist2' },
    ]);
    expect(result).toMatchObject({
      targetSongCount: 2,
      reusedSongCount: 1,
      reusedAnswerCount: 2,
      savedSongCount: 0,
      savedAnswerCount: 0,
      skippedSongCount: 1,
    });
  });

  it('GPT 배치 호출이 실패하면 해당 청크의 곡들을 모두 건너뛴다', async () => {
    gptAnswerClientMock.generateAnswersBatch.mockRejectedValueOnce(
      new Error('gpt down'),
    );

    const result = await service.fillAnswers();

    expect(quizAnswerRepositoryMock.save).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      targetSongCount: 2,
      savedSongCount: 0,
      savedAnswerCount: 0,
      skippedSongCount: 2,
    });
  });
});
