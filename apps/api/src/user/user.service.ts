import { randomUUID } from 'crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { LoginRequestDto } from './dto/login-request.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { MeDto } from './dto/me.dto';
import { SignupRequestDto } from './dto/signup-request.dto';
import { UserJwtPayload } from './user-auth.types';
import {
  BCRYPT_SALT_ROUNDS,
  USER_JWT_EXPIRES_IN,
  USER_ROLE,
} from './user.constants';

function isDuplicateLoginIdError(error: unknown): boolean {
  return (error as { code?: string })?.code === 'ER_DUP_ENTRY';
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async signup(dto: SignupRequestDto): Promise<LoginResponseDto> {
    const existing = await this.userRepository.findOne({
      where: { loginId: dto.loginId },
    });
    if (existing) {
      throw new ConflictException('이미 사용 중인 로그인 아이디입니다.');
    }

    const pwdHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const now = new Date();

    let saved: User;
    try {
      saved = await this.userRepository.save(
        this.userRepository.create({
          userId: randomUUID(),
          loginId: dto.loginId,
          nickNm: dto.nickNm,
          pwdHash,
          role: USER_ROLE,
          status: 'ACTIVE',
          grade: 'NORMAL',
          emailAuthYn: 'N',
          crtDt: now,
          updDt: now,
        }),
      );
    } catch (error) {
      if (isDuplicateLoginIdError(error)) {
        throw new ConflictException('이미 사용 중인 로그인 아이디입니다.');
      }
      throw error;
    }

    return this.issueToken(saved);
  }

  async login(dto: LoginRequestDto): Promise<LoginResponseDto> {
    const user = await this.userRepository.findOne({
      where: { loginId: dto.loginId, role: USER_ROLE },
    });
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !(await bcrypt.compare(dto.password, user.pwdHash))
    ) {
      throw new UnauthorizedException(
        '아이디 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    await this.userRepository.update(user.userKey, { lastLoginDt: new Date() });
    return this.issueToken(user);
  }

  async getMe(userId: string): Promise<MeDto> {
    const user = await this.findUserByUserIdOrThrow(userId);
    return { userId: user.userId, loginId: user.loginId, nickNm: user.nickNm };
  }

  /**
   * 로그인이 필수는 아니지만(게스트 허용) 로그인 상태라면 계정 식별을 반영해야
   * 하는 API(방 생성/입장 등)에서 쓰는 공용 선택적 인증. Authorization 헤더가
   * 아예 없으면 게스트로 취급해 undefined를 반환한다. 헤더가 있는데 서명이
   * 무효거나 계정이 더 이상 ACTIVE가 아니면(정지/탈퇴) 조용히 게스트로
   * 낮추지 않고 401을 던진다 — 유효하지 않은 자격증명은 명시적으로 거부해야
   * 정지된 계정이 방 생성/입장에서 자신의 영구 userId를 계속 쓰는 것을 막을 수 있다.
   */
  async resolveOptionalAccountUserId(
    authHeader: string | undefined,
  ): Promise<string | undefined> {
    if (!authHeader?.startsWith('Bearer ')) {
      return undefined;
    }

    let payload: UserJwtPayload;
    try {
      payload = this.jwtService.verify<UserJwtPayload>(
        authHeader.slice('Bearer '.length),
        { secret: process.env.USER_JWT_SECRET },
      );
    } catch {
      throw new UnauthorizedException('인증 토큰이 유효하지 않습니다.');
    }

    try {
      const user = await this.findUserByUserIdOrThrow(payload.userId);
      return user.userId;
    } catch {
      throw new UnauthorizedException('인증 토큰이 유효하지 않습니다.');
    }
  }

  /** 이메일 인증코드 발송 시 요청 계정을 함께 기록해두기 위한 조회. 없으면 null. */
  async findUserKeyByUserId(userId: string): Promise<string | null> {
    const user = await this.userRepository.findOne({
      where: { userId, role: USER_ROLE, status: 'ACTIVE' },
    });
    return user?.userKey ?? null;
  }

  async markEmailVerified(userId: string, email: string): Promise<void> {
    const user = await this.findUserByUserIdOrThrow(userId);
    await this.userRepository.update(user.userKey, {
      email,
      emailAuthYn: 'Y',
      emailAuthDt: new Date(),
      updDt: new Date(),
    });
  }

  private issueToken(user: User): LoginResponseDto {
    const payload: UserJwtPayload = {
      sub: user.userId,
      userId: user.userId,
      loginId: user.loginId,
      nickNm: user.nickNm,
    };
    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.USER_JWT_SECRET,
      expiresIn: USER_JWT_EXPIRES_IN,
    });

    return {
      accessToken,
      userId: user.userId,
      loginId: user.loginId,
      nickNm: user.nickNm,
    };
  }

  private async findUserByUserIdOrThrow(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { userId, role: USER_ROLE },
    });
    if (!user) {
      throw new NotFoundException('유저를 찾을 수 없습니다.');
    }
    if (user.status !== 'ACTIVE') {
      // 정지/탈퇴 등으로 상태가 바뀐 뒤에도 이미 발급된 JWT는 만료 전까지
      // 서명 검증만으로는 계속 유효하므로, /auth/me 조회 시점에 DB 상태를
      // 다시 확인해 더 이상 인증된 것으로 취급하지 않는다.
      throw new UnauthorizedException('계정이 비활성화되었습니다.');
    }
    return user;
  }
}
