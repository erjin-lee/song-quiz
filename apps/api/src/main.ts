import { setDefaultResultOrder } from 'node:dns';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as basicAuth from 'express-basic-auth';
import { AppModule } from './app/app.module';

setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
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
  app.useWebSocketAdapter(new IoAdapter(app));

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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('API')
    .setDescription('API 문서')
    .setVersion('1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(API_DOCS_PATH, app, swaggerDocument);

  await app.listen(process.env.PORT ?? 8001);
}
bootstrap();
