import './node-fetch-polyfill';
import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

const MELON_BASE_URL = 'https://www.melon.com';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEFAULT_ARTIST_IMG_MARKER = 'logo_melon142x99.png';
const ALBUM_PAGE_SIZE = 15;
const SONG_PAGE_SIZE = 50;
const PAGE_FETCH_DELAY_MS = 200;
const MAX_PAGE_ITERATIONS = 500;
const FETCH_TIMEOUT_MS = 10_000;

export enum ChartType {
  AG = 'AG',
  YE = 'YE',
}

export interface ScrapedArtist {
  melonArtistId: string;
  atstNm: string;
  thumbImgUrl: string | null;
}

export interface ScrapedAlbum {
  melonAlbmId: string;
  albmNm: string;
  thumbImgUrl: string | null;
  rlsDt: string | null;
  artistIds: string[];
}

export interface ScrapedSong {
  melonSongId: string;
  songNm: string;
  titleYn: 'Y' | 'N';
  melonAlbmId: string | null;
}

export interface ScrapedChartArtist {
  melonArtistId: string;
  atstNm: string;
}

export interface ScrapedChartSong {
  melonSongId: string;
  songNm: string;
  melonAlbmId: string;
  albmNm: string;
  albumThumbImgUrl: string | null;
  artists: ScrapedChartArtist[];
}

export class MelonFetchError extends Error {}

function extractId(href: string | undefined): string | null {
  const matched = href?.match(/\('(\d+)'/);
  return matched ? matched[1] : null;
}

function extractQueryId(
  href: string | undefined,
  paramName: string,
): string | null {
  const matched = href?.match(new RegExp(`${paramName}=(\\d+)`));
  return matched ? matched[1] : null;
}

function normalizeText(text: string): string {
  return text.replace(/\u00A0/g, ' ').trim();
}

function toIsoDate(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\./g, '-');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class MelonScraperClient {
  private readonly logger = new Logger(MelonScraperClient.name);

  async fetchArtist(melonArtistId: string): Promise<ScrapedArtist | null> {
    const url = `${MELON_BASE_URL}/artist/timeline.htm?artistId=${melonArtistId}`;
    const html = await this.getHtml(url);
    await delay(PAGE_FETCH_DELAY_MS);
    const $ = cheerio.load(html);

    const titleEl = $('p.title_atist');
    if (titleEl.length === 0) {
      return null;
    }

    const atstNm = titleEl.clone().children().remove().end().text().trim();
    if (!atstNm) {
      return null;
    }

    const ogImage = $('meta[property="og:image"]').attr('content')?.trim();
    const thumbImgUrl =
      ogImage && !ogImage.includes(DEFAULT_ARTIST_IMG_MARKER) ? ogImage : null;

    return { melonArtistId, atstNm, thumbImgUrl };
  }

  async fetchAlbums(melonArtistId: string): Promise<ScrapedAlbum[]> {
    const referer = `${MELON_BASE_URL}/artist/album.htm?artistId=${melonArtistId}`;
    const albums: ScrapedAlbum[] = [];

    for (
      let startIndex = 1, iteration = 0;
      iteration < MAX_PAGE_ITERATIONS;
      startIndex += ALBUM_PAGE_SIZE, iteration++
    ) {
      const url =
        `${MELON_BASE_URL}/artist/albumPaging.htm` +
        `?startIndex=${startIndex}&pageSize=${ALBUM_PAGE_SIZE}` +
        `&artistId=${melonArtistId}&listType=0&orderBy=ISSUE_DATE`;
      const html = await this.getHtml(url, referer);
      const $ = cheerio.load(html);
      const items = $('li.album11_li');
      if (items.length === 0) {
        break;
      }

      items.each((_, el) => {
        const album = this.parseAlbumItem($, $(el));
        if (album) {
          albums.push(album);
        }
      });

      await delay(PAGE_FETCH_DELAY_MS);
    }

    return albums;
  }

  async fetchSongs(melonArtistId: string): Promise<ScrapedSong[]> {
    const referer = `${MELON_BASE_URL}/artist/song.htm?artistId=${melonArtistId}`;
    const songs: ScrapedSong[] = [];

    for (
      let startIndex = 1, iteration = 0;
      iteration < MAX_PAGE_ITERATIONS;
      startIndex += SONG_PAGE_SIZE, iteration++
    ) {
      const url =
        `${MELON_BASE_URL}/artist/songPaging.htm` +
        `?startIndex=${startIndex}&pageSize=${SONG_PAGE_SIZE}` +
        `&artistId=${melonArtistId}&listType=A&orderBy=ISSUE_DATE`;
      const html = await this.getHtml(url, referer);
      const $ = cheerio.load(html);
      const rows = $('tbody tr').filter(
        (_, el) =>
          $(el).find('input.input_check[name="input_check"]').length > 0,
      );
      if (rows.length === 0) {
        break;
      }

      rows.each((_, el) => {
        const song = this.parseSongRow($(el));
        if (song) {
          songs.push(song);
        }
      });

      await delay(PAGE_FETCH_DELAY_MS);
    }

    return songs;
  }

  async fetchAgeChartSongs(
    chartDate: string,
    type: ChartType,
  ): Promise<ScrapedChartSong[]> {
    const songs: ScrapedChartSong[] = [];

    const url =
      `${MELON_BASE_URL}/chart/age/list.htm` +
      `?idx=2&chartType=${type}&chartGenre=KPOP&chartDate=${chartDate}&moved=Y`;
    const html = await this.getHtml(url);
    const $ = cheerio.load(html);

    $('tr.lst50').each((_, el) => {
      const song = this.parseChartSongRow($, $(el));
      if (song) {
        songs.push(song);
      }
    });

    $('tr.lst100').each((_, el) => {
      const song = this.parseChartSongRow($, $(el));
      if (song) {
        songs.push(song);
      }
    });

    await delay(PAGE_FETCH_DELAY_MS);

    return songs;
  }

  private parseAlbumItem<T extends AnyNode>(
    $: cheerio.CheerioAPI,
    $li: cheerio.Cheerio<T>,
  ): ScrapedAlbum | null {
    const melonAlbmId = extractId($li.find('.thumb').attr('href'));
    if (!melonAlbmId) {
      this.logger.warn('앨범 파싱 실패: 앨범 ID를 찾을 수 없습니다.');
      return null;
    }

    const albmNm = $li.find('dt a.ellipsis').first().text().trim();
    if (!albmNm) {
      this.logger.warn(
        `앨범 파싱 실패: 앨범명을 찾을 수 없습니다. (melonAlbmId: ${melonAlbmId})`,
      );
      return null;
    }

    const thumbImgUrl = $li.find('.thumb img').attr('src')?.trim() || null;
    const rlsDt = toIsoDate($li.find('.wrap_btn .cnt_view').first().text());

    const artistIds = $li
      .find('dd.atistname div.ellipsis')
      .first()
      .children('a.play_artist')
      .map((_, a) => extractId($(a).attr('href')))
      .get()
      .filter((id): id is string => id !== null);

    return { melonAlbmId, albmNm, thumbImgUrl, rlsDt, artistIds };
  }

  private parseSongRow<T extends AnyNode>(
    $tr: cheerio.Cheerio<T>,
  ): ScrapedSong | null {
    const melonSongId = $tr
      .find('input.input_check[name="input_check"]')
      .attr('value');
    if (!melonSongId) {
      this.logger.warn('곡 파싱 실패: 곡 ID를 찾을 수 없습니다.');
      return null;
    }

    const songNm = $tr
      .find('a.btn_icon_detail span.odd_span')
      .first()
      .text()
      .trim();
    if (!songNm) {
      this.logger.warn(
        `곡 파싱 실패: 곡명을 찾을 수 없습니다. (melonSongId: ${melonSongId})`,
      );
      return null;
    }

    const titleYn: 'Y' | 'N' =
      $tr.find('span.icon_song.title').length > 0 ? 'Y' : 'N';
    const melonAlbmId = extractId(
      $tr.find('a[href*="goAlbumDetail"]').first().attr('href'),
    );

    return { melonSongId, songNm, titleYn, melonAlbmId };
  }

  private parseChartSongRow<T extends AnyNode>(
    $: cheerio.CheerioAPI,
    $tr: cheerio.Cheerio<T>,
  ): ScrapedChartSong | null {
    const melonSongId = $tr
      .find('input.input_check[name="input_check"]')
      .attr('value');
    if (!melonSongId) {
      this.logger.warn('차트 곡 파싱 실패: 곡 ID를 찾을 수 없습니다.');
      return null;
    }

    const $titleAnchor = $tr.find('div.ellipsis.rank01 a').first();
    const songNm = normalizeText(
      $titleAnchor.attr('title') || $titleAnchor.text(),
    );
    if (!songNm) {
      this.logger.warn(
        `차트 곡 파싱 실패: 곡명을 찾을 수 없습니다. (melonSongId: ${melonSongId})`,
      );
      return null;
    }

    const melonAlbmId = extractQueryId(
      $tr.find('a.image_type15').attr('href'),
      'albumId',
    );
    const albmNm = normalizeText(
      $tr.find('div.ellipsis.rank03 a').first().text(),
    );
    if (!melonAlbmId || !albmNm) {
      this.logger.warn(
        `차트 곡 파싱 실패: 앨범 정보를 찾을 수 없습니다. (melonSongId: ${melonSongId})`,
      );
      return null;
    }

    const albumThumbImgUrl =
      $tr.find('a.image_type15 img').attr('src')?.trim() || null;

    const artists = $tr
      .find('div.ellipsis.rank02')
      .first()
      .children('a')
      .map((_, a): ScrapedChartArtist | null => {
        const $a = $(a);
        const melonArtistId = extractQueryId($a.attr('href'), 'artistId');
        const atstNm = normalizeText($a.text());
        return melonArtistId && atstNm ? { melonArtistId, atstNm } : null;
      })
      .get()
      .filter((artist): artist is ScrapedChartArtist => artist !== null);
    if (artists.length === 0) {
      this.logger.warn(
        `차트 곡 파싱 실패: 아티스트 정보를 찾을 수 없습니다. (melonSongId: ${melonSongId})`,
      );
      return null;
    }

    return {
      melonSongId,
      songNm,
      melonAlbmId,
      albmNm,
      albumThumbImgUrl,
      artists,
    };
  }

  private async getHtml(url: string, referer?: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'X-Requested-With': 'XMLHttpRequest',
          ...(referer ? { Referer: referer } : {}),
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`멜론 요청 실패: ${url}`, error);
      throw new MelonFetchError(
        `멜론 페이지 요청에 실패했습니다. (url: ${url})`,
      );
    }

    if (!response.ok) {
      throw new MelonFetchError(
        `멜론 페이지 응답이 올바르지 않습니다. (status: ${response.status}, url: ${url})`,
      );
    }

    return response.text();
  }
}
