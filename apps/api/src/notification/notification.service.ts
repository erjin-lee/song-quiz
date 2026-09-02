import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { UserService } from '../user/user.service';
import { NotificationItemDto } from './dto/notification-item.dto';
import { NotificationListDto } from './dto/notification-list.dto';
import { NotificationRead } from './entities/notification-read.entity';
import { Notification } from './entities/notification.entity';
import {
  NOTIFICATION_LIST_LIMIT,
  NotificationType,
} from './notification.constants';

export interface CreateNotificationParams {
  notiType: NotificationType;
  /** 대상 유저. null이면 전체 유저 대상 공지. */
  userKey: string | null;
  title: string;
  message: string;
  params?: Record<string, unknown> | null;
  linkPath?: string | null;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationRead)
    private readonly notificationReadRepository: Repository<NotificationRead>,
    private readonly userService: UserService,
  ) {}

  /** 다른 도메인 서비스가 알림을 보낼 때 호출하는 진입점. */
  async create(params: CreateNotificationParams): Promise<Notification> {
    return this.notificationRepository.save(
      this.notificationRepository.create({
        notiType: params.notiType,
        userKey: params.userKey,
        title: params.title,
        message: params.message,
        params: params.params ?? null,
        linkPath: params.linkPath ?? null,
      }),
    );
  }

  async getMyNotifications(userId: string): Promise<NotificationListDto> {
    const userKey = await this.resolveUserKey(userId);

    const [notifications, unreadCount] = await Promise.all([
      this.notificationRepository.find({
        where: [{ userKey }, { userKey: IsNull() }],
        order: { crtDt: 'DESC' },
        take: NOTIFICATION_LIST_LIMIT,
      }),
      this.countUnread(userKey),
    ]);
    const readSet = await this.getReadNotiIdSet(
      userKey,
      notifications.map((notification) => notification.notiId),
    );

    return {
      items: notifications.map((notification) =>
        this.toDto(notification, readSet.has(notification.notiId)),
      ),
      unreadCount,
    };
  }

  /** 상세 조회는 조회 즉시 읽음 처리한다. */
  async getNotification(
    userId: string,
    notiId: string,
  ): Promise<NotificationItemDto> {
    const userKey = await this.resolveUserKey(userId);
    const notification = await this.notificationRepository.findOne({
      where: { notiId },
    });
    if (
      !notification ||
      (notification.userKey !== null && notification.userKey !== userKey)
    ) {
      throw new NotFoundException('알림을 찾을 수 없습니다.');
    }

    await this.markRead(userKey, [notiId]);
    return this.toDto(notification, true);
  }

  /** 내 알림(개인 + 전체 공지) 중 안 읽은 것을 전부 읽음 처리한다(벨 드롭다운을 열 때 호출). */
  async markAllRead(userId: string): Promise<void> {
    const userKey = await this.resolveUserKey(userId);
    const unread = await this.notificationRepository
      .createQueryBuilder('noti')
      .leftJoin(
        NotificationRead,
        'nr',
        'nr.notiId = noti.notiId AND nr.userKey = :userKey',
        { userKey },
      )
      .where('(noti.userKey = :userKey OR noti.userKey IS NULL)', { userKey })
      .andWhere('nr.notiReadId IS NULL')
      .select('noti.notiId', 'notiId')
      .getRawMany<{ notiId: string }>();

    await this.markRead(
      userKey,
      unread.map((row) => row.notiId),
    );
  }

  private async markRead(userKey: string, notiIds: string[]): Promise<void> {
    if (notiIds.length === 0) {
      return;
    }
    // 이미 읽은 알림을 다시 읽음 처리해도(UK_SQ_NOTI_READ_01) 에러 없이 무시한다.
    await this.notificationReadRepository
      .createQueryBuilder()
      .insert()
      .into(NotificationRead)
      .values(notiIds.map((notiId) => ({ notiId, userKey })))
      .orIgnore()
      .execute();
  }

  private async countUnread(userKey: string): Promise<number> {
    return this.notificationRepository
      .createQueryBuilder('noti')
      .leftJoin(
        NotificationRead,
        'nr',
        'nr.notiId = noti.notiId AND nr.userKey = :userKey',
        { userKey },
      )
      .where('(noti.userKey = :userKey OR noti.userKey IS NULL)', { userKey })
      .andWhere('nr.notiReadId IS NULL')
      .getCount();
  }

  private async getReadNotiIdSet(
    userKey: string,
    notiIds: string[],
  ): Promise<Set<string>> {
    if (notiIds.length === 0) {
      return new Set();
    }
    const reads = await this.notificationReadRepository.find({
      where: { userKey, notiId: In(notiIds) },
    });
    return new Set(reads.map((read) => read.notiId));
  }

  private toDto(
    notification: Notification,
    isRead: boolean,
  ): NotificationItemDto {
    return {
      notiId: notification.notiId,
      notiType: notification.notiType,
      title: notification.title,
      message: notification.message,
      linkPath: notification.linkPath,
      isRead,
      crtDt: notification.crtDt,
    };
  }

  private async resolveUserKey(userId: string): Promise<string> {
    const userKey = await this.userService.findUserKeyByUserId(userId);
    if (!userKey) {
      throw new UnauthorizedException('유효한 계정을 찾을 수 없습니다.');
    }
    return userKey;
  }
}
