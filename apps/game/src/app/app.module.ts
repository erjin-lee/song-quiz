import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, HttpAdapterHost } from '@nestjs/core';
import { HttpRequestContextMiddleware, LoggingExceptionFilter } from 'logger';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CacheModule } from '../cache/cache.module';
import { AccessLogMiddleware } from '../logging/access-log.middleware';
import { LoggingModule } from '../logging/logging.module';
import { RoomModule } from '../room/room.module';

@Module({
  imports: [CacheModule, LoggingModule, RoomModule],
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
    consumer.apply(AccessLogMiddleware).forRoutes('*');
  }
}
