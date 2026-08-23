import { IsIn, IsNotEmpty, IsString } from 'class-validator';

/**
 * apps/api의 InquiryService가 문의 처리 결과를 이 서비스의 소켓(RoomGateway)으로
 * 전달하기 위해 호출하는 내부 엔드포인트의 요청 바디. apps/api의 InquiryResultPayload
 * (inquiry.controller 쪽에서 room.gateway.ts로 직접 import하던 타입)와 필드가 동일해야 한다.
 */
export class InquiryResultNotificationDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  inquiryId: string;

  @IsIn(['REJECTED', 'PENDING_REVIEW', 'COMPLETED'])
  status: 'REJECTED' | 'PENDING_REVIEW' | 'COMPLETED';

  @IsString()
  message: string;
}
