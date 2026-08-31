import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('SQ_USER', { comment: '유저 마스터' })
@Index('UK_SQ_USER_01', ['loginId'], { unique: true })
@Index('UK_SQ_USER_02', ['userId'], { unique: true })
@Index('IDX_SQ_USER_01', ['status'])
@Index('IDX_SQ_USER_02', ['grade'])
@Index('IDX_SQ_USER_03', ['role'])
export class User {
  @PrimaryGeneratedColumn({
    name: 'USER_KEY',
    type: 'bigint',
    unsigned: true,
    comment: '유저 고유 ID',
  })
  userKey: string;

  @Column({
    name: 'USER_ID',
    type: 'varchar',
    length: 255,
    comment: '유저 고유 랜덤 문자열 아이디',
  })
  userId: string;

  @Column({
    name: 'LOGIN_ID',
    type: 'varchar',
    length: 100,
    comment: '로그인 아이디',
  })
  loginId: string;

  @Column({
    name: 'PWD_HASH',
    type: 'varchar',
    length: 255,
    comment: '비밀번호 해시',
  })
  pwdHash: string;

  @Column({
    name: 'EMAIL',
    type: 'varchar',
    length: 320,
    nullable: true,
    comment: '이메일',
  })
  email: string | null;

  @Column({ name: 'NICK_NM', type: 'varchar', length: 100, comment: '닉네임' })
  nickNm: string;

  @Column({
    name: 'GENDER',
    type: 'varchar',
    length: 10,
    nullable: true,
    comment: '성별 (MALE/FEMALE/OTHER)',
  })
  gender: string | null;

  @Column({
    name: 'BIRTH_DT',
    type: 'date',
    nullable: true,
    comment: '생년월일',
  })
  birthDt: string | null;

  @Column({
    name: 'EMAIL_AUTH_YN',
    type: 'char',
    length: 1,
    default: 'N',
    comment: '이메일 인증 여부(Y/N)',
  })
  emailAuthYn: string;

  @Column({
    name: 'EMAIL_AUTH_DT',
    type: 'datetime',
    nullable: true,
    comment: '이메일 인증 일시',
  })
  emailAuthDt: Date | null;

  @Column({
    name: 'GRADE',
    type: 'varchar',
    length: 20,
    default: 'NORMAL',
    comment: '회원 등급',
  })
  grade: string;

  @Column({
    name: 'ROLE',
    type: 'varchar',
    length: 20,
    default: 'USER',
    comment: '권한 (USER/ADMIN)',
  })
  role: string;

  @Column({
    name: 'THUMB_IMG_URL',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '프로필 썸네일 이미지 URL',
  })
  thumbImgUrl: string | null;

  @Column({
    name: 'STATUS',
    type: 'varchar',
    length: 20,
    default: 'ACTIVE',
    comment: '계정 상태 (ACTIVE/INACTIVE/SUSPENDED/WITHDRAWN)',
  })
  status: string;

  @Column({
    name: 'LAST_LOGIN_DT',
    type: 'datetime',
    nullable: true,
    comment: '마지막 로그인 일시',
  })
  lastLoginDt: Date | null;

  @Column({
    name: 'WITHDRAW_DT',
    type: 'datetime',
    nullable: true,
    comment: '회원 탈퇴 일시',
  })
  withdrawDt: Date | null;

  @Column({ name: 'CRT_DT', type: 'datetime', comment: '생성일시' })
  crtDt: Date;

  @Column({ name: 'UPD_DT', type: 'datetime', comment: '수정일시' })
  updDt: Date;
}
