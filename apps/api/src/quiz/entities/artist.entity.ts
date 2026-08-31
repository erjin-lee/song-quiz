import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('SQ_ATST', { comment: '아티스트 마스터' })
@Index('UK_SQ_ATST_01', ['melonAtstId'], { unique: true })
@Index('IDX_SQ_ATST_01', ['atstNm'])
export class Artist {
  @PrimaryGeneratedColumn({
    name: 'ATST_ID',
    type: 'bigint',
    unsigned: true,
    comment: '아티스트 고유 ID',
  })
  atstId: string;

  @Column({
    name: 'MELON_ATST_ID',
    type: 'bigint',
    unsigned: true,
    comment: '멜론 아티스트 ID',
  })
  melonAtstId: string;

  @Column({
    name: 'ATST_NM',
    type: 'varchar',
    length: 200,
    comment: '아티스트명',
  })
  atstNm: string;

  @Column({
    name: 'THUMB_IMG_URL',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '썸네일 이미지 URL',
  })
  thumbImgUrl: string | null;

  @Column({ name: 'CRT_DT', type: 'datetime', comment: '생성일시' })
  crtDt: Date;

  @Column({ name: 'UPD_DT', type: 'datetime', comment: '수정일시' })
  updDt: Date;
}
