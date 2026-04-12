import { Module } from '@nestjs/common'
import { EventsController } from './events.controller'
import { EventsService } from './events.service'
import { EventReminderWorker } from './event-reminder.worker'
import { TeamsModule } from '../teams/teams.module'
import { PushModule } from '../push/push.module'

@Module({
  imports: [TeamsModule, PushModule],
  controllers: [EventsController],
  providers: [EventsService, EventReminderWorker],
  exports: [EventsService],
})
export class EventsModule {}
