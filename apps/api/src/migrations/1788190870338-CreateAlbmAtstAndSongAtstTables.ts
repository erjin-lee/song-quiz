import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SQ_ALBM_ATST/SQ_SONG_ATST를 bastion 터널로 직접 생성한 뒤 이 마이그레이션을
 * 소급 작성했다 - up()의 DDL은 실제 DB에 이미 적용된 것과 동일하다. 이
 * 마이그레이션 자체는 prod DB에서 다시 실행하지 않고(테이블이 이미 있음),
 * migrations 테이블에 완료 레코드만 수동으로 추가한다(PR 설명 참고). 앞으로의
 * 스키마 변경은 엔티티 수정 -> migration:generate 순서를 따른다.
 */
export class CreateAlbmAtstAndSongAtstTables1788190870338 implements MigrationInterface {
  name = 'CreateAlbmAtstAndSongAtstTables1788190870338';

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
