import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Album } from './album.entity';
import { Artist } from './artist.entity';

@Entity('SQ_SONG')
export class Song {
  @PrimaryGeneratedColumn({ name: 'SONG_ID', type: 'bigint', unsigned: true })
  songId: string;

  @Column({ name: 'ALBM_ID', type: 'bigint', unsigned: true })
  albmId: string;

  @Column({ name: 'ATST_ID', type: 'bigint', unsigned: true })
  atstId: string;

  @Column({ name: 'MELON_SONG_ID', type: 'bigint', unsigned: true })
  melonSongId: string;

  @Column({ name: 'SONG_NM', type: 'varchar', length: 300 })
  songNm: string;

  @Column({ name: 'TRACK_NO', type: 'int', unsigned: true, nullable: true })
  trackNo: number | null;

  @Column({ name: 'DURATION', type: 'int', unsigned: true, nullable: true })
  durationSec: number | null;

  @Column({ name: 'TITLE_YN', type: 'char', length: 1, default: 'N' })
  titleYn: string;

  @Column({ name: 'RLS_DT', type: 'date', nullable: true })
  rlsDt: string | null;

  @Column({ name: 'YTB_LINK', type: 'varchar', length: 512, nullable: true })
  ytbLink: string | null;

  @Column({ name: 'CRT_DT', type: 'datetime' })
  crtDt: Date;

  @Column({ name: 'UPD_DT', type: 'datetime' })
  updDt: Date;

  @ManyToOne(() => Album)
  @JoinColumn({ name: 'ALBM_ID' })
  album: Album;

  @ManyToOne(() => Artist)
  @JoinColumn({ name: 'ATST_ID' })
  artist: Artist;
}
