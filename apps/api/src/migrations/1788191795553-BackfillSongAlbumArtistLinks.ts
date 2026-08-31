import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SQ_SONG_ATST/SQ_ALBM_ATST 도입 이전에 만들어진 기존 SQ_SONG/SQ_ALBM 행은
 * 정션 테이블에 아무 링크가 없다. 각 행의 기존 단일 ATST_ID를 대표 아티스트
 * (ATST_SEQ=1, MAIN_YN='Y')로 백필한다 - 이후 읽기 경로를 SongArtist/
 * AlbumArtist 경유로 전환해도(별도 PR) 기존 곡/앨범의 아티스트가 비어 보이지
 * 않도록 하기 위한 선행 작업이다.
 *
 * INSERT IGNORE로 UK_SQ_SONG_ATST_01/UK_SQ_ALBM_ATST_01 유니크 제약과
 * 충돌하는 행(스크래퍼가 이미 만들어둔 링크)은 건너뛰므로 재실행해도 안전하다.
 *
 * down()은 no-op이다 - 백필된 행만 정확히 구분해서 지울 방법이 없다(이후
 * 정상적으로 생긴 단일 아티스트 링크와 데이터만으로는 구별 불가하다).
 */
export class BackfillSongAlbumArtistLinks1788191795553 implements MigrationInterface {
  name = 'BackfillSongAlbumArtistLinks1788191795553';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT IGNORE INTO \`SQ_SONG_ATST\` (\`SONG_ID\`, \`ATST_ID\`, \`ATST_SEQ\`, \`MAIN_YN\`)
      SELECT \`SONG_ID\`, \`ATST_ID\`, 1, 'Y' FROM \`SQ_SONG\`
    `);

    await queryRunner.query(`
      INSERT IGNORE INTO \`SQ_ALBM_ATST\` (\`ALBM_ID\`, \`ATST_ID\`, \`ATST_SEQ\`, \`MAIN_YN\`)
      SELECT \`ALBM_ID\`, \`ATST_ID\`, 1, 'Y' FROM \`SQ_ALBM\`
    `);
  }

  public async down(): Promise<void> {
    // no-op - 위 설명 참고
  }
}
