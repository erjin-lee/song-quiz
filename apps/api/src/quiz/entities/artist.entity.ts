import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('SQ_ATST')
export class Artist {
  @PrimaryGeneratedColumn({ name: 'ATST_ID', type: 'bigint', unsigned: true })
  atstId: string;

  @Column({ name: 'MELON_ATST_ID', type: 'bigint', unsigned: true })
  melonAtstId: string;

  @Column({ name: 'ATST_NM', type: 'varchar', length: 200 })
  atstNm: string;

  @Column({
    name: 'THUMB_IMG_URL',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  thumbImgUrl: string | null;

  @Column({ name: 'CRT_DT', type: 'datetime' })
  crtDt: Date;

  @Column({ name: 'UPD_DT', type: 'datetime' })
  updDt: Date;
}
