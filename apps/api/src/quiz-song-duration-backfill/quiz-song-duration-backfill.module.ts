import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { YoutubeScraperClient } from '../quiz/youtube-scraper.client';
import { QuizSongDurationBackfillController } from './quiz-song-duration-backfill.controller';

/** 1회성 데이터 백필용 모듈. 작업이 끝나면 app.module.ts에서 이 모듈 import를 제거해도 된다. */
@Module({
  imports: [TypeOrmModule.forFeature([QuizSong])],
  controllers: [QuizSongDurationBackfillController],
  providers: [YoutubeScraperClient],
})
export class QuizSongDurationBackfillModule {}
