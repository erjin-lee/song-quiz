import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuizAnswer } from '../quiz/entities/quiz-answer.entity';
import { QuizArtist } from '../quiz/entities/quiz-artist.entity';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { Quiz } from '../quiz/entities/quiz.entity';
import { RoomController } from './room.controller';
import { RoomGateway } from './room.gateway';
import { RoomService } from './room.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Quiz, QuizArtist, QuizSong, QuizAnswer]),
    JwtModule.register({}),
  ],
  controllers: [RoomController],
  providers: [RoomService, RoomGateway],
  exports: [RoomGateway],
})
export class RoomModule {}
