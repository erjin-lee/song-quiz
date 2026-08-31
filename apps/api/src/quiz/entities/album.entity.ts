import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Artist } from './artist.entity';

@Entity('SQ_ALBM', { comment: '앨범 테이블' })
@Index('UK_SQ_ALBM_01', ['melonAlbmId'], { unique: true })
@Index('IDX_SQ_ALBM_01', ['atstId'])
@Index('IDX_SQ_ALBM_02', ['albmNm'])
export class Album {
  @PrimaryGeneratedColumn({
    name: 'ALBM_ID',
    type: 'bigint',
    unsigned: true,
    comment: '앨범 고유 ID',
  })
  albmId: string;

  @Column({
    name: 'ATST_ID',
    type: 'bigint',
    unsigned: true,
    comment: '아티스트 고유 ID',
  })
  atstId: string;

  @Column({
    name: 'MELON_ALBM_ID',
    type: 'bigint',
    unsigned: true,
    comment: '멜론 앨범 ID',
  })
  melonAlbmId: string;

  @Column({ name: 'ALBM_NM', type: 'varchar', length: 200, comment: '앨범명' })
  albmNm: string;

  @Column({
    name: 'THUMB_IMG_URL',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '앨범 썸네일 이미지 URL',
  })
  thumbImgUrl: string | null;

  @Column({ name: 'RLS_DT', type: 'date', nullable: true, comment: '발매일' })
  rlsDt: string | null;

  @Column({ name: 'CRT_DT', type: 'datetime', comment: '생성일시' })
  crtDt: Date;

  @Column({ name: 'UPD_DT', type: 'datetime', comment: '수정일시' })
  updDt: Date;

  @ManyToOne(() => Artist, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'ATST_ID' })
  artist: Artist;
}
