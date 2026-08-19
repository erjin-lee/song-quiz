import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type EmailAuthType =
  'SIGNUP' | 'EMAIL_VERIFY' | 'PASSWORD_RESET' | 'EMAIL_CHANGE';

export type EmailAuthStatus = 'PENDING' | 'VERIFIED' | 'CANCELED';

@Entity('SQ_EMAIL_AUTH')
export class EmailAuth {
  @PrimaryGeneratedColumn({
    name: 'EMAIL_AUTH_ID',
    type: 'bigint',
    unsigned: true,
  })
  emailAuthId: string;

  @Column({ name: 'USER_KEY', type: 'bigint', unsigned: true, nullable: true })
  userKey: string | null;

  @Column({ name: 'EMAIL', type: 'varchar', length: 320 })
  email: string;

  @Column({ name: 'AUTH_CODE_HASH', type: 'varchar', length: 255 })
  authCodeHash: string;

  @Column({ name: 'AUTH_TYPE', type: 'varchar', length: 20 })
  authType: EmailAuthType;

  @Column({ name: 'STATUS', type: 'varchar', length: 20, default: 'PENDING' })
  status: EmailAuthStatus;

  @Column({ name: 'EXPIRE_DT', type: 'datetime' })
  expireDt: Date;

  @Column({ name: 'AUTH_DT', type: 'datetime', nullable: true })
  authDt: Date | null;

  @Column({ name: 'TRY_CNT', type: 'int', unsigned: true, default: 0 })
  tryCnt: number;

  @Column({ name: 'CRT_DT', type: 'datetime' })
  crtDt: Date;

  @Column({ name: 'UPD_DT', type: 'datetime' })
  updDt: Date;
}
