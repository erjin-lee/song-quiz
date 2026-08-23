import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InternalAuthGuard } from '../common/internal-auth.guard';
import { InquiryResultNotificationDto } from './dto/inquiry-result-notification.dto';
import { RoomGateway } from './room.gateway';

/**
 * apps/api 전용 내부 엔드포인트. inquiry -> room 의존성을 제거하기 위해, apps/api의
 * InquiryService가 RoomGateway를 직접 import하는 대신 이 엔드포인트를 HTTP로 호출한다.
 */
@Controller('internal/rooms')
@UseGuards(InternalAuthGuard)
export class InternalRoomController {
  constructor(private readonly roomGateway: RoomGateway) {}

  @Post('inquiry-result')
  @HttpCode(HttpStatus.NO_CONTENT)
  notifyInquiryResult(@Body() dto: InquiryResultNotificationDto): void {
    this.roomGateway.emitInquiryResult(dto.userId, {
      inquiryId: dto.inquiryId,
      status: dto.status,
      message: dto.message,
    });
  }
}
