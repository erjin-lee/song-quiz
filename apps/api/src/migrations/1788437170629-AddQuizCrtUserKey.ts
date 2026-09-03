import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuizCrtUserKey1788437170629 implements MigrationInterface {
  name = 'AddQuizCrtUserKey1788437170629';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`SQ_QUIZ\` ADD \`CRT_USER_KEY\` bigint UNSIGNED NULL COMMENT '등록한 유저 고유 ID(운영진이 생성한 기존 퀴즈는 NULL)'`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_SQ_QUIZ_02\` ON \`SQ_QUIZ\` (\`CRT_USER_KEY\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`IDX_SQ_QUIZ_02\` ON \`SQ_QUIZ\``);
    await queryRunner.query(
      `ALTER TABLE \`SQ_QUIZ\` DROP COLUMN \`CRT_USER_KEY\``,
    );
  }
}
