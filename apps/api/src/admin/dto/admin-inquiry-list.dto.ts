import { ApiProperty } from '@nestjs/swagger';
import { AdminInquiryItemDto } from './admin-inquiry-item.dto';

export class AdminInquiryListDto {
  @ApiProperty({
    description: '문의 목록',
    type: AdminInquiryItemDto,
    isArray: true,
  })
  items: AdminInquiryItemDto[];

  @ApiProperty({ description: '필터 조건에 해당하는 전체 개수', example: 42 })
  total: number;

  @ApiProperty({ description: '현재 페이지(1부터 시작)', example: 1 })
  page: number;

  @ApiProperty({ description: '페이지 크기', example: 50 })
  pageSize: number;
}
