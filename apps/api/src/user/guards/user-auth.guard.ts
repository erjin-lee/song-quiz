import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { updateLogContext } from 'logger';
import { AUTH_COOKIE_NAME, parseCookie } from '../../common/auth-cookie.util';
import { UserJwtPayload } from '../user-auth.types';

export interface UserAuthenticatedRequest extends Request {
  user: UserJwtPayload;
}

@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<UserAuthenticatedRequest>();
    const token = parseCookie(request.headers.cookie, AUTH_COOKIE_NAME);
    if (!token) {
      throw new UnauthorizedException('인증 토큰이 필요합니다.');
    }

    try {
      request.user = this.jwtService.verify<UserJwtPayload>(token, {
        secret: process.env.USER_JWT_SECRET,
      });
      // 검증이 끝난 시점에 한 줄만 얹어, 같은 요청 안에서 이후 실행되는 다른
      // 서비스 로그에도 검증된 userId가 자동으로 실리게 한다.
      updateLogContext({ userId: request.user.userId });
      return true;
    } catch {
      throw new UnauthorizedException('인증 토큰이 유효하지 않습니다.');
    }
  }
}
