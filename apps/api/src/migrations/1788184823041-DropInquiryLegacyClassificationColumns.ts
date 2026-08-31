import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SQ_INQUIRY_ACTION 도입 이후 더 이상 코드에서 읽지 않는 SQ_INQUIRY의 1/2단계
 * 판별 컬럼(CONFIDENCE/MATCHED_ARGS/MATCHED_FUNCTION)을 제거한다 - 이 값들은
 * 이제 SQ_INQUIRY_ACTION.confidence/actionArgs/actionType이 대체한다
 * (inquiry-action.entity.ts 상단 주석 참고). down()은 컬럼 구조만 복구할 뿐
 * DROP된 값은 되돌리지 않는다.
 */
export class DropInquiryLegacyClassificationColumns1788184823041 implements MigrationInterface {
  name = 'DropInquiryLegacyClassificationColumns1788184823041';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`SQ_INQUIRY\` DROP COLUMN \`CONFIDENCE\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`SQ_INQUIRY\` DROP COLUMN \`MATCHED_ARGS\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`SQ_INQUIRY\` DROP COLUMN \`MATCHED_FUNCTION\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`SQ_INQUIRY\` ADD \`MATCHED_FUNCTION\` varchar(255) NULL COMMENT '1단계 판별 결과 함수명'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`SQ_INQUIRY\` ADD \`MATCHED_ARGS\` json NULL COMMENT '1단계에서 추출된 인자'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`SQ_INQUIRY\` ADD \`CONFIDENCE\` varchar(8) NULL COMMENT '2단계 검증 결과 (LOW/MEDIUM/HIGH)'`,
    );
  }
}
