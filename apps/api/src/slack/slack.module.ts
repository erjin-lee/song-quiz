import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from '../admin/admin.module';
import { UserSlack } from '../user/entities/user-slack.entity';
import { SlackController } from './slack.controller';
import { SlackInteractionService } from './slack-interaction.service';
import { SlackSignatureGuard } from './slack-signature.guard';

@Module({
  imports: [TypeOrmModule.forFeature([UserSlack]), AdminModule],
  controllers: [SlackController],
  providers: [SlackInteractionService, SlackSignatureGuard],
})
export class SlackModule {}
