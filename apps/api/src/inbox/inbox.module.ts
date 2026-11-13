import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { InboxController } from './inbox.controller'
import { InboxService } from './inbox.service'
import { InboxPruneWorker } from './inbox-prune.worker'

@Module({
  imports: [PrismaModule],
  controllers: [InboxController],
  providers: [InboxService, InboxPruneWorker],
  exports: [InboxService],
})
export class InboxModule {}
