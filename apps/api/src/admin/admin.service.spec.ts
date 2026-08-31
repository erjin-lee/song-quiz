import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In } from 'typeorm';
import { AdminService } from './admin.service';
import { InquiryAction } from '../inquiry/entities/inquiry-action.entity';
import { Inquiry } from '../inquiry/entities/inquiry.entity';
import { InquiryService } from '../inquiry/inquiry.service';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { User } from '../user/entities/user.entity';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

jest.mock('./temporary-password.util', () => ({
  generateTemporaryPassword: jest.fn().mockReturnValue('temp-password-123'),
}));

describe('AdminService', () => {
  let service: AdminService;

  const inquiryRepositoryMock = {
    find: jest.fn(),
    findAndCount: jest.fn(),
  };

  const inquiryActionRepositoryMock = {
    find: jest.fn(),
  };

  const quizSongRepositoryMock = {
    find: jest.fn(),
  };

  const userRepositoryMock = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((entity) => entity),
    save: jest.fn(),
    update: jest.fn(),
  };

  const inquiryServiceMock = {
    approve: jest.fn(),
    reject: jest.fn(),
  };

  const jwtServiceMock = {
    sign: jest.fn().mockReturnValue('signed-jwt'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    inquiryActionRepositoryMock.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: getRepositoryToken(Inquiry),
          useValue: inquiryRepositoryMock,
        },
        {
          provide: getRepositoryToken(InquiryAction),
          useValue: inquiryActionRepositoryMock,
        },
        {
          provide: getRepositoryToken(QuizSong),
          useValue: quizSongRepositoryMock,
        },
        { provide: getRepositoryToken(User), useValue: userRepositoryMock },
        { provide: InquiryService, useValue: inquiryServiceMock },
        { provide: JwtService, useValue: jwtServiceMock },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  describe('getInquiries', () => {
    it('status 필터를 Inquiry 리포지토리 조회에 전달하고 최신순으로 조회한다', async () => {
      inquiryRepositoryMock.findAndCount.mockResolvedValue([[], 0]);
      quizSongRepositoryMock.find.mockResolvedValue([]);

      await service.getInquiries({
        status: ['PENDING_REVIEW', 'REJECTED'],
        page: 1,
        pageSize: 50,
      });

      expect(inquiryRepositoryMock.findAndCount).toHaveBeenCalledWith({
        where: { status: In(['PENDING_REVIEW', 'REJECTED']) },
        order: { crtDt: 'DESC' },
        skip: 0,
        take: 50,
      });
    });

    it('confidence/matchedFunction 필터는 먼저 InquiryAction에서 inquiryId를 추려 Inquiry 조회를 좁힌다', async () => {
      inquiryActionRepositoryMock.find.mockResolvedValue([
        { inquiryId: '1' },
        { inquiryId: '2' },
        { inquiryId: '1' },
      ]);
      inquiryRepositoryMock.findAndCount.mockResolvedValue([[], 0]);
      quizSongRepositoryMock.find.mockResolvedValue([]);

      await service.getInquiries({
        confidence: ['MEDIUM'],
        matchedFunction: ['ADD_ANSWER'],
        page: 1,
        pageSize: 50,
      });

      expect(inquiryActionRepositoryMock.find).toHaveBeenCalledWith({
        where: {
          confidence: In(['MEDIUM']),
          actionType: In(['ADD_ANSWER']),
        },
      });
      expect(inquiryRepositoryMock.findAndCount).toHaveBeenCalledWith({
        where: { inquiryId: In(['1', '2']) },
        order: { crtDt: 'DESC' },
        skip: 0,
        take: 50,
      });
    });

    it('confidence/matchedFunction 필터에 해당하는 액션이 없으면 Inquiry 조회 없이 빈 목록을 반환한다', async () => {
      inquiryActionRepositoryMock.find.mockResolvedValue([]);

      const result = await service.getInquiries({ confidence: ['LOW'] });

      expect(inquiryRepositoryMock.findAndCount).not.toHaveBeenCalled();
      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 50 });
    });

    it('필터 배열이 비어 있으면 해당 조건을 where에 포함하지 않는다', async () => {
      inquiryRepositoryMock.findAndCount.mockResolvedValue([[], 0]);
      quizSongRepositoryMock.find.mockResolvedValue([]);

      await service.getInquiries({
        status: [],
        confidence: [],
        matchedFunction: [],
        page: 1,
        pageSize: 50,
      });

      expect(inquiryActionRepositoryMock.find).not.toHaveBeenCalled();
      expect(inquiryRepositoryMock.findAndCount).toHaveBeenCalledWith({
        where: {},
        order: { crtDt: 'DESC' },
        skip: 0,
        take: 50,
      });
    });

    it('page/pageSize로 skip/take를 계산한다', async () => {
      inquiryRepositoryMock.findAndCount.mockResolvedValue([[], 0]);
      quizSongRepositoryMock.find.mockResolvedValue([]);

      await service.getInquiries({ page: 3, pageSize: 20 });

      expect(inquiryRepositoryMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }),
      );
    });

    it('출제곡을 찾을 수 있으면 곡명/아티스트명을 채워 반환하고, 최신 InquiryAction 정보도 함께 채운다', async () => {
      inquiryRepositoryMock.findAndCount.mockResolvedValue([
        [
          {
            inquiryId: '1',
            quizSongId: 'qs-1',
            roomId: 'room-1',
            userId: 'user-1',
            content: '시작 지점이 이상해요',
            status: 'COMPLETED',
            resultMessage: '반영되었습니다.',
            crtDt: new Date('2026-01-01'),
          },
        ],
        1,
      ]);
      quizSongRepositoryMock.find.mockResolvedValue([
        {
          quizSongId: 'qs-1',
          youtubeUrl: 'https://www.youtube.com/watch?v=abc123&t=10',
          song: { songNm: '바이, 썸머', artist: { atstNm: '아이유' } },
        },
      ]);
      inquiryActionRepositoryMock.find.mockResolvedValue([
        {
          inquiryId: '1',
          actionSeq: 1,
          actionType: 'CHANGE_START_TIME',
          actionArgs: { startSec: 10 },
          confidence: 'HIGH',
        },
      ]);

      const result = await service.getInquiries({});

      expect(quizSongRepositoryMock.find).toHaveBeenCalledWith({
        where: { quizSongId: expect.anything() },
        relations: { song: { artist: true } },
      });
      expect(inquiryActionRepositoryMock.find).toHaveBeenCalledWith({
        where: { inquiryId: In(['1']) },
        order: { actionSeq: 'DESC' },
      });
      expect(result).toEqual(
        expect.objectContaining({
          total: 1,
          page: 1,
          pageSize: 50,
          items: [
            expect.objectContaining({
              inquiryId: '1',
              quizSongId: 'qs-1',
              songNm: '바이, 썸머',
              atstNm: '아이유',
              youtubeUrl: 'https://www.youtube.com/watch?v=abc123&t=10',
              matchedFunction: 'CHANGE_START_TIME',
              matchedArgs: { startSec: 10 },
              confidence: 'HIGH',
            }),
          ],
        }),
      );
    });

    it('출제곡을 찾을 수 없으면 songNm/atstNm이 null이다', async () => {
      inquiryRepositoryMock.findAndCount.mockResolvedValue([
        [
          {
            inquiryId: '1',
            quizSongId: 'missing-song',
            roomId: 'room-1',
            userId: 'user-1',
            content: '문의',
            status: 'NO_MATCH',
            resultMessage: null,
            crtDt: new Date('2026-01-01'),
          },
        ],
        1,
      ]);
      quizSongRepositoryMock.find.mockResolvedValue([]);

      const result = await service.getInquiries({});

      expect(result.items).toEqual([
        expect.objectContaining({
          songNm: null,
          atstNm: null,
          youtubeUrl: null,
          matchedFunction: null,
          matchedArgs: null,
          confidence: null,
        }),
      ]);
    });

    it('문의가 없으면 QuizSong/InquiryAction 조회를 생략한다', async () => {
      inquiryRepositoryMock.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.getInquiries({});

      expect(quizSongRepositoryMock.find).not.toHaveBeenCalled();
      expect(inquiryActionRepositoryMock.find).not.toHaveBeenCalled();
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('approveInquiry / rejectInquiry', () => {
    it('InquiryService.approve에 ADMIN 액터로 위임한다', async () => {
      await service.approveInquiry('1', 'admin-key-1');
      expect(inquiryServiceMock.approve).toHaveBeenCalledWith('1', {
        via: 'ADMIN',
        userKey: 'admin-key-1',
      });
    });

    it('InquiryService.reject에 ADMIN 액터로 위임한다', async () => {
      await service.rejectInquiry('1', 'admin-key-1');
      expect(inquiryServiceMock.reject).toHaveBeenCalledWith('1', {
        via: 'ADMIN',
        userKey: 'admin-key-1',
      });
    });
  });

  describe('createAdmin', () => {
    it('신규 loginId면 ADMIN 계정을 생성하고 임시 비밀번호를 반환한다', async () => {
      userRepositoryMock.findOne.mockResolvedValue(null);
      userRepositoryMock.save.mockResolvedValue({
        userKey: '3',
        loginId: 'admin2',
        nickNm: '운영자2',
      });

      const result = await service.createAdmin({
        loginId: 'admin2',
        nickNm: '운영자2',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('temp-password-123', 10);
      expect(userRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: expect.any(String),
          loginId: 'admin2',
          nickNm: '운영자2',
          pwdHash: 'hashed-password',
          role: 'ADMIN',
          status: 'ACTIVE',
        }),
      );
      expect(result).toEqual({
        userId: '3',
        loginId: 'admin2',
        nickNm: '운영자2',
        temporaryPassword: 'temp-password-123',
      });
    });

    it('이미 존재하는 loginId면 ConflictException을 던지고 save를 호출하지 않는다', async () => {
      userRepositoryMock.findOne.mockResolvedValue({ loginId: 'admin2' });

      await expect(
        service.createAdmin({ loginId: 'admin2', nickNm: '운영자2' }),
      ).rejects.toThrow(ConflictException);
      expect(userRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('save에서 유니크 제약 위반이 발생하면 ConflictException으로 변환한다', async () => {
      userRepositoryMock.findOne.mockResolvedValue(null);
      userRepositoryMock.save.mockRejectedValue({ code: 'ER_DUP_ENTRY' });

      await expect(
        service.createAdmin({ loginId: 'admin2', nickNm: '운영자2' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listAdmins', () => {
    it('role=ADMIN 필터로 최신순 조회하고 비밀번호 관련 필드를 포함하지 않는다', async () => {
      userRepositoryMock.find.mockResolvedValue([
        {
          userKey: '1',
          loginId: 'admin',
          nickNm: '관리자',
          pwdHash: 'secret-hash',
          status: 'ACTIVE',
          lastLoginDt: null,
          crtDt: new Date('2026-01-01'),
        },
      ]);

      const result = await service.listAdmins();

      expect(userRepositoryMock.find).toHaveBeenCalledWith({
        where: { role: 'ADMIN' },
        order: { crtDt: 'DESC' },
      });
      expect(result[0]).not.toHaveProperty('pwdHash');
      expect(result[0]).toEqual({
        userId: '1',
        loginId: 'admin',
        nickNm: '관리자',
        status: 'ACTIVE',
        lastLoginDt: null,
        crtDt: new Date('2026-01-01'),
      });
    });
  });

  describe('login', () => {
    const admin = {
      userKey: '1',
      loginId: 'admin',
      nickNm: '관리자',
      pwdHash: 'hashed-password',
      status: 'ACTIVE',
    };

    it('존재하지 않는 loginId면 UnauthorizedException을 던진다', async () => {
      userRepositoryMock.findOne.mockResolvedValue(null);

      await expect(
        service.login({ loginId: 'unknown', password: 'pw' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('role=ADMIN 조건으로 조회한다', async () => {
      userRepositoryMock.findOne.mockResolvedValue(null);

      await expect(
        service.login({ loginId: 'admin', password: 'pw' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(userRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { loginId: 'admin', role: 'ADMIN' },
      });
    });

    it('비밀번호가 일치하지 않으면 UnauthorizedException을 던진다', async () => {
      userRepositoryMock.findOne.mockResolvedValue(admin);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ loginId: 'admin', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('status가 ACTIVE가 아니면 UnauthorizedException을 던진다', async () => {
      userRepositoryMock.findOne.mockResolvedValue({
        ...admin,
        status: 'SUSPENDED',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({ loginId: 'admin', password: 'admin1234' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('정상 로그인 시 JWT를 발급하고 lastLoginDt를 갱신한다', async () => {
      userRepositoryMock.findOne.mockResolvedValue(admin);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        loginId: 'admin',
        password: 'admin1234',
      });

      expect(jwtServiceMock.sign).toHaveBeenCalledWith(
        {
          sub: '1',
          userId: '1',
          loginId: 'admin',
          nickNm: '관리자',
          role: 'ADMIN',
        },
        { secret: process.env.ADMIN_JWT_SECRET, expiresIn: '12h' },
      );
      expect(userRepositoryMock.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({ lastLoginDt: expect.any(Date) }),
      );
      expect(result).toEqual({
        accessToken: 'signed-jwt',
        loginId: 'admin',
        nickNm: '관리자',
      });
    });
  });

  describe('getMe', () => {
    it('userId+role=ADMIN으로 조회해 본인 정보를 반환한다', async () => {
      userRepositoryMock.findOne.mockResolvedValue({
        userKey: '1',
        loginId: 'admin',
        nickNm: '관리자',
      });

      const result = await service.getMe('1');

      expect(userRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { userKey: '1', role: 'ADMIN' },
      });
      expect(result).toEqual({
        userId: '1',
        loginId: 'admin',
        nickNm: '관리자',
      });
    });

    it('계정을 찾을 수 없으면 NotFoundException을 던진다', async () => {
      userRepositoryMock.findOne.mockResolvedValue(null);

      await expect(service.getMe('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMyProfile', () => {
    it('닉네임을 수정하고 갱신된 정보를 반환한다', async () => {
      userRepositoryMock.findOne.mockResolvedValue({
        userKey: '1',
        loginId: 'admin',
        nickNm: '관리자',
      });

      const result = await service.updateMyProfile('1', { nickNm: '새닉네임' });

      expect(userRepositoryMock.update).toHaveBeenCalledWith('1', {
        nickNm: '새닉네임',
      });
      expect(result).toEqual({
        userId: '1',
        loginId: 'admin',
        nickNm: '새닉네임',
      });
    });

    it('계정을 찾을 수 없으면 NotFoundException을 던지고 update를 호출하지 않는다', async () => {
      userRepositoryMock.findOne.mockResolvedValue(null);

      await expect(
        service.updateMyProfile('999', { nickNm: '새닉네임' }),
      ).rejects.toThrow(NotFoundException);
      expect(userRepositoryMock.update).not.toHaveBeenCalled();
    });
  });

  describe('changeMyPassword', () => {
    const admin = {
      userKey: '1',
      loginId: 'admin',
      nickNm: '관리자',
      pwdHash: 'hashed-password',
    };

    it('현재 비밀번호가 일치하면 새 비밀번호로 해시를 갱신한다', async () => {
      userRepositoryMock.findOne.mockResolvedValue(admin);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.changeMyPassword('1', {
        currentPassword: 'old-pw',
        newPassword: 'new-pw',
      });

      expect(bcrypt.compare).toHaveBeenCalledWith('old-pw', 'hashed-password');
      expect(bcrypt.hash).toHaveBeenCalledWith('new-pw', 10);
      expect(userRepositoryMock.update).toHaveBeenCalledWith('1', {
        pwdHash: 'hashed-password',
      });
    });

    it('현재 비밀번호가 일치하지 않으면 UnauthorizedException을 던지고 update를 호출하지 않는다', async () => {
      userRepositoryMock.findOne.mockResolvedValue(admin);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changeMyPassword('1', {
          currentPassword: 'wrong',
          newPassword: 'new-pw',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(userRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('계정을 찾을 수 없으면 NotFoundException을 던진다', async () => {
      userRepositoryMock.findOne.mockResolvedValue(null);

      await expect(
        service.changeMyPassword('999', {
          currentPassword: 'old-pw',
          newPassword: 'new-pw',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
