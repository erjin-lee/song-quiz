import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ConsoleSpanExporter,
  SpanExporter,
} from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

// deployment.environment.name은 아직 incubating semantic convention이라
// 안정 버전 패키지 export에 없고, 그 서브패스는 이 프로젝트의 TS moduleResolution
// (node16/bundler 아님)으로는 resolve되지 않는다. 문자열 상수로 직접 둔다.
const ATTR_DEPLOYMENT_ENVIRONMENT_NAME = 'deployment.environment.name';

export interface TracingOptions {
  service: 'api' | 'game';
  environment: string;
}

/**
 * OTLP 수집기 주소(OTEL_EXPORTER_OTLP_ENDPOINT)가 설정돼 있으면 그쪽으로 export한다.
 * 없으면 environment에 따라 다르게 처리한다 — production이 아닌 환경(로컬 개발 등
 * 수집기가 아직 없는 환경)에서는 ConsoleSpanExporter로 span을 stdout에 그대로 찍어
 * 계측이 실제로 동작하는지 바로 확인할 수 있게 하고, production에서는 undefined를
 * 반환해 호출부가 트레이싱 자체를 비활성화하게 한다 — 수집기 없이 운영 트래픽마다
 * span을 만들고 버리는 건 그냥 오버헤드이고, ConsoleSpanExporter로 실서버 로그를
 * span JSON으로 채우는 것도 원치 않는다.
 */
function resolveTraceExporter(
  options: TracingOptions,
): SpanExporter | undefined {
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return new OTLPTraceExporter();
  }
  if (options.environment === 'production') {
    return undefined;
  }
  return new ConsoleSpanExporter();
}

/**
 * main.ts의 다른 import보다 먼저 실행되어야 한다 — OTel 자동 계측(http/express/
 * mysql2/ioredis/undici)은 require-in-the-middle로 모듈 로드 시점에 패치하므로,
 * express/mysql2/ioredis가 먼저 require된 뒤에는 계측이 걸리지 않는다. tsc가
 * import 순서를 그대로 require 순서로 컴파일하므로(commonjs, 번들러 미사용),
 * 각 앱의 main.ts 맨 위에서 `import './tracing'`으로 호출한다.
 *
 * production에서 OTEL_EXPORTER_OTLP_ENDPOINT가 없으면 트레이싱을 아예 시작하지
 * 않고 undefined를 반환한다 — 이때도 계측 자체는 여전히 no-op tracer로 코드에
 * 붙어있을 뿐이라 앱 동작에는 영향이 없고, PM2 로그에 WARN이 한 번 남는다.
 */
export function startTracing(options: TracingOptions): NodeSDK | undefined {
  if (process.env.OTEL_DEBUG === 'true') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const traceExporter = resolveTraceExporter(options);
  if (!traceExporter) {
    // 아직 StructuredLogger가 뜨기 전(가장 첫 import)이라 winston 로거를 쓸 수
    // 없다 — PM2 로그에 반드시 남도록 console.warn을 직접 쓴다.
    console.warn(
      `[tracing] OTEL_EXPORTER_OTLP_ENDPOINT가 설정되지 않아 ${options.service} 서비스의 트레이싱을 비활성화합니다.`,
    );
    return undefined;
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: options.service,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: options.environment,
    }),
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs 계측은 로그/트레이스 자체 파일 I/O까지 span으로 잡아 노이즈가 크다는
        // 게 OTel 공식 권장 사항 — 여기서도 비활성화한다.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // packages/logger(StructuredLogger)가 이미 requestId/traceId/spanId를
        // 일관된 camelCase로 로그에 실어준다(§structured-logger.ts). winston
        // 계측을 켜두면 여기에 snake_case trace_id/span_id/trace_flags가
        // 로그 한 줄마다 중복으로 더 붙어 스키마가 두 벌이 된다.
        '@opentelemetry/instrumentation-winston': { enabled: false },
      }),
    ],
  });

  sdk.start();

  // PM2 reload/배포/재시작이 보내는 SIGTERM(또는 로컬 개발 중 Ctrl+C의 SIGINT)
  // 시점에 exporter 버퍼에 아직 남아있는 span이 유실되지 않도록 flush한다.
  // ecosystem.config.js의 kill_timeout(5s) 안에 끝나야 한다 — NestFactory의
  // app.enableShutdownHooks가 등록한 핸들러와는 별개로 동작한다.
  const shutdown = (): void => {
    sdk.shutdown().catch((err: unknown) => {
      console.error(`[tracing] ${options.service} SDK shutdown 실패`, err);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return sdk;
}
