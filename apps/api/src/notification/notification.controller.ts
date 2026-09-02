import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  UserAuthenticatedRequest,
  UserAuthGuard,
} from '../user/guards/user-auth.guard';
import { NotificationItemDto } from './dto/notification-item.dto';
import { NotificationListDto } from './dto/notification-list.dto';
import { NotificationService } from './notification.service';

@ApiTags('notification')
@Controller('notifications')
@UseGuards(UserAuthGuard)
@ApiUnauthorizedResponse({ description: '인증 토큰이 없거나 유효하지 않음' })
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: '내 알림 목록(최신순) + 안 읽은 개수' })
  @ApiOkResponse({ type: NotificationListDto })
  getMyNotifications(
    @Req() req: UserAuthenticatedRequest,
  ): Promise<NotificationListDto> {
    return this.notificationService.getMyNotifications(req.user.userId);
  }

  @Get(':notiId')
  @ApiOperation({ summary: '알림 상세 조회(조회 즉시 읽음 처리)' })
  @ApiOkResponse({ type: NotificationItemDto })
  @ApiNotFoundResponse({ description: '알림을 찾을 수 없거나 내 알림이 아님' })
  getNotification(
    @Param('notiId', ParseIntPipe) notiId: number,
    @Req() req: UserAuthenticatedRequest,
  ): Promise<NotificationItemDto> {
    return this.notificationService.getNotification(
      req.user.userId,
      String(notiId),
    );
  }

  @Patch('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '내 알림 중 안 읽은 것을 전부 읽음 처리' })
  markAllRead(@Req() req: UserAuthenticatedRequest): Promise<void> {
    return this.notificationService.markAllRead(req.user.userId);
  }
}
