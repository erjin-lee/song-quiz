import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SQ_ALBM_ATST/SQ_SONG_ATST(앨범/곡 다대다 아티스트 관계 테이블)를 생성한다.
 * migration:generate 결과를 그대로 쓰되, TypeORM이 diff 대상으로 보지 않는
 * CHECK 제약(MAIN_YN은 'Y'/'N'만 허용)은 자동 생성되지 않아 수동으로
 * 추가했다. BackfillSongAlbumArtistLinks보다 먼저 실행돼야 한다(백필이
 * 이 테이블에 INSERT하므로).
 */
export class CreateAlbmAtstAndSongAtstTables1788191000000 implements MigrationInterface {
  name = 'CreateAlbmAtstAndSongAtstTables1788191000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`SQ_ALBM_ATST\` (
        \`ALBM_ATST_ID\` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '앨범 아티스트 관계 ID',
        \`ALBM_ID\` bigint unsigned NOT NULL COMMENT '앨범 ID',
        \`ATST_ID\` bigint unsigned NOT NULL COMMENT '아티스트 ID',
        \`ATST_SEQ\` int unsigned NOT NULL DEFAULT '1' COMMENT '아티스트 표시 순서',
        \`MAIN_YN\` char(1) NOT NULL DEFAULT 'N' COMMENT '대표 아티스트 여부 (Y/N)',
        \`CRT_DT\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',
        PRIMARY KEY (\`ALBM_ATST_ID\`),
        UNIQUE KEY \`UK_SQ_ALBM_ATST_01\` (\`ALBM_ID\`,\`ATST_ID\`),
        UNIQUE KEY \`UK_SQ_ALBM_ATST_02\` (\`ALBM_ID\`,\`ATST_SEQ\`),
        KEY \`IDX_SQ_ALBM_ATST_01\` (\`ATST_ID\`),
        CONSTRAINT \`CK_SQ_ALBM_ATST_MAIN_YN\` CHECK ((\`MAIN_YN\` in (_utf8mb4'Y',_utf8mb4'N')))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='앨범 아티스트 관계'
    `);

    await queryRunner.query(`
      CREATE TABLE \`SQ_SONG_ATST\` (
        \`SONG_ATST_ID\` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '곡 아티스트 관계 ID',
        \`SONG_ID\` bigint unsigned NOT NULL COMMENT '곡 ID',
        \`ATST_ID\` bigint unsigned NOT NULL COMMENT '아티스트 ID',
        \`ATST_SEQ\` int unsigned NOT NULL DEFAULT '1' COMMENT '아티스트 표시 순서',
        \`MAIN_YN\` char(1) NOT NULL DEFAULT 'N' COMMENT '대표 아티스트 여부 (Y/N)',
        \`CRT_DT\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',
        PRIMARY KEY (\`SONG_ATST_ID\`),
        UNIQUE KEY \`UK_SQ_SONG_ATST_01\` (\`SONG_ID\`,\`ATST_ID\`),
        UNIQUE KEY \`UK_SQ_SONG_ATST_02\` (\`SONG_ID\`,\`ATST_SEQ\`),
        KEY \`IDX_SQ_SONG_ATST_01\` (\`ATST_ID\`),
        CONSTRAINT \`CK_SQ_SONG_ATST_MAIN_YN\` CHECK ((\`MAIN_YN\` in (_utf8mb4'Y',_utf8mb4'N')))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='곡 아티스트 관계'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`SQ_SONG_ATST\``);
    await queryRunner.query(`DROP TABLE \`SQ_ALBM_ATST\``);
  }
}
