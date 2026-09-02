import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('SQ_NOTI_READ', { comment: '유저별 알림 읽음 여부' })
@Index('UK_SQ_NOTI_READ_01', ['notiId', 'userKey'], { unique: true })
@Index('IDX_SQ_NOTI_READ_01', ['userKey'])
export class NotificationRead {
  @PrimaryGeneratedColumn({
    name: 'NOTI_READ_ID',
    type: 'bigint',
    unsigned: true,
    comment: '알림 읽음 ID',
  })
  notiReadId: string;

  @Column({
    name: 'NOTI_ID',
    type: 'bigint',
    unsigned: true,
    comment: '알림 ID',
  })
  notiId: string;

  @Column({
    name: 'USER_KEY',
    type: 'bigint',
    unsigned: true,
    comment: '읽은 유저 고유 ID',
  })
  userKey: string;

  @Column({
    name: 'READ_DT',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    comment: '읽은 시각',
  })
  readDt: Date;
}
