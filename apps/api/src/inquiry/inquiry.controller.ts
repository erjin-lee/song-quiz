import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SubmitInquiryRequestDto } from './dto/submit-inquiry-request.dto';
import { SubmitInquiryResponseDto } from './dto/submit-inquiry-response.dto';
import { InquiryService } from './inquiry.service';

@ApiTags('inquiry')
@Controller('inquiries')
export class InquiryController {
  constructor(private readonly inquiryService: InquiryService) {}

  @Post()
  @ApiOperation({
    summary:
      '곡 관련 문의 접수(즉시 접수 응답 후 AI 판별·조치는 백그라운드로 처리, 결과는 소켓 inquiry:result로 전달)',
  })
  @ApiOkResponse({ description: '접수 결과', type: SubmitInquiryResponseDto })
  @ApiBadRequestResponse({ description: '문의 횟수 초과 등 요청 제한 위반' })
  submit(
    @Body() dto: SubmitInquiryRequestDto,
  ): Promise<SubmitInquiryResponseDto> {
    return this.inquiryService.submit(dto);
  }
}
