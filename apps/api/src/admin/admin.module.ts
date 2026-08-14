import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inquiry } from '../inquiry/entities/inquiry.entity';
import { InquiryModule } from '../inquiry/inquiry.module';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { User } from '../user/entities/user.entity';
import { AdminAuthController } from './admin-auth.controller';
import { AdminSeedService } from './admin-seed.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAuthGuard } from './guards/admin-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Inquiry, QuizSong, User]),
    InquiryModule,
    JwtModule.register({}),
    ThrottlerModule.forRoot([{ name: 'login', ttl: 60_000, limit: 5 }]),
  ],
  controllers: [AdminController, AdminAuthController],
  providers: [AdminService, AdminAuthGuard, AdminSeedService],
})
export class AdminModule {}
