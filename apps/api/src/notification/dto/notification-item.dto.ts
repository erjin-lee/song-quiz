import { ApiProperty } from '@nestjs/swagger';

export class NotificationItemDto {
  @ApiProperty({ description: '알림 ID', example: '1' })
  notiId: string;

  @ApiProperty({ description: '알림 종류', example: 'QUIZ_REG_COMPLETED' })
  notiType: string;

  @ApiProperty({ description: '제목', example: '퀴즈 등록이 완료됐어요' })
  title: string;

  @ApiProperty({
    description: '내용',
    example: "'아이유 노래 맞추기' 퀴즈가 정상적으로 등록됐어요.",
  })
  message: string;

  @ApiProperty({
    description: '클릭 시 이동할 프런트 라우트. 없으면 null',
    example: '/quizzes/123/edit',
    nullable: true,
  })
  linkPath: string | null;

  @ApiProperty({ description: '읽음 여부' })
  isRead: boolean;

  @ApiProperty({ description: '생성일시' })
  crtDt: Date;
}
