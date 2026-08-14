import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminLoginRequestDto } from './dto/admin-login-request.dto';
import { AdminLoginResponseDto } from './dto/admin-login-response.dto';

@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminService: AdminService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '관리자 로그인(JWT 발급)' })
  @ApiOkResponse({ type: AdminLoginResponseDto })
  @ApiUnauthorizedResponse({
    description: '아이디 또는 비밀번호가 올바르지 않음',
  })
  login(@Body() dto: AdminLoginRequestDto): Promise<AdminLoginResponseDto> {
    return this.adminService.login(dto);
  }
}
