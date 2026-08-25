# Shared logging (packages/logger)

# Purpose

`apps/api`, `apps/game`이 공유하는 구조화 로깅 인프라를 소유한다. 워크스페이스 이름은 `logger`.

- `LogContext`(`AsyncLocalStorage` 기반, `runWithLogContext`/`getLogContext`/`updateLogContext`): 요청/소켓 메시지 생명주기 동안 유지되는 상관관계 값(`service`, `requestId`, `traceId`, `userId`, `roomId` 등)을 담는다. `event`/`errorCode`/`durationMs`처럼 "이 로그 한 건"에만 해당하는 값은 여기 넣지 않고 `LogMetadata`로 로거 호출마다 명시적으로 넘긴다 — ambient context에 넣으면 같은 요청 스코프의 무관한 로그까지 값을 물려받는다.
- `StructuredLogger`: NestJS `LoggerService`를 구현한다. `app.useLogger()`로 등록하면 코드 전체의 기존 `new Logger(ClassName)` 호출이 별도 수정 없이 JSON 구조화 로그로 전환된다.
- `HttpRequestContextMiddleware`/`SocketRequestContextInterceptor`: 요청/소켓 진입 시 `LogContext`를 채운다(OTel 활성 span에서 traceId를 읽어옴 — 자체 생성하지 않음).
- `LoggingExceptionFilter`: 처리되지 않은 예외를 구조화 로그로 남긴다.
- `redactSensitiveFields`: `password`/`token`/`secret`/`cookie` 등과 **정규화 후 정확히 일치**하는 필드만 마스킹한다. substring 매칭은 `tokens`(배열 필드) 같은 정상 필드까지 오탐으로 가려버려 되돌린 이력이 있다 — 새 민감 필드가 생기면 `SENSITIVE_KEYS`에 명시적으로 추가한다(부분 문자열 매칭으로 "일반화"하지 않는다).
- `buildCorrelationHeaders`: `apps/game` ↔ `apps/api` 내부 호출 시 `requestId`를 전파하는 헤더를 만든다.

# Dependencies

- `apps/api`, `apps/game`이 각자 동일하게 사용한다. `AccessLogMiddleware`(정책이 api/game마다 다를 수 있음)와 winston access logger factory(파일 경로 등)는 이 패키지로 옮기지 않고 각 앱에 복제되어 있다 — ADR-0003과 동일한 이유(공유 비용 > 수동 동기화 비용).
- `packages/tracing`이 붙이는 OTel span에서 traceId/spanId를 읽어와 로그와 연결한다.

# Commands

```bash
yarn workspace logger build
yarn workspace logger test
yarn workspace logger lint
```

# Verification

1. 이 패키지를 수정하면 `apps/api`/`apps/game` 양쪽이 실제로 이 코드를 쓰므로, 두 앱의 관련 테스트도 함께 확인한다.
2. `redactSensitiveFields`를 바꿀 때는 오탐(정상 필드 마스킹)과 누락(민감 필드 노출) 둘 다 테스트로 확인한다.
