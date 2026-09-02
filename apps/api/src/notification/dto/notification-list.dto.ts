import { ApiProperty } from '@nestjs/swagger';
import { NotificationItemDto } from './notification-item.dto';

export class NotificationListDto {
  @ApiProperty({
    description: '알림 목록(최신순)',
    type: [NotificationItemDto],
  })
  items: NotificationItemDto[];

  @ApiProperty({ description: '안 읽은 알림 개수(전체 기준)' })
  unreadCount: number;
}
