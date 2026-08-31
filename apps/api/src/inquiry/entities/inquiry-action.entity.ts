import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import {
  InquiryActionStatus,
  InquiryConfidence,
  InquiryFunctionName,
  InquiryReviewedVia,
} from '../inquiry.types';

/**
 * 문의(SQ_INQUIRY) 하나에 대해 AI가 제안한 조치의 생명주기를 담는다
 * (PROPOSED -> PENDING_REVIEW/APPROVED/REJECTED -> EXECUTING -> COMPLETED/FAILED).
 * SQ_INQUIRY의 MATCHED_FUNCTION/MATCHED_ARGS/CONFIDENCE를 대체한다 - 이 테이블 도입
 * 이후 그 컬럼들은 코드에서 더 이상 쓰지 않는다(추후 DROP COLUMN 예정, docs/adr 없음 -
 * DB_INFO.txt가 실제 스키마의 source of truth).
 */
@Entity('SQ_INQUIRY_ACTION')
export class InquiryAction {
  @PrimaryGeneratedColumn({
    name: 'ACTION_ID',
    type: 'bigint',
    unsigned: true,
  })
  actionId: string;

  @Column({ name: 'INQUIRY_ID', type: 'bigint', unsigned: true })
  inquiryId: string;

  // 문의 하나에 조치가 여러 번(재분류/재시도) 있을 수 있다는 전제의 컬럼이지만,
  // 지금은 그런 플로우가 없어 항상 1이다.
  @Column({ name: 'ACTION_SEQ', type: 'int', unsigned: true })
  actionSeq: number;

  @Column({ name: 'ACTION_TYPE', type: 'varchar', length: 100 })
  actionType: InquiryFunctionName;

  @Column({ name: 'ACTION_ARGS', type: 'json', nullable: true })
  actionArgs: Record<string, unknown> | null;

  @Column({ name: 'CONFIDENCE', type: 'varchar', length: 8, nullable: true })
  confidence: InquiryConfidence | null;

  @Column({ name: 'AI_MODEL', type: 'varchar', length: 100, nullable: true })
  aiModel: string | null;

  @Column({
    name: 'PROMPT_VERSION',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  promptVersion: string | null;

  @Column({ name: 'AI_REASON', type: 'text', nullable: true })
  aiReason: string | null;

  @Column({ name: 'STATUS', type: 'varchar', length: 20 })
  status: InquiryActionStatus;

  @Column({ name: 'BEFORE_VALUE', type: 'json', nullable: true })
  beforeValue: Record<string, unknown> | null;

  @Column({ name: 'AFTER_VALUE', type: 'json', nullable: true })
  afterValue: Record<string, unknown> | null;

  @Column({
    name: 'REVIEWED_BY_USER_KEY',
    type: 'bigint',
    unsigned: true,
    nullable: true,
  })
  reviewedByUserKey: string | null;

  @Column({
    name: 'REVIEWED_VIA',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  reviewedVia: InquiryReviewedVia | null;

  @Column({ name: 'REVIEWED_DT', type: 'datetime', nullable: true })
  reviewedDt: Date | null;

  @Column({ name: 'EXECUTED_DT', type: 'datetime', nullable: true })
  executedDt: Date | null;

  @Column({ name: 'CRT_DT', type: 'datetime' })
  crtDt: Date;

  @Column({ name: 'UPD_DT', type: 'datetime' })
  updDt: Date;
}
