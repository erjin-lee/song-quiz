import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminInquiryItemDto } from './dto/admin-inquiry-item.dto';
import { AdminItemDto } from './dto/admin-item.dto';
import { AdminMeDto } from './dto/admin-me.dto';
import { ChangeAdminPasswordRequestDto } from './dto/change-admin-password-request.dto';
import { CreateAdminRequestDto } from './dto/create-admin-request.dto';
import { CreateAdminResponseDto } from './dto/create-admin-response.dto';
import { GetAdminInquiriesQueryDto } from './dto/get-admin-inquiries-query.dto';
import { UpdateAdminProfileRequestDto } from './dto/update-admin-profile-request.dto';
import {
  AdminAuthenticatedRequest,
  AdminAuthGuard,
} from './guards/admin-auth.guard';

@ApiTags('admin')
@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('ping')
  @ApiOperation({ summary: '관리자 인증 확인용' })
  @ApiOkResponse({ description: '인증 성공' })
  ping(): { ok: true } {
    return { ok: true };
  }

  @Get('inquiries')
  @ApiOperation({ summary: '문의 처리 현황 목록 조회(상태/신뢰도 필터 가능)' })
  @ApiOkResponse({
    description: '문의 목록',
    type: AdminInquiryItemDto,
    isArray: true,
  })
  getInquiries(
    @Query() query: GetAdminInquiriesQueryDto,
  ): Promise<AdminInquiryItemDto[]> {
    return this.adminService.getInquiries(query);
  }

  @Post('inquiries/:inquiryId/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '검토 대기 문의 승인(판별된 조치를 실행하고 완료 처리)',
  })
  @ApiParam({ name: 'inquiryId', description: '문의 ID' })
  @ApiOkResponse({ description: '승인 처리 완료' })
  @ApiNotFoundResponse({ description: '문의를 찾을 수 없음' })
  approveInquiry(@Param('inquiryId') inquiryId: string): Promise<void> {
    return this.adminService.approveInquiry(inquiryId);
  }

  @Post('inquiries/:inquiryId/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '검토 대기 문의 반려' })
  @ApiParam({ name: 'inquiryId', description: '문의 ID' })
  @ApiOkResponse({ description: '반려 처리 완료' })
  @ApiNotFoundResponse({ description: '문의를 찾을 수 없음' })
  rejectInquiry(@Param('inquiryId') inquiryId: string): Promise<void> {
    return this.adminService.rejectInquiry(inquiryId);
  }

  @Post('admins')
  @ApiOperation({
    summary: '관리자 계정 생성(임시 비밀번호 자동 발급, 1회 응답 노출)',
  })
  @ApiCreatedResponse({ type: CreateAdminResponseDto })
  @ApiConflictResponse({ description: '이미 사용 중인 로그인 아이디' })
  createAdmin(
    @Body() dto: CreateAdminRequestDto,
  ): Promise<CreateAdminResponseDto> {
    return this.adminService.createAdmin(dto);
  }

  @Get('admins')
  @ApiOperation({ summary: '관리자 계정 목록 조회' })
  @ApiOkResponse({
    description: '관리자 목록',
    type: AdminItemDto,
    isArray: true,
  })
  listAdmins(): Promise<AdminItemDto[]> {
    return this.adminService.listAdmins();
  }

  @Get('me')
  @ApiOperation({ summary: '내 관리자 정보 조회' })
  @ApiOkResponse({ type: AdminMeDto })
  getMe(@Req() req: AdminAuthenticatedRequest): Promise<AdminMeDto> {
    return this.adminService.getMe(req.admin.userId);
  }

  @Patch('me')
  @ApiOperation({ summary: '내 관리자 정보 수정(닉네임)' })
  @ApiOkResponse({ type: AdminMeDto })
  updateMe(
    @Req() req: AdminAuthenticatedRequest,
    @Body() dto: UpdateAdminProfileRequestDto,
  ): Promise<AdminMeDto> {
    return this.adminService.updateMyProfile(req.admin.userId, dto);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '내 비밀번호 변경(현재 비밀번호 확인 필요)' })
  @ApiOkResponse({ description: '변경 완료' })
  @ApiUnauthorizedResponse({ description: '현재 비밀번호가 올바르지 않음' })
  changeMyPassword(
    @Req() req: AdminAuthenticatedRequest,
    @Body() dto: ChangeAdminPasswordRequestDto,
  ): Promise<void> {
    return this.adminService.changeMyPassword(req.admin.userId, dto);
  }
}
