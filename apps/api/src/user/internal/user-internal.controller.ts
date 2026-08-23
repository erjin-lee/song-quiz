import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { InternalAuthGuard } from '../../common/internal-auth.guard';
import { UserService } from '../user.service';

/**
 * apps/game 전용 내부 엔드포인트. apps/game(RoomController)은 User Repository/Entity/
 * UserService를 직접 참조하지 않고, 이 엔드포인트로 UserService.resolveOptionalAccountUserId를
 * 그대로 위임한다(DB의 계정 ACTIVE 상태 확인까지 동일하게 수행).
 */
@Controller('internal/auth')
@UseGuards(InternalAuthGuard)
export class UserInternalController {
  constructor(private readonly userService: UserService) {}

  @Get('resolve-account-user')
  async resolveAccountUser(
    @Req() req: Request,
  ): Promise<{ accountUserId: string | null }> {
    const accountUserId = await this.userService.resolveOptionalAccountUserId(
      req.headers.authorization,
    );
    return { accountUserId: accountUserId ?? null };
  }
}
