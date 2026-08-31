import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_FILTER, HttpAdapterHost } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpRequestContextMiddleware, LoggingExceptionFilter } from 'logger';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from '../admin/admin.module';
import { CacheModule } from '../cache/cache.module';
import { ConfigModule } from '../config/config.module';
import { InquiryModule } from '../inquiry/inquiry.module';
import { AccessLogMiddleware } from '../logging/access-log.middleware';
import { LoggingModule } from '../logging/logging.module';
import { QuizModule } from '../quiz/quiz.module';
import { ScraperModule } from '../scraper/scraper.module';
import { SlackModule } from '../slack/slack.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST_NAME,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USER_NAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_AUTH_DB_NAME,
      autoLoadEntities: true,
      synchronize: false,
    }),
    AdminModule,
    CacheModule,
    ConfigModule,
    InquiryModule,
    LoggingModule,
    QuizModule,
    ScraperModule,
    SlackModule,
    UserModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useFactory: (httpAdapterHost: HttpAdapterHost) =>
        new LoggingExceptionFilter(httpAdapterHost.httpAdapter),
      inject: [HttpAdapterHost],
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // requestId/traceId를 심는 미들웨어가 AccessLogMiddleware보다 먼저 실행되어야
    // 액세스 로그에도 같은 상관관계 id가 실린다.
    consumer.apply(HttpRequestContextMiddleware).forRoutes('*');
    consumer
      .apply(AccessLogMiddleware)
      .exclude(
        { path: 'api-docs', method: RequestMethod.ALL },
        { path: 'api-docs-json', method: RequestMethod.ALL },
        { path: 'api-docs-yaml', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
