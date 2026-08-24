import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { buildCorrelationHeaders } from 'logger';

/** 헤더명은 apps/api 쪽 InternalAuthGuard와 반드시 동일해야 한다. */
export const INTERNAL_SECRET_HEADER = 'x-internal-secret';

/**
 * apps/api의 내부 전용 엔드포인트를 호출하기 위한 공통 헤더. INTERNAL_SERVICE_SECRET이
 * 설정돼 있지 않으면 apps/api의 InternalAuthGuard가 항상 거부하므로, 여기서도 미설정을
 * 조용히 넘기지 않고 바로 에러를 던져 원인을 명확히 한다.
 *
 * 현재 요청의 requestId(§buildCorrelationHeaders)도 함께 실어 보내, apps/api 쪽
 * 로그에서 같은 requestId로 이 호출을 상관시킬 수 있게 한다. traceId는 여기서
 * 따로 싣지 않는다 — fetch(undici) 호출을 OTel이 자동 계측하면서 W3C
 * traceparent 헤더로 이미 전파하기 때문이다.
 */
export function internalRequestHeaders(): Record<string, string> {
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (!secret) {
    throw new Error('INTERNAL_SERVICE_SECRET이 설정되지 않았습니다.');
  }
  return {
    'Content-Type': 'application/json',
    [INTERNAL_SECRET_HEADER]: secret,
    ...buildCorrelationHeaders(),
  };
}

/**
 * apps/api 내부 엔드포인트가 Nest의 기본 예외 필터 형식(`{ statusCode, message }`)으로
 * 응답한 실패를, 원래 RoomService가 로컬 호출로 직접 던지던 것과 동일한 Nest 예외로
 * 다시 던진다. status 코드로 매핑하므로 apps/api 쪽 메시지가 바뀌어도 그대로 전달된다.
 */
export async function throwForFailedResponse(
  response: Response,
  fallbackMessage: string,
): Promise<never> {
  const body = await response.json().catch(() => null);
  const message =
    (Array.isArray(body?.message) ? body.message.join(', ') : body?.message) ??
    fallbackMessage;

  switch (response.status) {
    case HttpStatus.NOT_FOUND:
      throw new NotFoundException(message);
    case HttpStatus.BAD_REQUEST:
      throw new BadRequestException(message);
    case HttpStatus.CONFLICT:
      throw new ConflictException(message);
    case HttpStatus.FORBIDDEN:
      throw new ForbiddenException(message);
    case HttpStatus.UNAUTHORIZED:
      throw new UnauthorizedException(message);
    case HttpStatus.TOO_MANY_REQUESTS:
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    default:
      throw new ServiceUnavailableException(message);
  }
}
