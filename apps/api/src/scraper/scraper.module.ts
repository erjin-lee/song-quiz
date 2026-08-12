import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Album } from '../quiz/entities/album.entity';
import { Artist } from '../quiz/entities/artist.entity';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { Quiz } from '../quiz/entities/quiz.entity';
import { Song } from '../quiz/entities/song.entity';
import { QuizModule } from '../quiz/quiz.module';
import { ChartScraperController } from './chart-scraper.controller';
import { ChartScraperService } from './chart-scraper.service';
import { MelonScraperClient } from './melon-scraper.client';
import { ScraperController } from './scraper.controller';
import { ScraperService } from './scraper.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Artist, Album, Song, Quiz, QuizSong]),
    QuizModule,
  ],
  controllers: [ScraperController, ChartScraperController],
  providers: [ScraperService, ChartScraperService, MelonScraperClient],
})
export class ScraperModule {}
