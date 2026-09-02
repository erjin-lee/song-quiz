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
  exports: [UserService, UserAuthGuard],
})
export class UserModule {}
