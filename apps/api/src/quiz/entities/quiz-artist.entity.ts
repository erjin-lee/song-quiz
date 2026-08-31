import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Artist } from './artist.entity';
import { Quiz } from './quiz.entity';

@Entity('SQ_QUIZ_ATST', { comment: '퀴즈 대상 아티스트' })
@Index('UK_SQ_QUIZ_ATST_01', ['quizId', 'atstId'], { unique: true })
@Index('IDX_SQ_QUIZ_ATST_01', ['quizId'])
@Index('IDX_SQ_QUIZ_ATST_02', ['atstId'])
export class QuizArtist {
  @PrimaryGeneratedColumn({
    name: 'QUIZ_ATST_ID',
    type: 'bigint',
    unsigned: true,
    comment: '퀴즈 아티스트 ID',
  })
  quizAtstId: string;

  @Column({
    name: 'QUIZ_ID',
    type: 'bigint',
    unsigned: true,
    comment: '퀴즈 ID',
  })
  quizId: string;

  @Column({
    name: 'ATST_ID',
    type: 'bigint',
    unsigned: true,
    comment: '아티스트 ID',
  })
  atstId: string;

  @Column({ name: 'CRT_DT', type: 'datetime', comment: '생성일시' })
  crtDt: Date;

  @ManyToOne(() => Quiz, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'QUIZ_ID' })
  quiz: Quiz;

  @ManyToOne(() => Artist, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'ATST_ID' })
  artist: Artist;
}
