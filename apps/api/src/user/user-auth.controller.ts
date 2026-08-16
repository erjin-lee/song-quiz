import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { LoginRequestDto } from './dto/login-request.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { MeDto } from './dto/me.dto';
import { SignupRequestDto } from './dto/signup-request.dto';
import { UserAuthenticatedRequest, UserAuthGuard } from './guards/user-auth.guard';
import { UserService } from './user.service';

@ApiTags('auth')
@Controller('auth')
export class UserAuthController {
  constructor(private readonly userService: UserService) {}

  @Post('signup')
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'user-signup': { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: '회원가입(가입 즉시 로그인 처리)' })
  @ApiCreatedResponse({ type: LoginResponseDto })
  @ApiConflictResponse({ description: '이미 사용 중인 로그인 아이디' })
  signup(@Body() dto: SignupRequestDto): Promise<LoginResponseDto> {
    return this.userService.signup(dto);
  }

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'user-login': { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '로그인(JWT 발급)' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({
    description: '아이디 또는 비밀번호가 올바르지 않음',
  })
  login(@Body() dto: LoginRequestDto): Promise<LoginResponseDto> {
    return this.userService.login(dto);
  }

  @Get('me')
  @UseGuards(UserAuthGuard)
  @ApiOperation({ summary: '내 유저 정보 조회' })
  @ApiOkResponse({ type: MeDto })
  @ApiUnauthorizedResponse({ description: '인증 토큰이 없거나 유효하지 않음' })
  getMe(@Req() req: UserAuthenticatedRequest): Promise<MeDto> {
    return this.userService.getMe(req.user.userId);
  }
}
