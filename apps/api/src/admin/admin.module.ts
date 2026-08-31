import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InquiryAction } from '../inquiry/entities/inquiry-action.entity';
import { Inquiry } from '../inquiry/entities/inquiry.entity';
import { InquiryModule } from '../inquiry/inquiry.module';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { RedisThrottlerStorageService } from '../throttler/redis-throttler-storage.service';
import { ThrottlerStorageModule } from '../throttler/throttler-storage.module';
import { User } from '../user/entities/user.entity';
import { AdminAuthController } from './admin-auth.controller';
import { AdminSeedService } from './admin-seed.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAuthGuard } from './guards/admin-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Inquiry, InquiryAction, QuizSong, User]),
    InquiryModule,
    JwtModule.register({}),
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [RedisThrottlerStorageService],
      useFactory: (storage: RedisThrottlerStorageService) => ({
        throttlers: [{ name: 'login', ttl: 60_000, limit: 5 }],
        storage,
      }),
    }),
  ],
  controllers: [AdminController, AdminAuthController],
  providers: [AdminService, AdminAuthGuard, AdminSeedService],
  // SlackModule이 Slack 인터랙션에서 관리자 웹과 동일한 승인/반려 경로(AdminService)를
  // 그대로 재사용한다(ADR-0008).
  exports: [AdminService],
})
export class AdminModule {}
