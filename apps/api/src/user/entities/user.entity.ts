import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('SQ_USER')
export class User {
  @PrimaryGeneratedColumn({ name: 'USER_KEY', type: 'bigint', unsigned: true })
  userKey: string;

  @Column({ name: 'USER_ID', type: 'varchar', length: 255, unique: true })
  userId: string;

  @Column({ name: 'LOGIN_ID', type: 'varchar', length: 100 })
  loginId: string;

  @Column({ name: 'PWD_HASH', type: 'varchar', length: 255 })
  pwdHash: string;

  @Column({ name: 'EMAIL', type: 'varchar', length: 320, nullable: true })
  email: string | null;

  @Column({ name: 'NICK_NM', type: 'varchar', length: 100 })
  nickNm: string;

  @Column({ name: 'GENDER', type: 'varchar', length: 10, nullable: true })
  gender: string | null;

  @Column({ name: 'BIRTH_DT', type: 'date', nullable: true })
  birthDt: string | null;

  @Column({ name: 'EMAIL_AUTH_YN', type: 'char', length: 1, default: 'N' })
  emailAuthYn: string;

  @Column({ name: 'EMAIL_AUTH_DT', type: 'datetime', nullable: true })
  emailAuthDt: Date | null;

  @Column({ name: 'GRADE', type: 'varchar', length: 20, default: 'NORMAL' })
  grade: string;

  @Column({ name: 'ROLE', type: 'varchar', length: 20, default: 'USER' })
  role: string;

  @Column({
    name: 'THUMB_IMG_URL',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  thumbImgUrl: string | null;

  @Column({ name: 'STATUS', type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'LAST_LOGIN_DT', type: 'datetime', nullable: true })
  lastLoginDt: Date | null;

  @Column({ name: 'WITHDRAW_DT', type: 'datetime', nullable: true })
  withdrawDt: Date | null;

  @Column({ name: 'CRT_DT', type: 'datetime' })
  crtDt: Date;

  @Column({ name: 'UPD_DT', type: 'datetime' })
  updDt: Date;
}
