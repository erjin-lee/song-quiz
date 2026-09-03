import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { RedisThrottlerStorageService } from '../throttler/redis-throttler-storage.service';
import { ThrottlerStorageModule } from '../throttler/throttler-storage.module';
import { EmailAuth } from './entities/email-auth.entity';
import { User } from './entities/user.entity';
import { EmailAuthService } from './email-auth.service';
import { UserAuthController } from './user-auth.controller';
import { UserAuthGuard } from './guards/user-auth.guard';
import { UserInternalController } from './internal/user-internal.controller';
import { UserService } from './user.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, EmailAuth]),
    JwtModule.register({}),
    MailModule,
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [RedisThrottlerStorageService],
      useFactory: (storage: RedisThrottlerStorageService) => ({
        throttlers: [
          { name: 'user-login', ttl: 60_000, limit: 5 },
          { name: 'user-signup', ttl: 60_000, limit: 5 },
          { name: 'email-send-code', ttl: 60_000, limit: 5 },
          { name: 'email-verify-code', ttl: 60_000, limit: 10 },
        ],
        storage,
      }),
    }),
  ],
  controllers: [UserAuthController, UserInternalController],
  providers: [UserService, UserAuthGuard, EmailAuthService],
  // JwtModule도 함께 export한다 - UserAuthGuard를 @UseGuards(UserAuthGuard)로
  // 쓰는 다른 모듈(quiz/scraper/notification 등)에서는 NestJS가 그 가드를
  // 해당 모듈 컨텍스트에서 별도 인스턴스로 다시 생성하는데, 이때 생성자 의존성인
  // JwtService가 그 모듈 안에서 보여야 한다. UserAuthGuard만 export하면
  // 가드 클래스 자체는 보여도 그 생성자 의존성까지 따라오지 않는다.
  exports: [UserService, UserAuthGuard, JwtModule],
})
export class UserModule {}
