# Shared tracing (packages/tracing)

# Purpose

`apps/api`, `apps/game`이 공유하는 OpenTelemetry 분산 트레이싱 초기화를 소유한다. 워크스페이스 이름은 `tracing`. 유일한 export는 `startTracing(options: { service: 'api' | 'game'; environment: string })`.

- **반드시 각 앱 `src/main.ts`의 첫 import**여야 한다(`import './tracing'`). http/express/mysql2 자동 계측(`getNodeAutoInstrumentations`)은 require-in-the-middle로 모듈 로드 시점에 패치하므로, 계측 대상 모듈이 먼저 require되면 계측이 걸리지 않는다.
- Exporter 결정 순서: `OTEL_EXPORTER_OTLP_ENDPOINT`가 있으면 OTLP로 export한다. 없으면 `environment === 'production'`일 때 트레이싱 자체를 비활성화(`undefined` 반환, `console.warn` 1회)하고, 그 외(로컬 개발 등)에는 `ConsoleSpanExporter`로 span을 stdout에 찍는다.
- `instrumentation-fs`, `instrumentation-winston`은 명시적으로 비활성화한다 — winston 계측을 켜면 `packages/logger`가 이미 남기는 camelCase `requestId`/`traceId`와 별개로 snake_case `trace_id`/`span_id`가 로그 한 줄에 중복으로 붙어 스키마가 두 벌이 된다.
- `SIGTERM`/`SIGINT`에서 `sdk.shutdown()`으로 exporter 버퍼를 flush한다(PM2 `kill_timeout` 안에 끝나야 함) — `NestFactory`의 `enableShutdownHooks`와는 별개 핸들러다.
- 테스트 러너는 설정되어 있지 않다.

# Dependencies

- `apps/api`, `apps/game`이 각자 `src/main.ts`에서 동일하게 사용한다.
- `packages/logger`의 requestId/traceId 전파 로직이 이 패키지가 붙인 활성 span에서 실제 traceId/spanId를 읽으므로, 두 패키지는 함께 동작한다.
- game↔api 내부 호출 간 trace 전파는 자체 헤더가 아니라 W3C `traceparent` 표준을 그대로 쓴다.

# Commands

```bash
yarn workspace tracing build
yarn workspace tracing lint
```

# Verification

1. `startTracing` 호출 순서(각 앱 `main.ts` 최상단)를 건드리지 않았는지 확인한다.
2. 테스트가 없으므로, 변경 후 `yarn api:local`/`yarn game:local`로 직접 띄워 콘솔에 span이 찍히는지(로컬) 또는 OTLP 수집기로 전달되는지 눈으로 확인한다.
