import { randomInt } from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { buildVerificationCodeEmail } from '../mail/templates/verification-code.template';
import {
  EMAIL_AUTH_CODE_TTL_MINUTES,
  EMAIL_AUTH_MAX_TRY_COUNT,
} from './email-auth.constants';
import { EmailAuth } from './entities/email-auth.entity';
import { UserService } from './user.service';
import { BCRYPT_SALT_ROUNDS } from './user.constants';

function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

@Injectable()
export class EmailAuthService {
  constructor(
    @InjectRepository(EmailAuth)
    private readonly emailAuthRepository: Repository<EmailAuth>,
    private readonly userService: UserService,
    private readonly mailService: MailService,
  ) {}

  async sendVerificationCode(email: string, userId?: string): Promise<void> {
    const code = generateVerificationCode();
    const authCodeHash = await bcrypt.hash(code, BCRYPT_SALT_ROUNDS);
    const now = new Date();
    const expireDt = new Date(
      now.getTime() + EMAIL_AUTH_CODE_TTL_MINUTES * 60_000,
    );
    const userKey = userId
      ? await this.userService.findUserKeyByUserId(userId)
      : null;

    await this.emailAuthRepository.save(
      this.emailAuthRepository.create({
        userKey,
        email,
        authCodeHash,
        authType: 'EMAIL_VERIFY',
        status: 'PENDING',
        expireDt,
        tryCnt: 0,
        crtDt: now,
        updDt: now,
      }),
    );

    const { subject, html } = buildVerificationCodeEmail({
      code,
      expiresInMinutes: EMAIL_AUTH_CODE_TTL_MINUTES,
    });
    await this.mailService.send({ to: email, subject, html });
  }

  async verifyCode(
    email: string,
    code: string,
    userId?: string,
  ): Promise<void> {
    const record = await this.emailAuthRepository.findOne({
      where: { email, authType: 'EMAIL_VERIFY', status: 'PENDING' },
      order: { crtDt: 'DESC' },
    });

    if (!record || record.expireDt.getTime() < Date.now()) {
      throw new BadRequestException(
        '인증번호가 만료되었거나 존재하지 않습니다. 다시 요청해주세요.',
      );
    }

    if (record.tryCnt >= EMAIL_AUTH_MAX_TRY_COUNT) {
      throw new BadRequestException(
        '인증 시도 횟수를 초과했습니다. 인증번호를 다시 요청해주세요.',
      );
    }

    const matched = await bcrypt.compare(code, record.authCodeHash);
    if (!matched) {
      await this.emailAuthRepository.update(record.emailAuthId, {
        tryCnt: record.tryCnt + 1,
        updDt: new Date(),
      });
      throw new BadRequestException('인증번호가 올바르지 않습니다.');
    }

    const now = new Date();
    await this.emailAuthRepository.update(record.emailAuthId, {
      status: 'VERIFIED',
      authDt: now,
      updDt: now,
    });

    if (userId) {
      await this.userService.markEmailVerified(userId, email);
    }
  }
}
