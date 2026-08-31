import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { QuizAnswer } from './quiz-answer.entity';
import { Quiz } from './quiz.entity';
import { Song } from './song.entity';

@Entity('SQ_QUIZ_SONG', { comment: '퀴즈 출제곡' })
@Index('UK_SQ_QUIZ_SONG_01', ['quizId', 'quizSeq'], { unique: true })
@Index('IDX_SQ_QUIZ_SONG_01', ['quizId'])
@Index('IDX_SQ_QUIZ_SONG_02', ['songId'])
export class QuizSong {
  @PrimaryGeneratedColumn({
    name: 'QUIZ_SONG_ID',
    type: 'bigint',
    unsigned: true,
    comment: '퀴즈 노래 ID',
  })
  quizSongId: string;

  @Column({
    name: 'QUIZ_ID',
    type: 'bigint',
    unsigned: true,
    comment: '퀴즈 ID',
  })
  quizId: string;

  @Column({
    name: 'SONG_ID',
    type: 'bigint',
    unsigned: true,
    comment: '노래 ID',
  })
  songId: string;

  @Column({
    name: 'QUIZ_SEQ',
    type: 'int',
    unsigned: true,
    comment: '출제 순서',
  })
  quizSeq: number;

  @Column({
    name: 'YTB_URL',
    type: 'varchar',
    length: 500,
    comment: '유튜브 URL',
  })
  youtubeUrl: string;

  @Column({
    name: 'YTB_VIDEO_ID',
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: '유튜브 영상 ID',
  })
  youtubeVideoId: string | null;

  /** 현재 앱에서는 사용하지 않지만 추후 사용 가능성으로 DB에 남겨둔 컬럼이다. */
  @Column({
    name: 'YTB_THUMB_IMG_URL',
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: '유튜브 썸네일',
  })
  youtubeThumbnailUrl: string | null;

  @Column({
    name: 'DURATION',
    type: 'int',
    unsigned: true,
    nullable: true,
    comment: '길이(초)',
  })
  durationSec: number | null;

  @Column({
    name: 'START_SEC',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '재생 시작 위치(초)',
  })
  startSec: number | null;

  @Column({
    name: 'END_SEC',
    type: 'int',
    unsigned: true,
    nullable: true,
    comment: '재생 종료 위치(초)',
  })
  endSec: number | null;

  @Column({ name: 'CRT_DT', type: 'datetime', comment: '생성일시' })
  crtDt: Date;

  @Column({ name: 'UPD_DT', type: 'datetime', comment: '수정일시' })
  updDt: Date;

  @ManyToOne(() => Quiz, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'QUIZ_ID' })
  quiz: Quiz;

  @ManyToOne(() => Song, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'SONG_ID' })
  song: Song;

  @OneToMany(() => QuizAnswer, (answer) => answer.quizSong)
  answers: QuizAnswer[];
}
