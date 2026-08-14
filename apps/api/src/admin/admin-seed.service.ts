import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { ADMIN_ROLE, BCRYPT_SALT_ROUNDS } from './admin.constants';
import { User } from '../user/entities/user.entity';

@Injectable()
export class AdminSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const loginId = process.env.ADMIN_USER;
    const password = process.env.ADMIN_PASSWORD;
    if (!loginId || !password) {
      return;
    }

    const existing = await this.userRepository.findOne({ where: { loginId } });
    if (existing) {
      if (existing.role !== ADMIN_ROLE) {
        this.logger.warn(
          `LOGIN_ID=${loginId} 계정이 이미 존재하지만 ROLE이 ADMIN이 아니어서 시딩을 건너뜁니다.`,
        );
      }
      return;
    }

    const now = new Date();
    await this.userRepository.save(
      this.userRepository.create({
        loginId,
        nickNm: '관리자',
        pwdHash: await bcrypt.hash(password, BCRYPT_SALT_ROUNDS),
        role: ADMIN_ROLE,
        status: 'ACTIVE',
        grade: 'NORMAL',
        emailAuthYn: 'N',
        crtDt: now,
        updDt: now,
      }),
    );
    this.logger.log(`최초 관리자 계정을 생성했습니다. (loginId=${loginId})`);
  }
}
