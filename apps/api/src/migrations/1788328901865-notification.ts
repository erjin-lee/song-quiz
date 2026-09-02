import { MigrationInterface, QueryRunner } from "typeorm";

export class Notification1788328901865 implements MigrationInterface {
    name = 'Notification1788328901865'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`SQ_NOTI_READ\` (\`NOTI_READ_ID\` bigint UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '알림 읽음 ID', \`NOTI_ID\` bigint UNSIGNED NOT NULL COMMENT '알림 ID', \`USER_KEY\` bigint UNSIGNED NOT NULL COMMENT '읽은 유저 고유 ID', \`READ_DT\` datetime NOT NULL COMMENT '읽은 시각' DEFAULT CURRENT_TIMESTAMP, INDEX \`IDX_SQ_NOTI_READ_01\` (\`USER_KEY\`), UNIQUE INDEX \`UK_SQ_NOTI_READ_01\` (\`NOTI_ID\`, \`USER_KEY\`), PRIMARY KEY (\`NOTI_READ_ID\`)) ENGINE=InnoDB COMMENT="유저별 알림 읽음 여부"`);
        await queryRunner.query(`CREATE TABLE \`SQ_NOTI\` (\`NOTI_ID\` bigint UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '알림 ID', \`NOTI_TYPE\` varchar(30) NOT NULL COMMENT '알림 종류(예: QUIZ_REG_COMPLETED)', \`USER_KEY\` bigint UNSIGNED NULL COMMENT '대상 유저 고유 ID. NULL이면 전체 유저 대상 공지', \`TITLE\` varchar(200) NOT NULL COMMENT '알림 제목', \`MESSAGE\` varchar(1000) NOT NULL COMMENT '알림 내용(발송 시점에 완성한 문장)', \`PARAMS\` json NULL COMMENT '메시지를 구성한 동적 값(다국어 전환 대비 구조화 저장)', \`LINK_PATH\` varchar(300) NULL COMMENT '클릭 시 이동할 프런트 라우트', \`CRT_DT\` datetime NOT NULL COMMENT '생성일시' DEFAULT CURRENT_TIMESTAMP, INDEX \`IDX_SQ_NOTI_01\` (\`USER_KEY\`), PRIMARY KEY (\`NOTI_ID\`)) ENGINE=InnoDB COMMENT="알림"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_SQ_NOTI_01\` ON \`SQ_NOTI\``);
        await queryRunner.query(`DROP TABLE \`SQ_NOTI\``);
        await queryRunner.query(`DROP INDEX \`UK_SQ_NOTI_READ_01\` ON \`SQ_NOTI_READ\``);
        await queryRunner.query(`DROP INDEX \`IDX_SQ_NOTI_READ_01\` ON \`SQ_NOTI_READ\``);
        await queryRunner.query(`DROP TABLE \`SQ_NOTI_READ\``);
    }

}
