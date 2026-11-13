import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { AuditModule } from '../audit/audit.module'
import { PushModule } from '../push/push.module'
import { ActingController } from './acting.controller'
import { ActingService } from './acting.service'

@Module({
  imports: [PrismaModule, AuditModule, PushModule],
  controllers: [ActingController],
  providers: [ActingService],
})
export class ActingModule {}
