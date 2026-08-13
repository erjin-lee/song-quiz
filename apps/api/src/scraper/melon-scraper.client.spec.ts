import { Logger } from '@nestjs/common';
import {
  ChartType,
  MelonFetchError,
  MelonScraperClient,
} from './melon-scraper.client';

function fakeResponse(
  body: string,
  init?: { ok?: boolean; status?: number },
): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    text: () => Promise.resolve(body),
  } as Response;
}

describe('MelonScraperClient', () => {
  let client: MelonScraperClient;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    client = new MelonScraperClient();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchArtist', () => {
    it('아티스트명과 대표 이미지를 파싱한다', async () => {
      fetchSpy.mockResolvedValueOnce(
        fakeResponse(`
          <p class="title_atist">아이유<span>가수</span></p>
          <meta property="og:image" content="https://cdnimg.melon.co.kr/artist.jpg">
        `),
      );

      const result = await client.fetchArtist('12345');

      expect(result).toEqual({
        melonArtistId: '12345',
        atstNm: '아이유',
        thumbImgUrl: 'https://cdnimg.melon.co.kr/artist.jpg',
      });
    });

    it('기본 이미지(logo_melon142x99.png)는 null로 처리한다', async () => {
      fetchSpy.mockResolvedValueOnce(
        fakeResponse(`
          <p class="title_atist">아이유</p>
          <meta property="og:image" content="https://cdnimg.melon.co.kr/logo_melon142x99.png">
        `),
      );

      const result = await client.fetchArtist('12345');

      expect(result?.thumbImgUrl).toBeNull();
    });

    it('아티스트 제목 요소가 없으면 null을 반환한다', async () => {
      fetchSpy.mockResolvedValueOnce(fakeResponse('<div>존재하지 않음</div>'));

      const result = await client.fetchArtist('12345');

      expect(result).toBeNull();
    });
  });

  describe('fetchAlbums', () => {
    it('앨범 목록을 파싱하고 빈 페이지에서 페이징을 멈춘다', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          fakeResponse(`
            <li class="album11_li">
              <a href="javascript:melon.link.goAlbumDetail('9001');" class="thumb">
                <img src="https://cdnimg.melon.co.kr/album.jpg">
              </a>
              <dl>
                <dt><a class="ellipsis" href="#">앨범 제목</a></dt>
                <dd class="atistname">
                  <div class="ellipsis">
                    <a class="play_artist" href="javascript:melon.link.goArtistDetail('12345');">아이유</a>
                  </div>
                </dd>
              </dl>
              <div class="wrap_btn"><span class="cnt_view">2020.05.06</span></div>
            </li>
          `),
        )
        .mockResolvedValueOnce(fakeResponse('<div>결과 없음</div>'));

      const albums = await client.fetchAlbums('12345');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(albums).toEqual([
        {
          melonAlbmId: '9001',
          albmNm: '앨범 제목',
          thumbImgUrl: 'https://cdnimg.melon.co.kr/album.jpg',
          rlsDt: '2020-05-06',
          artistIds: ['12345'],
        },
      ]);
    });

    it('앨범 ID를 찾을 수 없는 항목은 건너뛰고 경고를 남긴다', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          fakeResponse(`
            <li class="album11_li">
              <div class="thumb"><img src="https://cdnimg.melon.co.kr/album.jpg"></div>
              <dl><dt><a class="ellipsis" href="#">앨범 제목</a></dt></dl>
            </li>
          `),
        )
        .mockResolvedValueOnce(fakeResponse('<div>결과 없음</div>'));

      const albums = await client.fetchAlbums('12345');

      expect(albums).toEqual([]);
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('앨범 ID를 찾을 수 없습니다'),
      );
    });
  });

  describe('fetchSongs', () => {
    it('곡 목록을 파싱한다', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          fakeResponse(`
            <table><tbody>
              <tr>
                <td><input type="checkbox" class="input_check" name="input_check" value="7001"></td>
                <td>
                  <span class="icon_song title"></span>
                  <a class="btn_icon_detail" href="#"><span class="odd_span">좋은 날</span></a>
                </td>
                <td><a href="javascript:melon.link.goAlbumDetail('9001');">앨범 제목</a></td>
              </tr>
            </tbody></table>
          `),
        )
        .mockResolvedValueOnce(fakeResponse('<div>결과 없음</div>'));

      const songs = await client.fetchSongs('12345');

      expect(songs).toEqual([
        {
          melonSongId: '7001',
          songNm: '좋은 날',
          titleYn: 'Y',
          melonAlbmId: '9001',
        },
      ]);
    });
  });

  describe('fetchAgeChartSongs', () => {
    it('lst50/lst100 순위 행을 파싱한다', async () => {
      fetchSpy.mockResolvedValueOnce(
        fakeResponse(`
          <table><tbody>
          <tr class="lst50">
            <td><input type="checkbox" class="input_check" name="input_check" value="7001"></td>
            <td><div class="ellipsis rank01"><a href="#" title="좋은 날">좋은 날</a></div></td>
            <td><div class="ellipsis rank02"><a href="?artistId=12345">아이유</a></div></td>
            <td>
              <a class="image_type15" href="?albumId=9001"><img src="https://cdnimg.melon.co.kr/album.jpg"></a>
              <div class="ellipsis rank03"><a href="#">앨범 제목</a></div>
            </td>
          </tr>
          <tr class="lst100">
            <td><input type="checkbox" class="input_check" name="input_check" value="7002"></td>
            <td><div class="ellipsis rank01"><a href="#" title="밤편지">밤편지</a></div></td>
            <td><div class="ellipsis rank02"><a href="?artistId=12346">아이유</a></div></td>
            <td>
              <a class="image_type15" href="?albumId=9002"></a>
              <div class="ellipsis rank03"><a href="#">앨범 제목2</a></div>
            </td>
          </tr>
          </tbody></table>
        `),
      );

      const songs = await client.fetchAgeChartSongs('2020', ChartType.YE);

      expect(songs).toEqual([
        {
          melonSongId: '7001',
          songNm: '좋은 날',
          melonAlbmId: '9001',
          albmNm: '앨범 제목',
          albumThumbImgUrl: 'https://cdnimg.melon.co.kr/album.jpg',
          artists: [{ melonArtistId: '12345', atstNm: '아이유' }],
        },
        {
          melonSongId: '7002',
          songNm: '밤편지',
          melonAlbmId: '9002',
          albmNm: '앨범 제목2',
          albumThumbImgUrl: null,
          artists: [{ melonArtistId: '12346', atstNm: '아이유' }],
        },
      ]);
    });

    it('아티스트 정보가 없는 행은 건너뛰고 경고를 남긴다', async () => {
      fetchSpy.mockResolvedValueOnce(
        fakeResponse(`
          <table><tbody>
          <tr class="lst50">
            <td><input type="checkbox" class="input_check" name="input_check" value="7001"></td>
            <td><div class="ellipsis rank01"><a href="#" title="좋은 날">좋은 날</a></div></td>
            <td><div class="ellipsis rank02"></div></td>
            <td>
              <a class="image_type15" href="?albumId=9001"></a>
              <div class="ellipsis rank03"><a href="#">앨범 제목</a></div>
            </td>
          </tr>
          </tbody></table>
        `),
      );

      const songs = await client.fetchAgeChartSongs('2020', ChartType.YE);

      expect(songs).toEqual([]);
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('아티스트 정보를 찾을 수 없습니다'),
      );
    });
  });

  describe('getHtml 오류 처리', () => {
    it('응답이 실패(status)면 MelonFetchError를 던진다', async () => {
      fetchSpy.mockResolvedValueOnce(
        fakeResponse('', { ok: false, status: 500 }),
      );

      await expect(client.fetchArtist('12345')).rejects.toThrow(
        MelonFetchError,
      );
    });

    it('네트워크 요청 자체가 실패하면 MelonFetchError를 던진다', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('network down'));

      await expect(client.fetchArtist('12345')).rejects.toThrow(
        MelonFetchError,
      );
    });

    it('요청에 타임아웃 signal을 전달한다', async () => {
      fetchSpy.mockResolvedValueOnce(fakeResponse('<div></div>'));

      await client.fetchArtist('12345');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });
});
