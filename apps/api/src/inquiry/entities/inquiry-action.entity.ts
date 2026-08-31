import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
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
 * 이후 그 컬럼들은 코드에서 더 이상 쓰지 않았고, DropInquiryLegacyClassificationColumns
 * 마이그레이션으로 실제 DB에서도 제거했다.
 */
@Entity('SQ_INQUIRY_ACTION', { comment: '문의 AI 조치' })
@Index('UK_SQ_INQUIRY_ACTION_01', ['inquiryId', 'actionSeq'], { unique: true })
@Index('IDX_SQ_INQUIRY_ACTION_01', ['status', 'crtDt'])
@Index('IDX_SQ_INQUIRY_ACTION_02', ['actionType'])
@Index('IDX_SQ_INQUIRY_ACTION_03', ['reviewedByUserKey'])
export class InquiryAction {
  @PrimaryGeneratedColumn({
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

  // 문의 하나에 조치가 여러 번(재분류/재시도) 있을 수 있다는 전제의 컬럼이지만,
  // 지금은 그런 플로우가 없어 항상 1이다.
  @Column({
    name: 'ACTION_SEQ',
    type: 'int',
    unsigned: true,
    default: 1,
    comment: '문의 내 조치 순번',
  })
  actionSeq: number;

  @Column({
    name: 'ACTION_TYPE',
    type: 'varchar',
    length: 100,
    comment: '조치 유형',
  })
  actionType: InquiryFunctionName;

  @Column({
    name: 'ACTION_ARGS',
    type: 'json',
    nullable: true,
    comment: '조치 실행 인자',
  })
  actionArgs: Record<string, unknown> | null;

  @Column({
    name: 'CONFIDENCE',
    type: 'varchar',
    length: 8,
    nullable: true,
    comment: 'AI 검증 신뢰도 (LOW/MEDIUM/HIGH)',
  })
  confidence: InquiryConfidence | null;

  @Column({
    name: 'AI_MODEL',
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: '판단에 사용한 AI 모델',
  })
  aiModel: string | null;

  @Column({
    name: 'PROMPT_VERSION',
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: '판단에 사용한 프롬프트 버전',
  })
  promptVersion: string | null;

  @Column({
    name: 'AI_REASON',
    type: 'text',
    nullable: true,
    comment: 'AI 판단 근거',
  })
  aiReason: string | null;

  @Column({
    name: 'STATUS',
    type: 'varchar',
    length: 20,
    default: 'PROPOSED',
    comment:
      '조치 상태 (PROPOSED/PENDING_REVIEW/APPROVED/REJECTED/EXECUTING/COMPLETED/FAILED)',
  })
  status: InquiryActionStatus;

  @Column({
    name: 'BEFORE_VALUE',
    type: 'json',
    nullable: true,
    comment: '조치 전 데이터 Snapshot',
  })
  beforeValue: Record<string, unknown> | null;

  @Column({
    name: 'AFTER_VALUE',
    type: 'json',
    nullable: true,
    comment: '조치 후 데이터 Snapshot',
  })
  afterValue: Record<string, unknown> | null;

  @Column({
    name: 'REVIEWED_BY_USER_KEY',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '검토 관리자 USER_KEY',
  })
  reviewedByUserKey: string | null;

  @Column({
    name: 'REVIEWED_VIA',
    type: 'varchar',
    length: 10,
    nullable: true,
    comment: '검토 경로 (ADMIN/SLACK)',
  })
  reviewedVia: InquiryReviewedVia | null;

  @Column({
    name: 'REVIEWED_DT',
    type: 'datetime',
    nullable: true,
    comment: '검토 일시',
  })
  reviewedDt: Date | null;

  @Column({
    name: 'EXECUTED_DT',
    type: 'datetime',
    nullable: true,
    comment: '조치 실행 완료 일시',
  })
  executedDt: Date | null;

  @Column({
    name: 'CRT_DT',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    comment: '생성 일시',
  })
  crtDt: Date;

  @Column({
    name: 'UPD_DT',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
    comment: '수정 일시',
  })
  updDt: Date;
}
