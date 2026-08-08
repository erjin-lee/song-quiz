import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Album } from './entities/album.entity';
import { Artist } from './entities/artist.entity';
import { QuizAnswer } from './entities/quiz-answer.entity';
import { QuizArtist } from './entities/quiz-artist.entity';
import { QuizSong } from './entities/quiz-song.entity';
import { Quiz } from './entities/quiz.entity';
import { Song } from './entities/song.entity';
import { QuizController } from './quiz.controller';
import { QuizGeneratorService } from './quiz-generator.service';
import { QuizService } from './quiz.service';
import { YoutubeScraperClient } from './youtube-scraper.client';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Quiz,
      QuizSong,
      QuizAnswer,
      QuizArtist,
      Song,
      Album,
      Artist,
    ]),
  ],
  controllers: [QuizController],
  providers: [QuizService, QuizGeneratorService, YoutubeScraperClient],
})
export class QuizModule {}
