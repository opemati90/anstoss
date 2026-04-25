import { Module } from '@nestjs/common'
import { ClubsController } from './clubs.controller'
import { JoinRequestsController } from './join-requests.controller'
import { ClubsSearchController } from './clubs-search.controller'
import { ClubsService } from './clubs.service'
import { JoinRequestsService } from './join-requests.service'
import { ClubsSearchService } from './clubs-search.service'
import { PushModule } from '../push/push.module'
import { AuditModule } from '../audit/audit.module'

@Module({
  imports: [PushModule, AuditModule],
  controllers: [ClubsController, JoinRequestsController, ClubsSearchController],
  providers: [ClubsService, JoinRequestsService, ClubsSearchService],
  exports: [ClubsService],
})
export class ClubsModule {}
