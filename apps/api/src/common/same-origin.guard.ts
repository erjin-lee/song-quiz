import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { getCorsOrigins } from './cors-origins.util';

/**
 * 로그인 세션 쿠키를 발급/삭제하는 엔드포인트(signup/login/logout) 전용 가드.
 * 이 요청들은 인증 이전이라 세션 쿠키로는 검증할 수 없어, 대신 Origin 헤더가
 * CORS 허용 목록에 있는지 확인한다 — 공격자 사이트의 폼 자동 제출로 피해자를
 * 공격자 계정에 강제 로그인시키는 로그인 CSRF를 막기 위함이다(ADR-0005의
 * SameSite=Lax는 "이미 로그인된 세션의 상태 변경 요청"만 방어하고, 아직 쿠키가
 * 없는 로그인 요청 자체는 막지 못한다).
 *
 * GET/HEAD가 아닌 요청에는 브라우저가 same-origin이어도 Origin 헤더를 싣는다
 * (Fetch 표준) — 그래서 same-origin 정상 요청도 이 헤더로 판별할 수 있다.
 *
 * "CORS로 허용된 외부 origin인가"와 "API 자신과 같은 origin인가"는 서로 다른
 * 질문이다. CORS 허용 목록은 apps/web처럼 이 API를 cross-origin으로 호출하는
 * 프런트엔드용이라 API 자신의 origin(예: Swagger UI에서 직접 호출할 때의
 * `https://api.noraemat.site`)은 보통 그 목록에 없다. 그래서 요청의
 * protocol+host로 계산한 자기 자신의 origin도 함께 허용한다 — 그래야
 * same-origin 요청(Swagger UI 등)이 CORS 허용 목록 구성과 무관하게 항상 통과한다.
 */
@Injectable()
export class SameOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;
    const selfOrigin = `${request.protocol}://${request.get('host')}`;
    if (
      !origin ||
      (origin !== selfOrigin && !getCorsOrigins().includes(origin))
    ) {
      throw new ForbiddenException('허용되지 않은 요청 출처입니다.');
    }
    return true;
  }
}
