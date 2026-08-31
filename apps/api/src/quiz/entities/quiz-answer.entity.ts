import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { QuizSong } from './quiz-song.entity';

@Entity('SQ_QUIZ_SONG_ANSWER', { comment: '퀴즈 출제곡 허용 정답' })
@Index('UK_SQ_QUIZ_SONG_ANSWER_01', ['quizSongId', 'answerTxt'], {
  unique: true,
})
@Index('IDX_SQ_QUIZ_SONG_ANSWER_01', ['quizSongId'])
@Index('IDX_SQ_QUIZ_SONG_ANSWER_02', ['answerTxt'])
export class QuizAnswer {
  @PrimaryGeneratedColumn({
    name: 'QUIZ_SONG_ANSWER_ID',
    type: 'bigint',
    unsigned: true,
    comment: '퀴즈 출제곡 정답 ID',
  })
  quizAnswerId: string;

  @Column({
    name: 'QUIZ_SONG_ID',
    type: 'bigint',
    unsigned: true,
    comment: '퀴즈 출제곡 ID',
  })
  quizSongId: string;

  @Column({
    name: 'ANSWER_TXT',
    type: 'varchar',
    length: 300,
    comment: '허용 정답',
  })
  answerTxt: string;

  @Column({
    name: 'ANSWER_TYPE',
    type: 'varchar',
    length: 12,
    nullable: true,
    comment: '정답 유형',
  })
  answerType: string | null;

  @Column({
    name: 'CONFIDENCE',
    type: 'varchar',
    length: 8,
    nullable: true,
    comment: '신뢰도',
  })
  confidence: string | null;

  @Column({
    name: 'ACTIVE_YN',
    type: 'char',
    length: 1,
    default: 'Y',
    comment: '활성 여부(Y/N)',
  })
  isActive: string;

  @Column({
    name: 'CRT_DT',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    comment: '생성일시',
  })
  crtDt: Date;

  @Column({
    name: 'UPD_DT',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
    comment: '수정일시',
  })
  updDt: Date;

  @ManyToOne(() => QuizSong, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'QUIZ_SONG_ID' })
  quizSong: QuizSong;
}
