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

  const apiDocsUser = process.env.API_DOCS_USER;
  const apiDocsPassword = process.env.API_DOCS_PASSWORD;
  if (apiDocsUser && apiDocsPassword) {
    app.use(
      '/api-docs',
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
  SwaggerModule.setup('api-docs', app, swaggerDocument);

  await app.listen(process.env.PORT ?? 8001);
}
bootstrap();
