import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserAuthController } from './user-auth.controller';
import { UserAuthGuard } from './guards/user-auth.guard';
import { UserService } from './user.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.register({}),
    ThrottlerModule.forRoot([
      { name: 'user-login', ttl: 60_000, limit: 5 },
      { name: 'user-signup', ttl: 60_000, limit: 5 },
    ]),
  ],
  controllers: [UserAuthController],
  providers: [UserService, UserAuthGuard],
  exports: [UserService],
})
export class UserModule {}
