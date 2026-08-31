import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('SQ_QUIZ', { comment: '노래 맞추기 퀴즈' })
@Index('IDX_SQ_QUIZ_01', ['useYn'])
export class Quiz {
  @PrimaryGeneratedColumn({
    name: 'QUIZ_ID',
    type: 'bigint',
    unsigned: true,
    comment: '퀴즈 ID',
  })
  quizId: string;

  @Column({
    name: 'QUIZ_TTL',
    type: 'varchar',
    length: 200,
    comment: '퀴즈 제목',
  })
  quizTtl: string;

  @Column({
    name: 'QUIZ_DESC',
    type: 'varchar',
    length: 1000,
    nullable: true,
    comment: '퀴즈 설명',
  })
  quizDesc: string | null;

  @Column({
    name: 'THUMB_IMG_URL',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '퀴즈 썸네일 이미지',
  })
  thumbImgUrl: string | null;

  @Column({
    name: 'PLAY_CNT',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '플레이 횟수',
  })
  playCnt: number;

  @Column({
    name: 'USE_YN',
    type: 'char',
    length: 1,
    default: 'Y',
    comment: '사용 여부',
  })
  useYn: string;

  @Column({ name: 'CRT_DT', type: 'datetime', comment: '생성일시' })
  crtDt: Date;

  @Column({ name: 'UPD_DT', type: 'datetime', comment: '수정일시' })
  updDt: Date;
}
