import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('SQ_NOTI', { comment: '알림' })
@Index('IDX_SQ_NOTI_01', ['userKey'])
export class Notification {
  @PrimaryGeneratedColumn({
    name: 'NOTI_ID',
    type: 'bigint',
    unsigned: true,
    comment: '알림 ID',
  })
  notiId: string;

  @Column({
    name: 'NOTI_TYPE',
    type: 'varchar',
    length: 30,
    comment: '알림 종류(예: QUIZ_REG_COMPLETED)',
  })
  notiType: string;

  @Column({
    name: 'USER_KEY',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '대상 유저 고유 ID. NULL이면 전체 유저 대상 공지',
  })
  userKey: string | null;

  @Column({ name: 'TITLE', type: 'varchar', length: 200, comment: '알림 제목' })
  title: string;

  @Column({
    name: 'MESSAGE',
    type: 'varchar',
    length: 1000,
    comment: '알림 내용(발송 시점에 완성한 문장)',
  })
  message: string;

  @Column({
    name: 'PARAMS',
    type: 'json',
    nullable: true,
    comment: '메시지를 구성한 동적 값(다국어 전환 대비 구조화 저장)',
  })
  params: Record<string, unknown> | null;

  @Column({
    name: 'LINK_PATH',
    type: 'varchar',
    length: 300,
    nullable: true,
    comment: '클릭 시 이동할 프런트 라우트',
  })
  linkPath: string | null;

  @Column({
    name: 'CRT_DT',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    comment: '생성일시',
  })
  crtDt: Date;
}
