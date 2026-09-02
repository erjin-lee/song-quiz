import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SQ_QUIZ에 CRT_USER_KEY(등록한 유저)를 추가한다. docs/features/user-quiz-registration/spec.md
 * 5장 참고. 이 작업 환경은 bastion 터널로 실제 DB에 붙을 수 없어 migration:generate를
 * 못 돌렸다 - DB_INFO.txt의 기존 SQ_QUIZ DDL 스타일을 그대로 따라 손으로 작성했다.
 * 실제 DB 반영 전에 migration:generate로 diff가 이 파일과 일치하는지 확인 권장.
 */
export class AddQuizCrtUserKey1788400000000 implements MigrationInterface {
  name = 'AddQuizCrtUserKey1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`SQ_QUIZ\`
      ADD COLUMN \`CRT_USER_KEY\` bigint unsigned NULL COMMENT '등록한 유저 고유 ID(운영진이 생성한 기존 퀴즈는 NULL)' AFTER \`PLAY_CNT\`,
      ADD INDEX \`IDX_SQ_QUIZ_02\` (\`CRT_USER_KEY\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`SQ_QUIZ\`
      DROP INDEX \`IDX_SQ_QUIZ_02\`,
      DROP COLUMN \`CRT_USER_KEY\`
    `);
  }
}
