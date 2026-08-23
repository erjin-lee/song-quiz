import { startTracing } from 'tracing';

// main.ts의 맨 첫 import여야 한다 — OTel 자동 계측(http/express/ioredis/undici)이
// require-in-the-middle로 모듈을 패치하므로, 그 대상 모듈들(예: ioredis를 쓰는
// CacheModule)이 먼저 require된 뒤에는 계측이 걸리지 않는다.
startTracing({
  service: 'game',
  environment: process.env.NODE_ENV ?? 'development',
});
