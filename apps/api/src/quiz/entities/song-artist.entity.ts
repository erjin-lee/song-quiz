import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Artist } from './artist.entity';
import { Song } from './song.entity';

@Entity('SQ_SONG_ATST', { comment: '곡 아티스트 관계' })
@Index('UK_SQ_SONG_ATST_01', ['songId', 'atstId'], { unique: true })
@Index('UK_SQ_SONG_ATST_02', ['songId', 'atstSeq'], { unique: true })
@Index('IDX_SQ_SONG_ATST_01', ['atstId'])
export class SongArtist {
  @PrimaryGeneratedColumn({
    name: 'SONG_ATST_ID',
    type: 'bigint',
    unsigned: true,
    comment: '곡 아티스트 관계 ID',
  })
  songAtstId: string;

  @Column({ name: 'SONG_ID', type: 'bigint', unsigned: true, comment: '곡 ID' })
  songId: string;

  @Column({
    name: 'ATST_ID',
    type: 'bigint',
    unsigned: true,
    comment: '아티스트 ID',
  })
  atstId: string;

  @Column({
    name: 'ATST_SEQ',
    type: 'int',
    unsigned: true,
    default: 1,
    comment: '아티스트 표시 순서',
  })
  atstSeq: number;

  @Column({
    name: 'MAIN_YN',
    type: 'char',
    length: 1,
    default: 'N',
    comment: '대표 아티스트 여부 (Y/N)',
  })
  mainYn: string;

  @Column({
    name: 'CRT_DT',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    comment: '생성일시',
  })
  crtDt: Date;

  @ManyToOne(() => Song, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'SONG_ID' })
  song: Song;

  @ManyToOne(() => Artist, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'ATST_ID' })
  artist: Artist;
}
