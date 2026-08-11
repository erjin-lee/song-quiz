import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { QuizSong } from './quiz-song.entity';

@Entity('SQ_QUIZ_ANSWER')
export class QuizAnswer {
  @PrimaryGeneratedColumn({
    name: 'QUIZ_ANSWER_ID',
    type: 'bigint',
    unsigned: true,
  })
  quizAnswerId: string;

  @Column({ name: 'QUIZ_SONG_ID', type: 'bigint', unsigned: true })
  quizSongId: string;

  @Column({ name: 'ANSWER_TXT', type: 'varchar', length: 300 })
  answerTxt: string;

  @Column({
    name: 'ANSWER_TYPE',
    type: 'varchar',
    length: 12,
    nullable: true,
  })
  answerType: string | null;

  @Column({ name: 'CONFIDENCE', type: 'varchar', length: 8, nullable: true })
  confidence: string | null;

  @Column({ name: 'IS_ACTIVE', type: 'varchar', length: 1, default: 'Y' })
  isActive: string;

  @Column({ name: 'CRT_DT', type: 'datetime' })
  crtDt: Date;

  @Column({ name: 'UPD_DT', type: 'datetime' })
  updDt: Date;

  @ManyToOne(() => QuizSong)
  @JoinColumn({ name: 'QUIZ_SONG_ID' })
  quizSong: QuizSong;
}
