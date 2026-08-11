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
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  });
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
      [
        `/${API_DOCS_PATH}`,
        `/${API_DOCS_PATH}-json`,
        `/${API_DOCS_PATH}-yaml`,
      ],
      basicAuth({
        users: { [apiDocsUser]: apiDocsPassword },
        challenge: true,
      }),
    );
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
