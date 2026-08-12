import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuizAnswer } from '../quiz/entities/quiz-answer.entity';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { YoutubeScraperClient } from '../quiz/youtube-scraper.client';
import { RoomModule } from '../room/room.module';
import { Inquiry } from './entities/inquiry.entity';
import { InquiryActionService } from './inquiry-action.service';
import { InquiryGptClient } from './inquiry-gpt.client';
import { InquiryController } from './inquiry.controller';
import { InquiryService } from './inquiry.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Inquiry, QuizSong, QuizAnswer]),
    RoomModule,
  ],
  controllers: [InquiryController],
  providers: [
    InquiryService,
    InquiryGptClient,
    InquiryActionService,
    YoutubeScraperClient,
  ],
})
export class InquiryModule {}
