import { Module } from '@nestjs/common'
import { ClubsController } from './clubs.controller'
import { JoinRequestsController } from './join-requests.controller'
import { MeJoinRequestsController } from './me-join-requests.controller'
import { ClubsSearchController } from './clubs-search.controller'
import { ClubsService } from './clubs.service'
import { JoinRequestsService } from './join-requests.service'
import { ClubsSearchService } from './clubs-search.service'
import { PushModule } from '../push/push.module'
import { AuditModule } from '../audit/audit.module'
import { AssetsModule } from '../assets/assets.module'
import { BillingModule } from '../billing/billing.module'

@Module({
  imports: [PushModule, AuditModule, AssetsModule, BillingModule],
  controllers: [
    // Literal /search and /lookup must precede ClubsController's /:clubId.
    ClubsSearchController,
    JoinRequestsController,
    MeJoinRequestsController,
    ClubsController,
  ],
  providers: [ClubsService, JoinRequestsService, ClubsSearchService],
  exports: [ClubsService, JoinRequestsService],
})
export class ClubsModule {}
