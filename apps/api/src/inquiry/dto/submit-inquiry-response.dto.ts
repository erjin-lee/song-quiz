import { ApiProperty } from '@nestjs/swagger';

export class SubmitInquiryResponseDto {
  @ApiProperty({ description: '생성된 문의 ID', example: '1' })
  inquiryId: string;

  @ApiProperty({
    description: '접수 안내 메시지',
    example: '문의가 접수되었습니다. 확인 후 알려드릴게요.',
  })
  message: string;
}
