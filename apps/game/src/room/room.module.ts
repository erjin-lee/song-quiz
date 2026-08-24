import { Module } from '@nestjs/common';
import { AuthClient } from './clients/auth.client';
import { QuizClient } from './clients/quiz.client';
import { InternalRoomController } from './internal-room.controller';
import { RoomController } from './room.controller';
import { RoomGateway } from './room.gateway';
import { RoomLockService } from './room-lock.service';
import { RoomRoundService } from './room-round.service';
import { RoomTimerService } from './room-timer.service';
import { RoomRepository } from './room.repository';
import { RoomService } from './room.service';

@Module({
  controllers: [RoomController, InternalRoomController],
  providers: [
    RoomService,
    RoomRepository,
    RoomRoundService,
    RoomGateway,
    RoomLockService,
    RoomTimerService,
    QuizClient,
    AuthClient,
  ],
  exports: [RoomGateway],
})
export class RoomModule {}
