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

@Entity('SQ_ALBM_ATST', { comment: '앨범 아티스트 관계' })
@Index('UK_SQ_ALBM_ATST_01', ['albmId', 'atstId'], { unique: true })
@Index('UK_SQ_ALBM_ATST_02', ['albmId', 'atstSeq'], { unique: true })
@Index('IDX_SQ_ALBM_ATST_01', ['atstId'])
export class AlbumArtist {
  @PrimaryGeneratedColumn({
    name: 'ALBM_ATST_ID',
    type: 'bigint',
    unsigned: true,
    comment: '앨범 아티스트 관계 ID',
  })
  albmAtstId: string;

  @Column({
    name: 'ALBM_ID',
    type: 'bigint',
    unsigned: true,
    comment: '앨범 ID',
  })
  albmId: string;

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

  @ManyToOne(() => Album, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'ALBM_ID' })
  album: Album;

  @ManyToOne(() => Artist, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'ATST_ID' })
  artist: Artist;
}
