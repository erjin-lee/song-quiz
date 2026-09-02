import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserService } from '../user/user.service';
import { NotificationRead } from './entities/notification-read.entity';
import { Notification } from './entities/notification.entity';
import { NotificationType } from './notification.constants';
import { NotificationService } from './notification.service';

function createQueryBuilderMock() {
  const qb: Record<string, jest.Mock> = {};
  qb.leftJoin = jest.fn().mockReturnValue(qb);
  qb.where = jest.fn().mockReturnValue(qb);
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.select = jest.fn().mockReturnValue(qb);
  qb.insert = jest.fn().mockReturnValue(qb);
  qb.into = jest.fn().mockReturnValue(qb);
  qb.values = jest.fn().mockReturnValue(qb);
  qb.orIgnore = jest.fn().mockReturnValue(qb);
  qb.getCount = jest.fn();
  qb.getRawMany = jest.fn();
  qb.execute = jest.fn();
  return qb;
}

describe('NotificationService', () => {
  let service: NotificationService;

  const notificationRepositoryMock = {
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({ notiId: '1', ...data })),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const notificationReadRepositoryMock = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const userServiceMock = {
    findUserKeyByUserId: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: getRepositoryToken(Notification),
          useValue: notificationRepositoryMock,
        },
        {
          provide: getRepositoryToken(NotificationRead),
          useValue: notificationReadRepositoryMock,
        },
        { provide: UserService, useValue: userServiceMock },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  describe('create', () => {
    it('알림을 기본값과 함께 저장한다', async () => {
      const result = await service.create({
        notiType: NotificationType.QUIZ_REG_COMPLETED,
        userKey: 'user-1',
        title: '제목',
        message: '내용',
      });

      expect(notificationRepositoryMock.create).toHaveBeenCalledWith({
        notiType: NotificationType.QUIZ_REG_COMPLETED,
        userKey: 'user-1',
        title: '제목',
        message: '내용',
        params: null,
        linkPath: null,
      });
      expect(result.notiId).toBe('1');
    });
  });

  describe('getMyNotifications', () => {
    it('내 알림 목록과 안 읽은 개수를 함께 반환한다', async () => {
      userServiceMock.findUserKeyByUserId.mockResolvedValue('user-1');
      notificationRepositoryMock.find.mockResolvedValue([
        {
          notiId: '2',
          notiType: NotificationType.QUIZ_REG_COMPLETED,
          userKey: 'user-1',
          title: '제목2',
          message: '내용2',
          linkPath: null,
          crtDt: new Date('2026-01-02'),
        },
        {
          notiId: '1',
          notiType: NotificationType.QUIZ_REG_COMPLETED,
          userKey: null,
          title: '제목1',
          message: '내용1',
          linkPath: null,
          crtDt: new Date('2026-01-01'),
        },
      ]);
      notificationReadRepositoryMock.find.mockResolvedValue([{ notiId: '1' }]);
      const countQb = createQueryBuilderMock();
      countQb.getCount.mockResolvedValue(3);
      notificationRepositoryMock.createQueryBuilder.mockReturnValue(countQb);

      const result = await service.getMyNotifications('external-user-id');

      expect(userServiceMock.findUserKeyByUserId).toHaveBeenCalledWith(
        'external-user-id',
      );
      expect(result.unreadCount).toBe(3);
      expect(result.items).toHaveLength(2);
      expect(result.items.find((item) => item.notiId === '2')?.isRead).toBe(
        false,
      );
      expect(result.items.find((item) => item.notiId === '1')?.isRead).toBe(
        true,
      );
    });

    it('계정을 찾을 수 없으면 UnauthorizedException을 던진다', async () => {
      userServiceMock.findUserKeyByUserId.mockResolvedValue(null);

      await expect(service.getMyNotifications('unknown')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getNotification', () => {
    it('본인 알림이면 조회하고 읽음 처리한다', async () => {
      userServiceMock.findUserKeyByUserId.mockResolvedValue('user-1');
      notificationRepositoryMock.findOne.mockResolvedValue({
        notiId: '1',
        notiType: NotificationType.QUIZ_REG_COMPLETED,
        userKey: 'user-1',
        title: '제목',
        message: '내용',
        linkPath: '/quizzes/1/edit',
        crtDt: new Date('2026-01-01'),
      });
      const insertQb = createQueryBuilderMock();
      insertQb.execute.mockResolvedValue(undefined);
      notificationReadRepositoryMock.createQueryBuilder.mockReturnValue(
        insertQb,
      );

      const result = await service.getNotification('external-user-id', '1');

      expect(result.isRead).toBe(true);
      expect(insertQb.values).toHaveBeenCalledWith([
        { notiId: '1', userKey: 'user-1' },
      ]);
      expect(insertQb.orIgnore).toHaveBeenCalled();
    });

    it('전체 공지(userKey null)는 누구나 조회할 수 있다', async () => {
      userServiceMock.findUserKeyByUserId.mockResolvedValue('user-1');
      notificationRepositoryMock.findOne.mockResolvedValue({
        notiId: '1',
        notiType: 'ANNOUNCEMENT',
        userKey: null,
        title: '공지',
        message: '공지 내용',
        linkPath: null,
        crtDt: new Date('2026-01-01'),
      });
      const insertQb = createQueryBuilderMock();
      notificationReadRepositoryMock.createQueryBuilder.mockReturnValue(
        insertQb,
      );

      const result = await service.getNotification('external-user-id', '1');

      expect(result.notiId).toBe('1');
    });

    it('다른 유저의 알림이면 NotFoundException을 던진다', async () => {
      userServiceMock.findUserKeyByUserId.mockResolvedValue('user-1');
      notificationRepositoryMock.findOne.mockResolvedValue({
        notiId: '1',
        userKey: 'other-user',
        notiType: NotificationType.QUIZ_REG_COMPLETED,
        title: '제목',
        message: '내용',
        linkPath: null,
        crtDt: new Date(),
      });

      await expect(
        service.getNotification('external-user-id', '1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('존재하지 않는 알림이면 NotFoundException을 던진다', async () => {
      userServiceMock.findUserKeyByUserId.mockResolvedValue('user-1');
      notificationRepositoryMock.findOne.mockResolvedValue(null);

      await expect(
        service.getNotification('external-user-id', '999'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllRead', () => {
    it('안 읽은 알림을 조회해 전부 읽음 처리한다', async () => {
      userServiceMock.findUserKeyByUserId.mockResolvedValue('user-1');
      const selectQb = createQueryBuilderMock();
      selectQb.getRawMany.mockResolvedValue([{ notiId: '1' }, { notiId: '2' }]);
      const insertQb = createQueryBuilderMock();
      notificationRepositoryMock.createQueryBuilder.mockReturnValue(selectQb);
      notificationReadRepositoryMock.createQueryBuilder.mockReturnValue(
        insertQb,
      );

      await service.markAllRead('external-user-id');

      expect(insertQb.values).toHaveBeenCalledWith([
        { notiId: '1', userKey: 'user-1' },
        { notiId: '2', userKey: 'user-1' },
      ]);
    });

    it('안 읽은 알림이 없으면 읽음 처리 쿼리를 실행하지 않는다', async () => {
      userServiceMock.findUserKeyByUserId.mockResolvedValue('user-1');
      const selectQb = createQueryBuilderMock();
      selectQb.getRawMany.mockResolvedValue([]);
      notificationRepositoryMock.createQueryBuilder.mockReturnValue(selectQb);

      await service.markAllRead('external-user-id');

      expect(
        notificationReadRepositoryMock.createQueryBuilder,
      ).not.toHaveBeenCalled();
    });
  });
});
