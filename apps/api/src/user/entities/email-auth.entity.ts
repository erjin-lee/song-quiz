import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type EmailAuthType =
  'SIGNUP' | 'EMAIL_VERIFY' | 'PASSWORD_RESET' | 'EMAIL_CHANGE';

export type EmailAuthStatus = 'PENDING' | 'VERIFIED' | 'CANCELED';

@Entity('SQ_EMAIL_AUTH', { comment: '이메일 인증 관리' })
@Index('IDX_SQ_EMAIL_AUTH_01', ['email', 'authType', 'status', 'crtDt'])
@Index('IDX_SQ_EMAIL_AUTH_02', ['userKey'])
@Index('IDX_SQ_EMAIL_AUTH_03', ['expireDt'])
export class EmailAuth {
  @PrimaryGeneratedColumn({
    name: 'EMAIL_AUTH_ID',
    type: 'bigint',
    unsigned: true,
    comment: '이메일 인증 고유 ID',
  })
  emailAuthId: string;

  @Column({
    name: 'USER_KEY',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '유저 고유 ID',
  })
  userKey: string | null;

  @Column({
    name: 'EMAIL',
    type: 'varchar',
    length: 320,
    comment: '인증 대상 이메일',
  })
  email: string;

  @Column({
    name: 'AUTH_CODE_HASH',
    type: 'varchar',
    length: 255,
    comment: '인증번호 해시',
  })
  authCodeHash: string;

  @Column({
    name: 'AUTH_TYPE',
    type: 'varchar',
    length: 20,
    comment:
      '인증 유형 (SIGNUP:회원가입, EMAIL_VERIFY:이메일 인증, PASSWORD_RESET:비밀번호 재설정, EMAIL_CHANGE:이메일 변경)',
  })
  authType: EmailAuthType;

  @Column({
    name: 'STATUS',
    type: 'varchar',
    length: 20,
    default: 'PENDING',
    comment: '인증 상태 (PENDING/VERIFIED/CANCELED)',
  })
  status: EmailAuthStatus;

  @Column({ name: 'EXPIRE_DT', type: 'datetime', comment: '인증 만료 일시' })
  expireDt: Date;

  @Column({
    name: 'AUTH_DT',
    type: 'datetime',
    nullable: true,
    comment: '인증 완료 일시',
  })
  authDt: Date | null;

  @Column({
    name: 'TRY_CNT',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '인증 시도 횟수',
  })
  tryCnt: number;

  @Column({
    name: 'CRT_DT',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    comment: '생성일시',
  })
  crtDt: Date;

  @Column({
    name: 'UPD_DT',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
    comment: '수정일시',
  })
  updDt: Date;
}
