import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { MailService } from '../mail/mail.service';
import { EmailAuthService } from './email-auth.service';
import { EmailAuth } from './entities/email-auth.entity';
import { UserService } from './user.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-code'),
  compare: jest.fn(),
}));

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomInt: jest.fn().mockReturnValue(48213),
}));

describe('EmailAuthService', () => {
  let service: EmailAuthService;

  const emailAuthRepositoryMock = {
    findOne: jest.fn(),
    create: jest.fn((entity) => entity),
    save: jest.fn(),
    update: jest.fn(),
  };

  const userServiceMock = {
    findUserKeyByUserId: jest.fn(),
    markEmailVerified: jest.fn(),
  };

  const mailServiceMock = {
    send: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailAuthService,
        {
          provide: getRepositoryToken(EmailAuth),
          useValue: emailAuthRepositoryMock,
        },
        { provide: UserService, useValue: userServiceMock },
        { provide: MailService, useValue: mailServiceMock },
      ],
    }).compile();

    service = module.get<EmailAuthService>(EmailAuthService);
  });

  describe('sendVerificationCode', () => {
    it('비로그인 상태면 userKey 없이 인증 레코드를 생성하고 메일을 발송한다', async () => {
      await service.sendVerificationCode('user@example.com');

      expect(userServiceMock.findUserKeyByUserId).not.toHaveBeenCalled();
      expect(bcrypt.hash).toHaveBeenCalledWith('048213', 10);
      expect(emailAuthRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userKey: null,
          email: 'user@example.com',
          authCodeHash: 'hashed-code',
          authType: 'EMAIL_VERIFY',
          status: 'PENDING',
          tryCnt: 0,
        }),
      );
      expect(mailServiceMock.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('노래맞히기'),
          html: expect.stringContaining('048213'),
        }),
      );
    });

    it('로그인 상태면 계정의 userKey를 조회해 함께 저장한다', async () => {
      userServiceMock.findUserKeyByUserId.mockResolvedValue('1');

      await service.sendVerificationCode('user@example.com', 'account-user-id');

      expect(userServiceMock.findUserKeyByUserId).toHaveBeenCalledWith(
        'account-user-id',
      );
      expect(emailAuthRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ userKey: '1' }),
      );
    });
  });

  describe('verifyCode', () => {
    const pendingRecord = {
      emailAuthId: '10',
      email: 'user@example.com',
      authCodeHash: 'hashed-code',
      authType: 'EMAIL_VERIFY',
      status: 'PENDING',
      expireDt: new Date(Date.now() + 60_000),
      tryCnt: 0,
    };

    it('인증 레코드가 없으면 BadRequestException을 던진다', async () => {
      emailAuthRepositoryMock.findOne.mockResolvedValue(null);

      await expect(
        service.verifyCode('user@example.com', '048213'),
      ).rejects.toThrow(BadRequestException);
    });

    it('만료된 레코드면 BadRequestException을 던진다', async () => {
      emailAuthRepositoryMock.findOne.mockResolvedValue({
        ...pendingRecord,
        expireDt: new Date(Date.now() - 1_000),
      });

      await expect(
        service.verifyCode('user@example.com', '048213'),
      ).rejects.toThrow(BadRequestException);
    });

    it('시도 횟수를 초과했으면 BadRequestException을 던진다', async () => {
      emailAuthRepositoryMock.findOne.mockResolvedValue({
        ...pendingRecord,
        tryCnt: 5,
      });

      await expect(
        service.verifyCode('user@example.com', '048213'),
      ).rejects.toThrow(BadRequestException);
    });

    it('코드가 일치하지 않으면 시도 횟수를 올리고 BadRequestException을 던진다', async () => {
      emailAuthRepositoryMock.findOne.mockResolvedValue(pendingRecord);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.verifyCode('user@example.com', '000000'),
      ).rejects.toThrow(BadRequestException);
      expect(emailAuthRepositoryMock.update).toHaveBeenCalledWith(
        '10',
        expect.objectContaining({ tryCnt: 1 }),
      );
      expect(userServiceMock.markEmailVerified).not.toHaveBeenCalled();
    });

    it('코드가 일치하면 VERIFIED로 갱신하고, 비로그인 상태면 계정을 갱신하지 않는다', async () => {
      emailAuthRepositoryMock.findOne.mockResolvedValue(pendingRecord);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.verifyCode('user@example.com', '048213');

      expect(emailAuthRepositoryMock.update).toHaveBeenCalledWith(
        '10',
        expect.objectContaining({ status: 'VERIFIED' }),
      );
      expect(userServiceMock.markEmailVerified).not.toHaveBeenCalled();
    });

    it('로그인 상태로 코드가 일치하면 계정의 이메일을 인증 완료로 갱신한다', async () => {
      emailAuthRepositoryMock.findOne.mockResolvedValue(pendingRecord);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.verifyCode('user@example.com', '048213', 'account-user-id');

      expect(userServiceMock.markEmailVerified).toHaveBeenCalledWith(
        'account-user-id',
        'user@example.com',
      );
    });
  });
});
