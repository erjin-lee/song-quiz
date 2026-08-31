import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 관리자(SQ_USER)와 Slack 계정을 1:1로 연결한다(UK_SQ_USER_SLACK_01: 팀+유저 조합,
 * UK_SQ_USER_SLACK_02: userKey - 관리자 한 명당 Slack 계정 하나만 연결 가능).
 * apps/api/src/slack의 Slack 인터랙션(승인/반려 버튼)이 이 매핑으로 클릭한 Slack
 * 사용자를 실제 관리자 USER_KEY로 해석한다(ADR-0008).
 */
@Entity('SQ_USER_SLACK')
export class UserSlack {
  @PrimaryGeneratedColumn({
    name: 'USER_SLACK_ID',
    type: 'bigint',
    unsigned: true,
  })
  userSlackId: string;

  @Column({ name: 'USER_KEY', type: 'bigint', unsigned: true })
  userKey: string;

  @Column({ name: 'SLACK_TEAM_ID', type: 'varchar', length: 50 })
  slackTeamId: string;

  @Column({ name: 'SLACK_USER_ID', type: 'varchar', length: 50 })
  slackUserId: string;

  @Column({ name: 'USE_YN', type: 'char', length: 1, default: 'Y' })
  isActive: string;

  @Column({ name: 'CRT_DT', type: 'datetime' })
  crtDt: Date;

  @Column({ name: 'UPD_DT', type: 'datetime' })
  updDt: Date;
}
