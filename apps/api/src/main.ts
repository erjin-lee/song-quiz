import { setDefaultResultOrder } from 'node:dns';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as basicAuth from 'express-basic-auth';
import { AppModule } from './app/app.module';
import { CacheService } from './cache/cache.service';
import { RedisIoAdapter } from './common/redis-io.adapter';

setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // PM2 cluster reload/재시작 시 보내는 SIGINT/SIGTERM에 반응해 그레이스풀 셧다운한다.
  // 이 훅이 없으면 Node 기본 동작대로 신호를 받는 즉시 프로세스가 종료되어(OnModuleDestroy도
  // 호출되지 않음) 처리 중이던 요청·소켓이 그대로 끊긴다. ecosystem.config.js의
  // kill_timeout과 짝을 이룬다 — 그 시간 안에 정상 종료(app.close())가 끝나야 하고,
  // 못 끝내면 PM2가 SIGKILL로 강제 종료한다.
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
  // 리버스 프록시(nginx/ALB) 1단계 뒤에서 서비스되므로, X-Forwarded-For의
  // 마지막 값을 실제 클라이언트 IP로 신뢰한다. 그렇지 않으면 ThrottlerGuard가
  // 프록시 IP 기준으로만 rate limit을 적용해 모든 사용자가 이를 공유하게 된다.
  app.set('trust proxy', 1);
  const corsOriginEnv = process.env.CORS_ORIGIN?.trim();
  const corsOrigins = corsOriginEnv
    ? corsOriginEnv.split(',').map((origin) => origin.trim())
    : [
        'http://localhost:5173',
        'http://localhost:3000',
        'https://noraemat.site',
      ];
  app.enableCors({ origin: corsOrigins });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const redisIoAdapter = new RedisIoAdapter(app, app.get(CacheService));
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  const API_DOCS_PATH = 'api-docs';
  const apiDocsUser = process.env.API_DOCS_USER;
  const apiDocsPassword = process.env.API_DOCS_PASSWORD;
  if (Boolean(apiDocsUser) !== Boolean(apiDocsPassword)) {
    throw new Error(
      'API_DOCS_USER와 API_DOCS_PASSWORD는 함께 설정해야 합니다.',
    );
  }
  if (apiDocsUser && apiDocsPassword) {
    // SwaggerModule.setup은 UI 경로(`/api-docs`)뿐 아니라 형제 경로인
    // `/api-docs-json`, `/api-docs-yaml`도 함께 노출하므로 셋 다 보호해야 한다.
    app.use(
      [`/${API_DOCS_PATH}`, `/${API_DOCS_PATH}-json`, `/${API_DOCS_PATH}-yaml`],
      basicAuth({
        users: { [apiDocsUser]: apiDocsPassword },
        challenge: true,
      }),
    );
  }

  // ADMIN_USER/ADMIN_PASSWORD는 더 이상 basic-auth 자격증명이 아니라
  // 최초 관리자 계정 시딩(AdminSeedService)에 사용된다.
  const adminUser = process.env.ADMIN_USER;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminUser || !adminPassword) {
    throw new Error('ADMIN_USER와 ADMIN_PASSWORD를 설정해야 합니다.');
  }

  if (!process.env.ADMIN_JWT_SECRET) {
    throw new Error('ADMIN_JWT_SECRET을 설정해야 합니다.');
  }

  if (!process.env.USER_JWT_SECRET) {
    throw new Error('USER_JWT_SECRET을 설정해야 합니다.');
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('API')
    .setDescription('API 문서')
    .setVersion('1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(API_DOCS_PATH, app, swaggerDocument);

  await app.listen(process.env.PORT ?? 8001);

  // ecosystem.config.js의 wait_ready: true는 PM2가 listen 이벤트만으로 준비 완료를
  // 추정하던 기본 동작을 끄고 이 신호를 명시적으로 기다리게 만든다 — 그래야 cluster
  // reload 시 다음 워커로 넘어가기 전에 이 프로세스가 Redis 연결 등 부트스트랩을
  // 실제로 마쳤는지 확인한다. PM2 밖(로컬 개발 등)에는 IPC 채널이 없어
  // process.send가 없으므로 안전하게 스킵된다.
  process.send?.('ready');
}
// connectToRedis()는 REDIS_HOST가 설정된 환경에서 재시도 후에도 어댑터 연결에
// 실패하면 예외를 던진다(RedisIoAdapter 참고) — 여기서 명시적으로 process.exit해
// 이 인스턴스가 room 브로드캐스트가 깨진 채로 트래픽을 받는 것을 막는다.
bootstrap().catch((err) => {
  new Logger('Bootstrap').error(`부팅 실패: ${(err as Error).message}`);
  process.exit(1);
});
