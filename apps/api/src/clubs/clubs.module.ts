import { Module } from '@nestjs/common'
import { ClubsController } from './clubs.controller'
import { JoinRequestsController } from './join-requests.controller'
import { ClubsService } from './clubs.service'
import { JoinRequestsService } from './join-requests.service'

@Module({
  controllers: [ClubsController, JoinRequestsController],
  providers: [ClubsService, JoinRequestsService],
  exports: [ClubsService],
})
export class ClubsModule {}
