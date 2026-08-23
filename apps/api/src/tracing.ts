import { startTracing } from 'tracing';

// main.ts의 맨 첫 import여야 한다 — OTel 자동 계측(http/express/mysql2/ioredis)이
// require-in-the-middle로 모듈을 패치하므로, 그 대상 모듈들(TypeOrmModule의
// mysql2, CacheModule의 ioredis 등)이 먼저 require된 뒤에는 계측이 걸리지 않는다.
startTracing({
  service: 'api',
  environment: process.env.NODE_ENV ?? 'development',
});
