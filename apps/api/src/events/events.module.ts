import { Module } from '@nestjs/common'
import { EventsController } from './events.controller'
import { EventsService } from './events.service'
import { EventsGateway } from './events.gateway'
import { EventReminderWorker } from './event-reminder.worker'
import { TeamsModule } from '../teams/teams.module'
import { PushModule } from '../push/push.module'
import { ContributionsModule } from '../contributions/contributions.module'

@Module({
  // ContributionsModule is imported so EventsService can enforce the
  // pay-to-play rule on RSVP — players with overdue dues get a 403
  // when they try to commit YES to the next match.
  imports: [TeamsModule, PushModule, ContributionsModule],
  controllers: [EventsController],
  providers: [EventsService, EventsGateway, EventReminderWorker],
  exports: [EventsService],
})
export class EventsModule {}
