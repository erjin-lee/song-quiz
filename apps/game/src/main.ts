import { setDefaultResultOrder } from 'node:dns';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app/app.module';
import { CacheService } from './cache/cache.service';
import { RedisIoAdapter } from './common/redis-io.adapter';

setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // apps/api의 main.ts와 동일한 이유로 PM2 cluster reload/재시작 시 그레이스풀
  // 셧다운한다. ecosystem.config.js의 kill_timeout과 짝을 이룬다.
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
  // 리버스 프록시(nginx/ALB) 1단계 뒤에서 서비스되므로, X-Forwarded-For의
  // 마지막 값을 실제 클라이언트 IP로 신뢰한다(비밀번호 시도 제한이 IP 기준이다).
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

  if (!process.env.USER_JWT_SECRET) {
    // 방 참가 접근 토큰(computeMembershipToken)을 apps/api의 로그인 JWT와 같은
    // 키로 서명하므로, 이 서비스에도 동일한 값이 필요하다.
    throw new Error('USER_JWT_SECRET을 설정해야 합니다.');
  }
  if (!process.env.INTERNAL_SERVICE_SECRET) {
    // apps/api ↔ apps/game 간 내부 엔드포인트 호출을 인증하는 공유 시크릿.
    throw new Error('INTERNAL_SERVICE_SECRET을 설정해야 합니다.');
  }

  await app.listen(process.env.PORT ?? 8002);

  // ecosystem.config.js의 wait_ready: true와 짝을 이룬다. PM2 밖(로컬 개발 등)에는
  // IPC 채널이 없어 process.send가 없으므로 안전하게 스킵된다.
  process.send?.('ready');
}
bootstrap().catch((err) => {
  new Logger('Bootstrap').error(`부팅 실패: ${(err as Error).message}`);
  process.exit(1);
});
