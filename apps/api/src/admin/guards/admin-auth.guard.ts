import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AdminJwtPayload } from '../admin-auth.types';

export interface AdminAuthenticatedRequest extends Request {
  admin: AdminJwtPayload;
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<AdminAuthenticatedRequest>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('인증 토큰이 필요합니다.');
    }

    try {
      request.admin = this.jwtService.verify<AdminJwtPayload>(
        authHeader.slice('Bearer '.length),
        { secret: process.env.ADMIN_JWT_SECRET },
      );
      return true;
    } catch {
      throw new UnauthorizedException('인증 토큰이 유효하지 않습니다.');
    }
  }
}
