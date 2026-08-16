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
