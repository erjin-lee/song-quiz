import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuizAnswer } from '../quiz/entities/quiz-answer.entity';
import { QuizArtist } from '../quiz/entities/quiz-artist.entity';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { Quiz } from '../quiz/entities/quiz.entity';
import { UserModule } from '../user/user.module';
import { RoomController } from './room.controller';
import { RoomGateway } from './room.gateway';
import { RoomService } from './room.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Quiz, QuizArtist, QuizSong, QuizAnswer]),
    UserModule,
    // 비밀방 비밀번호 대입 공격 방지(POST /rooms/:roomId/join)에 사용한다.
    ThrottlerModule.forRoot([
      { name: 'room-join', ttl: 60_000, limit: 10 },
    ]),
  ],
  controllers: [RoomController],
  providers: [RoomService, RoomGateway],
  exports: [RoomGateway],
})
export class RoomModule {}
