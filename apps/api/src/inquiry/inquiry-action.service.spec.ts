import { NotFoundException } from '@nestjs/common';
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
  };
  const youtubeScraperClientMock = {
    getDurationSec: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    quizSongRepositoryMock.findOne.mockResolvedValue({ ...baseQuizSong });

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

    it('videoId를 파싱할 수 없는 링크는 영상 길이를 스크래핑하지 않는다', async () => {
      await service.changeLink('qs1', { youtubeUrl: '유효하지 않은 URL' });

      expect(youtubeScraperClientMock.getDurationSec).not.toHaveBeenCalled();
      expect(quizSongRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          youtubeVideoId: null,
          durationSec: null,
          startSec: baseQuizSong.startSec,
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
  });
});
