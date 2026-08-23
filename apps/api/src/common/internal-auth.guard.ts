import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { INTERNAL_SECRET_HEADER } from './internal-service.util';

/**
 * apps/game이 호출하는 이 서비스의 /internal/* 엔드포인트를 보호한다. apps/game 쪽
 * InternalAuthGuard와 대칭되는 가드다 — 공유 패키지 없이 각 서비스가 독립적으로
 * 유지되는 현재 구조(ADR-0003)에 맞춰 작은 파일이라 그대로 중복해서 둔다.
 * INTERNAL_SERVICE_SECRET이 비어 있으면(설정 누락) 항상 거부한다(secure by default).
 */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expected = process.env.INTERNAL_SERVICE_SECRET;
    const actual = request.headers[INTERNAL_SECRET_HEADER];

    if (!expected || actual !== expected) {
      throw new UnauthorizedException('내부 서비스 인증에 실패했습니다.');
    }
    return true;
  }
}
