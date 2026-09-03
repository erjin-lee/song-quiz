import { Test, TestingModule } from '@nestjs/testing';
import { YoutubeScraperClient } from './youtube-scraper.client';
import { YoutubeLinkValidationService } from './youtube-link-validation.service';

describe('YoutubeLinkValidationService', () => {
  let service: YoutubeLinkValidationService;

  const youtubeScraperClientMock = {
    getVideoInfo: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YoutubeLinkValidationService,
        { provide: YoutubeScraperClient, useValue: youtubeScraperClientMock },
      ],
    }).compile();

    service = module.get<YoutubeLinkValidationService>(
      YoutubeLinkValidationService,
    );
  });

  it('링크 형식이 올바르지 않으면 영상 정보를 조회하지 않고 거부한다', async () => {
    const result = await service.validate(
      'https://www.youtube.com/results?v=abc',
      '봄날',
    );

    expect(result).toMatchObject({ valid: false });
    expect(result.reason).toContain('형식');
    expect(youtubeScraperClientMock.getVideoInfo).not.toHaveBeenCalled();
  });

  it('영상 정보 조회에 실패하면 거부한다', async () => {
    youtubeScraperClientMock.getVideoInfo.mockRejectedValue(new Error('실패'));

    const result = await service.validate(
      'https://www.youtube.com/watch?v=abc123',
      '봄날',
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('확인할 수 없습니다');
  });

  it('제목을 못 가져오면 거부한다', async () => {
    youtubeScraperClientMock.getVideoInfo.mockResolvedValue({
      title: null,
      durationSec: 200,
    });

    const result = await service.validate(
      'https://www.youtube.com/watch?v=abc123',
      '봄날',
    );

    expect(result.valid).toBe(false);
  });

  it('영상 제목에 곡 제목이 없으면 거부하되 재생 길이는 반환한다', async () => {
    youtubeScraperClientMock.getVideoInfo.mockResolvedValue({
      title: '전혀 다른 영상',
      durationSec: 200,
    });

    const result = await service.validate(
      'https://www.youtube.com/watch?v=abc123',
      '봄날',
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('포함되어 있지 않습니다');
    expect(result.durationSec).toBe(200);
  });

  it('Feat 표기가 붙은 곡 제목도 정규화해서 매칭한다', async () => {
    youtubeScraperClientMock.getVideoInfo.mockResolvedValue({
      title: '아이유(IU) - 봄날 Official MV',
      durationSec: 240,
    });

    const result = await service.validate(
      'https://www.youtube.com/watch?v=abc123',
      '봄날 (Feat. 아무개)',
    );

    expect(result.valid).toBe(true);
    expect(result.youtubeVideoId).toBe('abc123');
    expect(result.youtubeUrl).toContain('v=abc123');
  });

  it('t 파라미터가 클립 길이 안에 들어가면 그대로 사용한다', async () => {
    youtubeScraperClientMock.getVideoInfo.mockResolvedValue({
      title: '봄날 MV',
      durationSec: 240,
    });

    const result = await service.validate(
      'https://www.youtube.com/watch?v=abc123&t=50',
      '봄날',
    );

    expect(result.startSec).toBe(50);
    expect(result.endSec).toBe(80);
    expect(result.youtubeUrl).toContain('t=50');
  });

  it('t 파라미터가 없거나 클립이 안 들어가면 영상 길이의 절반을 기본값으로 쓴다', async () => {
    youtubeScraperClientMock.getVideoInfo.mockResolvedValue({
      title: '봄날 MV',
      durationSec: 240,
    });

    const result = await service.validate(
      'https://www.youtube.com/watch?v=abc123',
      '봄날',
    );

    expect(result.startSec).toBe(120);
    expect(result.endSec).toBe(150);
  });

  it('skipContentCheck가 true면 제목이 안 겹쳐도 통과시키되 영상 정보는 그대로 조회한다', async () => {
    youtubeScraperClientMock.getVideoInfo.mockResolvedValue({
      title: '전혀 다른 영상 제목(영문 표기 등)',
      durationSec: 240,
    });

    const result = await service.validate(
      'https://www.youtube.com/watch?v=abc123',
      '봄날',
      { skipContentCheck: true },
    );

    expect(result.valid).toBe(true);
    expect(result.durationSec).toBe(240);
    expect(youtubeScraperClientMock.getVideoInfo).toHaveBeenCalledWith(
      'abc123',
    );
  });

  it('영상 길이를 못 구했으면 시작 지점을 0으로 둔다', async () => {
    youtubeScraperClientMock.getVideoInfo.mockResolvedValue({
      title: '봄날 MV',
      durationSec: null,
    });

    const result = await service.validate(
      'https://www.youtube.com/watch?v=abc123',
      '봄날',
    );

    expect(result.valid).toBe(true);
    expect(result.startSec).toBe(0);
    expect(result.endSec).toBe(30);
  });
});
