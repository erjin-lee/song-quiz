import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('SQ_QUIZ')
export class Quiz {
  @PrimaryGeneratedColumn({ name: 'QUIZ_ID', type: 'bigint', unsigned: true })
  quizId: string;

  @Column({ name: 'QUIZ_TTL', type: 'varchar', length: 200 })
  quizTtl: string;

  @Column({ name: 'QUIZ_DESC', type: 'varchar', length: 1000, nullable: true })
  quizDesc: string | null;

  @Column({
    name: 'THUMB_IMG_URL',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  thumbImgUrl: string | null;

  @Column({ name: 'PLAY_CNT', type: 'int', unsigned: true, default: 0 })
  playCnt: number;

  @Column({ name: 'USE_YN', type: 'char', length: 1, default: 'Y' })
  useYn: string;

  @Column({ name: 'CRT_DT', type: 'datetime' })
  crtDt: Date;

  @Column({ name: 'UPD_DT', type: 'datetime' })
  updDt: Date;
}
