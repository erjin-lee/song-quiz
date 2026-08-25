import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  parseCookie,
} from '../common/auth-cookie.util';
import { SameOriginGuard } from '../common/same-origin.guard';
import { EmailAuthService } from './email-auth.service';
import { EMAIL_AUTH_CODE_TTL_MINUTES } from './email-auth.constants';
import { LoginRequestDto } from './dto/login-request.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { MeDto } from './dto/me.dto';
import { SendEmailVerificationCodeRequestDto } from './dto/send-email-verification-code-request.dto';
import { SendEmailVerificationCodeResultDto } from './dto/send-email-verification-code-result.dto';
import { SignupRequestDto } from './dto/signup-request.dto';
import { VerifyEmailVerificationCodeRequestDto } from './dto/verify-email-verification-code-request.dto';
import { VerifyEmailVerificationCodeResultDto } from './dto/verify-email-verification-code-result.dto';
import {
  UserAuthenticatedRequest,
  UserAuthGuard,
} from './guards/user-auth.guard';
import { AUTH_COOKIE_MAX_AGE_MS } from './user.constants';
import { UserService } from './user.service';

@ApiTags('auth')
@Controller('auth')
export class UserAuthController {
  constructor(
    private readonly userService: UserService,
    private readonly emailAuthService: EmailAuthService,
  ) {}

  @Post('signup')
  @UseGuards(ThrottlerGuard, SameOriginGuard)
  @Throttle({ 'user-signup': { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: '회원가입(가입 즉시 로그인 처리)' })
  @ApiCreatedResponse({ type: LoginResponseDto })
  @ApiConflictResponse({ description: '이미 사용 중인 로그인 아이디' })
  async signup(
    @Body() dto: SignupRequestDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const session = await this.userService.signup(dto);
    res.cookie(
      AUTH_COOKIE_NAME,
      session.accessToken,
      authCookieOptions(AUTH_COOKIE_MAX_AGE_MS),
    );
    return session.user;
  }

  @Post('login')
  @UseGuards(ThrottlerGuard, SameOriginGuard)
  @Throttle({ 'user-login': { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '로그인(JWT 발급)' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({
    description: '아이디 또는 비밀번호가 올바르지 않음',
  })
  async login(
    @Body() dto: LoginRequestDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const session = await this.userService.login(dto);
    res.cookie(
      AUTH_COOKIE_NAME,
      session.accessToken,
      authCookieOptions(AUTH_COOKIE_MAX_AGE_MS),
    );
    return session.user;
  }

  @Post('logout')
  @UseGuards(SameOriginGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '로그아웃(세션 쿠키 삭제)' })
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions());
  }

  @Get('me')
  @UseGuards(UserAuthGuard)
  @ApiOperation({ summary: '내 유저 정보 조회' })
  @ApiOkResponse({ type: MeDto })
  @ApiUnauthorizedResponse({ description: '인증 토큰이 없거나 유효하지 않음' })
  getMe(@Req() req: UserAuthenticatedRequest): Promise<MeDto> {
    return this.userService.getMe(req.user.userId);
  }

  /**
   * 비로그인 상태에서도 호출 가능해야 한다(추후 회원가입 등 다른 흐름에서도
   * 재사용할 수 있도록). Authorization 헤더가 있으면 검증해 로그인 계정에
   * 인증 이력을 연결하고, 검증 성공 시 해당 계정의 이메일을 갱신한다.
   */
  @Post('email/send-code')
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'email-send-code': { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '이메일 인증번호 발송' })
  @ApiOkResponse({ type: SendEmailVerificationCodeResultDto })
  @ApiUnauthorizedResponse({ description: '인증 토큰이 있으나 유효하지 않음' })
  async sendEmailVerificationCode(
    @Body() dto: SendEmailVerificationCodeRequestDto,
    @Req() req: Request,
  ): Promise<SendEmailVerificationCodeResultDto> {
    const token = parseCookie(req.headers.cookie, AUTH_COOKIE_NAME);
    const accountUserId = await this.userService.resolveOptionalAccountUserId(
      token ? `Bearer ${token}` : undefined,
    );
    await this.emailAuthService.sendVerificationCode(dto.email, accountUserId);
    return { expiresInMinutes: EMAIL_AUTH_CODE_TTL_MINUTES };
  }

  @Post('email/verify-code')
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'email-verify-code': { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '이메일 인증번호 확인' })
  @ApiOkResponse({ type: VerifyEmailVerificationCodeResultDto })
  @ApiBadRequestResponse({ description: '인증번호가 올바르지 않거나 만료됨' })
  @ApiUnauthorizedResponse({ description: '인증 토큰이 있으나 유효하지 않음' })
  async verifyEmailVerificationCode(
    @Body() dto: VerifyEmailVerificationCodeRequestDto,
    @Req() req: Request,
  ): Promise<VerifyEmailVerificationCodeResultDto> {
    const token = parseCookie(req.headers.cookie, AUTH_COOKIE_NAME);
    const accountUserId = await this.userService.resolveOptionalAccountUserId(
      token ? `Bearer ${token}` : undefined,
    );
    await this.emailAuthService.verifyCode(dto.email, dto.code, accountUserId);
    return { verified: true };
  }
}
