import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { InquiryActionLogSource, InquiryActionStatus } from '../inquiry.types';

/**
 * SQ_INQUIRY_ACTION의 상태 전이를 감사 로그로 남긴다. EVENT_TYPE은 별도 vocabulary 없이
 * InquiryActionStatus 값(전이한 상태 이름)을 그대로 쓴다.
 */
@Entity('SQ_INQUIRY_ACTION_LOG', { comment: '문의 조치 Audit Log' })
@Index('IDX_SQ_INQUIRY_ACTION_LOG_01', ['actionId', 'crtDt'])
@Index('IDX_SQ_INQUIRY_ACTION_LOG_02', ['inquiryId', 'crtDt'])
@Index('IDX_SQ_INQUIRY_ACTION_LOG_03', ['actorUserKey', 'crtDt'])
export class InquiryActionLog {
  @PrimaryGeneratedColumn({
    name: 'ACTION_LOG_ID',
    type: 'bigint',
    unsigned: true,
    comment: '문의 조치 로그 ID',
  })
  actionLogId: string;

  @Column({
    name: 'ACTION_ID',
    type: 'bigint',
    unsigned: true,
    comment: '문의 조치 ID',
  })
  actionId: string;

  @Column({
    name: 'INQUIRY_ID',
    type: 'bigint',
    unsigned: true,
    comment: '문의 ID',
  })
  inquiryId: string;

  @Column({
    name: 'EVENT_TYPE',
    type: 'varchar',
    length: 30,
    comment: '이벤트 유형',
  })
  eventType: InquiryActionStatus;

  @Column({
    name: 'SOURCE',
    type: 'varchar',
    length: 10,
    comment: '발생 주체 (AI/ADMIN/SLACK/SYSTEM)',
  })
  source: InquiryActionLogSource;

  @Column({
    name: 'ACTOR_USER_KEY',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '내부 관리자 USER_KEY',
  })
  actorUserKey: string | null;

  @Column({
    name: 'SLACK_TEAM_ID',
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Slack Workspace ID',
  })
  slackTeamId: string | null;

  @Column({
    name: 'SLACK_USER_ID',
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Slack 사용자 ID',
  })
  slackUserId: string | null;

  @Column({
    name: 'BEFORE_VALUE',
    type: 'json',
    nullable: true,
    comment: '변경 전 값',
  })
  beforeValue: Record<string, unknown> | null;

  @Column({
    name: 'AFTER_VALUE',
    type: 'json',
    nullable: true,
    comment: '변경 후 값',
  })
  afterValue: Record<string, unknown> | null;

  @Column({
    name: 'DETAIL',
    type: 'json',
    nullable: true,
    comment: '이벤트 상세 정보',
  })
  detail: Record<string, unknown> | null;

  @Column({
    name: 'CRT_DT',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    comment: '생성 일시',
  })
  crtDt: Date;
}
