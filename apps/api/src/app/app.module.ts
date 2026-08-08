import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CacheModule } from '../cache/cache.module';
import { QuizModule } from '../quiz/quiz.module';
import { RoomModule } from '../room/room.module';
import { ScraperModule } from '../scraper/scraper.module';

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
    CacheModule,
    QuizModule,
    RoomModule,
    ScraperModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
