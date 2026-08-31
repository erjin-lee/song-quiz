import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { InquiryActionLogSource, InquiryActionStatus } from '../inquiry.types';

/**
 * SQ_INQUIRY_ACTION의 상태 전이를 감사 로그로 남긴다. EVENT_TYPE은 별도 vocabulary 없이
 * InquiryActionStatus 값(전이한 상태 이름)을 그대로 쓴다.
 */
@Entity('SQ_INQUIRY_ACTION_LOG')
export class InquiryActionLog {
  @PrimaryGeneratedColumn({
    name: 'ACTION_LOG_ID',
    type: 'bigint',
    unsigned: true,
  })
  actionLogId: string;

  @Column({ name: 'ACTION_ID', type: 'bigint', unsigned: true })
  actionId: string;

  @Column({ name: 'INQUIRY_ID', type: 'bigint', unsigned: true })
  inquiryId: string;

  @Column({ name: 'EVENT_TYPE', type: 'varchar', length: 30 })
  eventType: InquiryActionStatus;

  @Column({ name: 'SOURCE', type: 'varchar', length: 10 })
  source: InquiryActionLogSource;

  @Column({
    name: 'ACTOR_USER_KEY',
    type: 'bigint',
    unsigned: true,
    nullable: true,
  })
  actorUserKey: string | null;

  @Column({
    name: 'SLACK_TEAM_ID',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  slackTeamId: string | null;

  @Column({
    name: 'SLACK_USER_ID',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  slackUserId: string | null;

  @Column({ name: 'BEFORE_VALUE', type: 'json', nullable: true })
  beforeValue: Record<string, unknown> | null;

  @Column({ name: 'AFTER_VALUE', type: 'json', nullable: true })
  afterValue: Record<string, unknown> | null;

  @Column({ name: 'DETAIL', type: 'json', nullable: true })
  detail: Record<string, unknown> | null;

  @Column({ name: 'CRT_DT', type: 'datetime' })
  crtDt: Date;
}
