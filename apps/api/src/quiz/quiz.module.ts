import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenAiChatClient } from '../openai/openai-chat.client';
import { Album } from './entities/album.entity';
import { Artist } from './entities/artist.entity';
import { QuizAnswer } from './entities/quiz-answer.entity';
import { QuizArtist } from './entities/quiz-artist.entity';
import { QuizSong } from './entities/quiz-song.entity';
import { Quiz } from './entities/quiz.entity';
import { Song } from './entities/song.entity';
import { GptAnswerClient } from './gpt-answer.client';
import { QuizController } from './quiz.controller';
import { QuizAnswerGeneratorService } from './quiz-answer-generator.service';
import { QuizGeneratorService } from './quiz-generator.service';
import { QuizSongReuseService } from './quiz-song-reuse.service';
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
  providers: [
    QuizService,
    QuizGeneratorService,
    YoutubeScraperClient,
    QuizAnswerGeneratorService,
    GptAnswerClient,
    OpenAiChatClient,
    QuizSongReuseService,
  ],
  exports: [QuizSongReuseService],
})
export class QuizModule {}
