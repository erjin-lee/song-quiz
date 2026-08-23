import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CacheModule } from '../cache/cache.module';
import { AccessLogMiddleware } from '../logging/access-log.middleware';
import { LoggingModule } from '../logging/logging.module';
import { RoomModule } from '../room/room.module';

@Module({
  imports: [CacheModule, LoggingModule, RoomModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AccessLogMiddleware).forRoutes('*');
  }
}
