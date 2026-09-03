import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationModule } from '../notification/notification.module';
import { OpenAiChatClient } from '../openai/openai-chat.client';
import { UserModule } from '../user/user.module';
import { Album } from './entities/album.entity';
import { Artist } from './entities/artist.entity';
import { QuizAnswer } from './entities/quiz-answer.entity';
import { QuizArtist } from './entities/quiz-artist.entity';
import { QuizSong } from './entities/quiz-song.entity';
import { Quiz } from './entities/quiz.entity';
import { Song } from './entities/song.entity';
import { GptAnswerClient } from './gpt-answer.client';
import { QuizInternalController } from './internal/quiz-internal.controller';
import { QuizInternalService } from './internal/quiz-internal.service';
import { QuizController } from './quiz.controller';
import { QuizAnswerGeneratorService } from './quiz-answer-generator.service';
import { QuizGeneratorService } from './quiz-generator.service';
import { QuizSongReuseService } from './quiz-song-reuse.service';
import { QuizService } from './quiz.service';
import { UserQuizRegistrationController } from './user-quiz-registration.controller';
import { UserQuizRegistrationService } from './user-quiz-registration.service';
import { UserSongController } from './user-song.controller';
import { UserSongService } from './user-song.service';
import { YoutubeLinkValidationService } from './youtube-link-validation.service';
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
    UserModule,
    NotificationModule,
  ],
  controllers: [
    QuizController,
    QuizInternalController,
    UserSongController,
    UserQuizRegistrationController,
  ],
  providers: [
    QuizService,
    QuizGeneratorService,
    YoutubeScraperClient,
    QuizAnswerGeneratorService,
    GptAnswerClient,
    OpenAiChatClient,
    QuizSongReuseService,
    QuizInternalService,
    UserSongService,
    YoutubeLinkValidationService,
    UserQuizRegistrationService,
  ],
  exports: [QuizSongReuseService],
})
export class QuizModule {}
