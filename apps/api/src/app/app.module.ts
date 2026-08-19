import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from '../admin/admin.module';
import { CacheModule } from '../cache/cache.module';
import { ConfigModule } from '../config/config.module';
import { InquiryModule } from '../inquiry/inquiry.module';
import { AccessLogMiddleware } from '../logging/access-log.middleware';
import { LoggingModule } from '../logging/logging.module';
import { QuizModule } from '../quiz/quiz.module';
import { RoomModule } from '../room/room.module';
import { ScraperModule } from '../scraper/scraper.module';
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
    RoomModule,
    ScraperModule,
    UserModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
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
