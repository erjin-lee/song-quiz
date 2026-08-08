import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Artist } from './artist.entity';

@Entity('SQ_ALBM')
export class Album {
  @PrimaryGeneratedColumn({ name: 'ALBM_ID', type: 'bigint', unsigned: true })
  albmId: string;

  @Column({ name: 'ATST_ID', type: 'bigint', unsigned: true })
  atstId: string;

  @Column({ name: 'MELON_ALBM_ID', type: 'bigint', unsigned: true })
  melonAlbmId: string;

  @Column({ name: 'ALBM_NM', type: 'varchar', length: 200 })
  albmNm: string;

  @Column({
    name: 'THUMB_IMG_URL',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  thumbImgUrl: string | null;

  @Column({ name: 'RLS_DT', type: 'date', nullable: true })
  rlsDt: string | null;

  @Column({ name: 'CRT_DT', type: 'datetime' })
  crtDt: Date;

  @Column({ name: 'UPD_DT', type: 'datetime' })
  updDt: Date;

  @ManyToOne(() => Artist)
  @JoinColumn({ name: 'ATST_ID' })
  artist: Artist;
}
