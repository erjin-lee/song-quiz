import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Album } from './album.entity';
import { Artist } from './artist.entity';

@Entity('SQ_SONG', { comment: '노래 마스터' })
@Index('UK_SQ_SONG_01', ['melonSongId'], { unique: true })
@Index('IDX_SQ_SONG_01', ['albmId'])
@Index('IDX_SQ_SONG_02', ['atstId'])
@Index('IDX_SQ_SONG_03', ['songNm'])
export class Song {
  @PrimaryGeneratedColumn({
    name: 'SONG_ID',
    type: 'bigint',
    unsigned: true,
    comment: '노래 고유 ID',
  })
  songId: string;

  @Column({
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
    name: 'MELON_SONG_ID',
    type: 'bigint',
    unsigned: true,
    comment: '멜론 곡 ID',
  })
  melonSongId: string;

  @Column({ name: 'SONG_NM', type: 'varchar', length: 300, comment: '노래명' })
  songNm: string;

  @Column({
    name: 'TRACK_NO',
    type: 'int',
    unsigned: true,
    nullable: true,
    comment: '트랙 번호',
  })
  trackNo: number | null;

  @Column({
    name: 'DURATION',
    type: 'int',
    unsigned: true,
    nullable: true,
    comment: '길이(초)',
  })
  durationSec: number | null;

  @Column({
    name: 'TITLE_YN',
    type: 'char',
    length: 1,
    default: 'N',
    comment: '타이틀곡 여부(Y/N)',
  })
  titleYn: string;

  @Column({ name: 'RLS_DT', type: 'date', nullable: true, comment: '발매일' })
  rlsDt: string | null;

  @Column({
    name: 'YTB_URL',
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: '유튜브 URL',
  })
  ytbLink: string | null;

  @Column({ name: 'CRT_DT', type: 'datetime', comment: '생성일시' })
  crtDt: Date;

  @Column({ name: 'UPD_DT', type: 'datetime', comment: '수정일시' })
  updDt: Date;

  @ManyToOne(() => Album, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'ALBM_ID' })
  album: Album;

  @ManyToOne(() => Artist, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'ATST_ID' })
  artist: Artist;
}
