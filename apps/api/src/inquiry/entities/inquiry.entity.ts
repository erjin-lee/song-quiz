import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { InquiryStatus } from '../inquiry.types';

@Entity('SQ_INQUIRY')
export class Inquiry {
  @PrimaryGeneratedColumn({
    name: 'INQUIRY_ID',
    type: 'bigint',
    unsigned: true,
  })
  inquiryId: string;

  @Column({ name: 'QUIZ_SONG_ID', type: 'bigint', unsigned: true })
  quizSongId: string;

  @Column({ name: 'ROOM_ID', type: 'varchar', length: 255 })
  roomId: string;

  @Column({ name: 'USER_ID', type: 'varchar', length: 255 })
  userId: string;

  @Column({ name: 'USER_TYPE', type: 'varchar', length: 5, nullable: true })
  userType: string | null;

  @Column({ name: 'CONTENT', type: 'text' })
  content: string;

  @Column({ name: 'STATUS', type: 'varchar', length: 20 })
  status: InquiryStatus;

  @Column({
    name: 'RESULT_MESSAGE',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  resultMessage: string | null;

  @Column({ name: 'CRT_DT', type: 'datetime' })
  crtDt: Date;

  @Column({ name: 'UPD_DT', type: 'datetime' })
  updDt: Date;
}
