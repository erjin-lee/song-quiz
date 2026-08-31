import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenAiChatClient } from '../openai/openai-chat.client';
import { QuizAnswer } from '../quiz/entities/quiz-answer.entity';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { YoutubeScraperClient } from '../quiz/youtube-scraper.client';
import { Inquiry } from './entities/inquiry.entity';
import { GameNotifierClient } from './game-notifier.client';
import { InquiryActionService } from './inquiry-action.service';
import { InquiryGptClient } from './inquiry-gpt.client';
import { InquiryController } from './inquiry.controller';
import { InquiryService } from './inquiry.service';
import { SlackNotifierClient } from './slack-notifier.client';

@Module({
  imports: [TypeOrmModule.forFeature([Inquiry, QuizSong, QuizAnswer])],
  controllers: [InquiryController],
  providers: [
    InquiryService,
    InquiryGptClient,
    OpenAiChatClient,
    InquiryActionService,
    YoutubeScraperClient,
    GameNotifierClient,
    SlackNotifierClient,
  ],
  exports: [InquiryService],
})
export class InquiryModule {}
