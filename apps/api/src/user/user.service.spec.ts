import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { UserService } from './user.service';
import { User } from './entities/user.entity';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

describe('UserService', () => {
  let service: UserService;

  const userRepositoryMock = {
    findOne: jest.fn(),
    create: jest.fn((entity) => entity),
    save: jest.fn(),
    update: jest.fn(),
  };

  const jwtServiceMock = {
    sign: jest.fn().mockReturnValue('signed-jwt'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: userRepositoryMock },
        { provide: JwtService, useValue: jwtServiceMock },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  describe('signup', () => {
    it('신규 loginId면 계정을 생성하고 토큰을 발급한다', async () => {
      userRepositoryMock.findOne.mockResolvedValue(null);
      userRepositoryMock.save.mockResolvedValue({
        userKey: '1',
        userId: 'random-user-id',
        loginId: 'songquiz01',
        nickNm: '노래왕',
      });

      const result = await service.signup({
        loginId: 'songquiz01',
        password: 'password123',
        nickNm: '노래왕',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(userRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: expect.any(String),
          loginId: 'songquiz01',
          nickNm: '노래왕',
          pwdHash: 'hashed-password',
          role: 'USER',
          status: 'ACTIVE',
        }),
      );
      expect(jwtServiceMock.sign).toHaveBeenCalledWith(
        {
          sub: 'random-user-id',
          userId: 'random-user-id',
          loginId: 'songquiz01',
          nickNm: '노래왕',
        },
        { secret: process.env.USER_JWT_SECRET, expiresIn: '30d' },
      );
      expect(result).toEqual({
        accessToken: 'signed-jwt',
        userId: 'random-user-id',
        loginId: 'songquiz01',
        nickNm: '노래왕',
      });
    });

    it('이미 존재하는 loginId면 ConflictException을 던지고 save를 호출하지 않는다', async () => {
      userRepositoryMock.findOne.mockResolvedValue({ loginId: 'songquiz01' });

      await expect(
        service.signup({
          loginId: 'songquiz01',
          password: 'password123',
          nickNm: '노래왕',
        }),
      ).rejects.toThrow(ConflictException);
      expect(userRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('save에서 유니크 제약 위반이 발생하면 ConflictException으로 변환한다', async () => {
      userRepositoryMock.findOne.mockResolvedValue(null);
      userRepositoryMock.save.mockRejectedValue({ code: 'ER_DUP_ENTRY' });

      await expect(
        service.signup({
          loginId: 'songquiz01',
          password: 'password123',
          nickNm: '노래왕',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    const user = {
      userKey: '1',
      userId: 'random-user-id',
      loginId: 'songquiz01',
      nickNm: '노래왕',
      pwdHash: 'hashed-password',
      status: 'ACTIVE',
    };

    it('존재하지 않는 loginId면 UnauthorizedException을 던진다', async () => {
      userRepositoryMock.findOne.mockResolvedValue(null);

      await expect(
        service.login({ loginId: 'unknown', password: 'pw' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('role=USER 조건으로 조회한다', async () => {
      userRepositoryMock.findOne.mockResolvedValue(null);

      await expect(
        service.login({ loginId: 'songquiz01', password: 'pw' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(userRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { loginId: 'songquiz01', role: 'USER' },
      });
    });

    it('비밀번호가 일치하지 않으면 UnauthorizedException을 던진다', async () => {
      userRepositoryMock.findOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ loginId: 'songquiz01', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('status가 ACTIVE가 아니면 UnauthorizedException을 던진다', async () => {
      userRepositoryMock.findOne.mockResolvedValue({
        ...user,
        status: 'SUSPENDED',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({ loginId: 'songquiz01', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('정상 로그인 시 JWT를 발급하고 lastLoginDt를 갱신한다', async () => {
      userRepositoryMock.findOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        loginId: 'songquiz01',
        password: 'password123',
      });

      expect(jwtServiceMock.sign).toHaveBeenCalledWith(
        {
          sub: 'random-user-id',
          userId: 'random-user-id',
          loginId: 'songquiz01',
          nickNm: '노래왕',
        },
        { secret: process.env.USER_JWT_SECRET, expiresIn: '30d' },
      );
      expect(userRepositoryMock.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({ lastLoginDt: expect.any(Date) }),
      );
      expect(result).toEqual({
        accessToken: 'signed-jwt',
        userId: 'random-user-id',
        loginId: 'songquiz01',
        nickNm: '노래왕',
      });
    });
  });

  describe('getMe', () => {
    it('userId+role=USER로 조회해 본인 정보를 반환한다', async () => {
      userRepositoryMock.findOne.mockResolvedValue({
        userKey: '1',
        userId: 'random-user-id',
        loginId: 'songquiz01',
        nickNm: '노래왕',
        status: 'ACTIVE',
      });

      const result = await service.getMe('random-user-id');

      expect(userRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { userId: 'random-user-id', role: 'USER' },
      });
      expect(result).toEqual({
        userId: 'random-user-id',
        loginId: 'songquiz01',
        nickNm: '노래왕',
      });
    });

    it('계정을 찾을 수 없으면 NotFoundException을 던진다', async () => {
      userRepositoryMock.findOne.mockResolvedValue(null);

      await expect(service.getMe('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('status가 ACTIVE가 아니면 UnauthorizedException을 던진다', async () => {
      userRepositoryMock.findOne.mockResolvedValue({
        userKey: '1',
        userId: 'random-user-id',
        loginId: 'songquiz01',
        nickNm: '노래왕',
        status: 'SUSPENDED',
      });

      await expect(service.getMe('random-user-id')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
