import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { InquiryStatus } from '../inquiry.types';

@Entity('SQ_INQUIRY', { comment: '곡 문의 내역' })
@Index('IDX_SQ_INQUIRY_QUIZ_SONG_ID', ['quizSongId'])
@Index('IDX_SQ_INQUIRY_ROOM_ID', ['roomId'])
@Index('IDX_SQ_INQUIRY_USER_ID', ['userId'])
@Index('IDX_SQ_INQUIRY_STATUS', ['status'])
@Index('IDX_SQ_INQUIRY_CRT_DT', ['crtDt'])
export class Inquiry {
  @PrimaryGeneratedColumn({
    name: 'INQUIRY_ID',
    type: 'bigint',
    unsigned: true,
    comment: '문의 ID',
  })
  inquiryId: string;

  @Column({
    name: 'QUIZ_SONG_ID',
    type: 'bigint',
    unsigned: true,
    comment: '문의 대상 곡 ID',
  })
  quizSongId: string;

  @Column({
    name: 'ROOM_ID',
    type: 'varchar',
    length: 255,
    comment: '소켓 알림 타겟팅용 방 ID',
  })
  roomId: string;

  @Column({
    name: 'USER_ID',
    type: 'varchar',
    length: 255,
    comment: '제출자 ID',
  })
  userId: string;

  @Column({
    name: 'USER_TYPE',
    type: 'varchar',
    length: 5,
    nullable: true,
    comment: '유저 / 게스트 여부',
  })
  userType: string | null;

  @Column({ name: 'CONTENT', type: 'text', comment: '유저 원문' })
  content: string;

  @Column({
    name: 'STATUS',
    type: 'varchar',
    length: 20,
    comment: '문의 처리 상태 (RECEIVED/PROCESSING/COMPLETED/FAILED)',
  })
  status: InquiryStatus;

  @Column({
    name: 'RESULT_MESSAGE',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '유저에게 보여줄 최종 메시지',
  })
  resultMessage: string | null;

  @Column({ name: 'CRT_DT', type: 'datetime', comment: '생성 일시' })
  crtDt: Date;

  @Column({ name: 'UPD_DT', type: 'datetime', comment: '수정 일시' })
  updDt: Date;
}
