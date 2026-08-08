import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { QuizAnswer } from './quiz-answer.entity';
import { Quiz } from './quiz.entity';
import { Song } from './song.entity';

@Entity('SQ_QUIZ_SONG')
export class QuizSong {
  @PrimaryGeneratedColumn({
    name: 'QUIZ_SONG_ID',
    type: 'bigint',
    unsigned: true,
  })
  quizSongId: string;

  @Column({ name: 'QUIZ_ID', type: 'bigint', unsigned: true })
  quizId: string;

  @Column({ name: 'SONG_ID', type: 'bigint', unsigned: true })
  songId: string;

  @Column({ name: 'QUIZ_SEQ', type: 'int', unsigned: true })
  quizSeq: number;

  @Column({ name: 'YOUTUBE_URL', type: 'varchar', length: 500 })
  youtubeUrl: string;

  @Column({
    name: 'YOUTUBE_VIDEO_ID',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  youtubeVideoId: string | null;

  @Column({ name: 'START_SEC', type: 'int', unsigned: true, default: 0 })
  startSec: number | null;

  @Column({ name: 'END_SEC', type: 'int', unsigned: true, nullable: true })
  endSec: number | null;

  @Column({ name: 'CRT_DT', type: 'datetime' })
  crtDt: Date;

  @Column({ name: 'UPD_DT', type: 'datetime' })
  updDt: Date;

  @ManyToOne(() => Quiz)
  @JoinColumn({ name: 'QUIZ_ID' })
  quiz: Quiz;

  @ManyToOne(() => Song)
  @JoinColumn({ name: 'SONG_ID' })
  song: Song;

  @OneToMany(() => QuizAnswer, (answer) => answer.quizSong)
  answers: QuizAnswer[];
}
