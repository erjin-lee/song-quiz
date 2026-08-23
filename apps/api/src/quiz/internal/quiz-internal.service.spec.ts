import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QuizAnswer } from '../entities/quiz-answer.entity';
import { QuizArtist } from '../entities/quiz-artist.entity';
import { QuizSong } from '../entities/quiz-song.entity';
import { Quiz } from '../entities/quiz.entity';
import { QuizInternalService } from './quiz-internal.service';

describe('QuizInternalService', () => {
  let service: QuizInternalService;

  const quizRepositoryMock = {
    findOne: jest.fn(),
    increment: jest.fn(),
  };
  const quizArtistRepositoryMock = {
    find: jest.fn(),
  };
  const quizSongRepositoryMock = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
  };
  const quizAnswerRepositoryMock = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizInternalService,
        { provide: getRepositoryToken(Quiz), useValue: quizRepositoryMock },
        {
          provide: getRepositoryToken(QuizArtist),
          useValue: quizArtistRepositoryMock,
        },
        {
          provide: getRepositoryToken(QuizSong),
          useValue: quizSongRepositoryMock,
        },
        {
          provide: getRepositoryToken(QuizAnswer),
          useValue: quizAnswerRepositoryMock,
        },
      ],
    }).compile();

    service = module.get<QuizInternalService>(QuizInternalService);
  });

  describe('getSummary', () => {
    it('퀴즈/아티스트/출제곡 수를 조합해 요약을 반환한다', async () => {
      quizRepositoryMock.findOne.mockResolvedValue({
        quizId: '1',
        quizTtl: '아이유',
        quizDesc: '아이유 노래 맞추기',
        thumbImgUrl: null,
        useYn: 'Y',
      });
      quizArtistRepositoryMock.find.mockResolvedValue([
        { atstId: '10', artist: { atstNm: '아이유' } },
      ]);
      quizSongRepositoryMock.count.mockResolvedValue(2);

      const result = await service.getSummary('1');

      expect(result).toEqual({
        quizId: '1',
        quizTtl: '아이유',
        quizDesc: '아이유 노래 맞추기',
        thumbImgUrl: null,
        songCount: 2,
        atstIds: ['10'],
        atstNms: ['아이유'],
      });
      expect(quizRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { quizId: '1', useYn: 'Y' },
      });
    });

    it('퀴즈가 없으면 NotFoundException', async () => {
      quizRepositoryMock.findOne.mockResolvedValue(null);

      await expect(service.getSummary('999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('incrementPlayCount', () => {
    it('quizId 기준으로 playCnt를 1 증가시킨다', async () => {
      await service.incrementPlayCount('1');

      expect(quizRepositoryMock.increment).toHaveBeenCalledWith(
        { quizId: '1' },
        'playCnt',
        1,
      );
    });
  });

  describe('getQuizRounds', () => {
    it('quizId 조건 하나로 quizSeq ASC 순서의 라운드 데이터를 반환한다', async () => {
      quizSongRepositoryMock.find.mockResolvedValue([
        {
          quizSongId: '101',
          youtubeVideoId: 'video1',
          startSec: 10,
          endSec: 40,
          song: {
            songNm: '노래1',
            artist: { atstNm: '아이유' },
            album: { albmNm: '앨범1' },
          },
        },
        {
          quizSongId: '102',
          youtubeVideoId: 'video2',
          startSec: 0,
          endSec: 30,
          song: {
            songNm: '노래2',
            artist: { atstNm: '아이유' },
            album: { albmNm: '앨범2' },
          },
        },
      ]);
      quizAnswerRepositoryMock.find.mockResolvedValue([
        { quizSongId: '101', answerTxt: '노래1' },
        { quizSongId: '101', answerTxt: '노래 1' },
        { quizSongId: '102', answerTxt: '노래2' },
      ]);

      const result = await service.getQuizRounds('1');

      expect(quizSongRepositoryMock.find).toHaveBeenCalledWith({
        where: { quizId: '1' },
        order: { quizSeq: 'ASC' },
        relations: { song: { artist: true, album: true } },
      });
      expect(result).toEqual([
        {
          quizSongId: '101',
          youtubeVideoId: 'video1',
          startSec: 10,
          endSec: 40,
          songNm: '노래1',
          atstNm: '아이유',
          albmNm: '앨범1',
          answers: ['노래1', '노래 1'],
        },
        {
          quizSongId: '102',
          youtubeVideoId: 'video2',
          startSec: 0,
          endSec: 30,
          songNm: '노래2',
          atstNm: '아이유',
          albmNm: '앨범2',
          answers: ['노래2'],
        },
      ]);
    });

    it('출제곡이 없으면 빈 배열을 반환한다(정답 조회를 시도하지 않는다)', async () => {
      quizSongRepositoryMock.find.mockResolvedValue([]);

      const result = await service.getQuizRounds('999');

      expect(result).toEqual([]);
      expect(quizAnswerRepositoryMock.find).not.toHaveBeenCalled();
    });
  });
});
