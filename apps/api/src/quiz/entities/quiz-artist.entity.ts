import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Artist } from './artist.entity';
import { Quiz } from './quiz.entity';

@Entity('SQ_QUIZ_ATST')
export class QuizArtist {
  @PrimaryGeneratedColumn({
    name: 'QUIZ_ATST_ID',
    type: 'bigint',
    unsigned: true,
  })
  quizAtstId: string;

  @Column({ name: 'QUIZ_ID', type: 'bigint', unsigned: true })
  quizId: string;

  @Column({ name: 'ATST_ID', type: 'bigint', unsigned: true })
  atstId: string;

  @Column({ name: 'CRT_DT', type: 'datetime' })
  crtDt: Date;

  @ManyToOne(() => Quiz)
  @JoinColumn({ name: 'QUIZ_ID' })
  quiz: Quiz;

  @ManyToOne(() => Artist)
  @JoinColumn({ name: 'ATST_ID' })
  artist: Artist;
}