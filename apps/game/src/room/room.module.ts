import { Module } from '@nestjs/common';
import { ChatHistoryRepository } from './chat-history.repository';
import { AuthClient } from './clients/auth.client';
import { QuizClient } from './clients/quiz.client';
import { InternalRoomController } from './internal-room.controller';
import { RoomAbuseGuardRepository } from './room-abuse-guard.repository';
import { RoomController } from './room.controller';
import { RoomFencedStateStore } from './room-fenced-state.store';
import { RoomGateway } from './room.gateway';
import { RoomIndexReconciler } from './room-index-reconciler.service';
import { RoomIndexRepository } from './room-index.repository';
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
    RoomFencedStateStore,
    RoomIndexRepository,
    RoomIndexReconciler,
    ChatHistoryRepository,
    RoomAbuseGuardRepository,
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
