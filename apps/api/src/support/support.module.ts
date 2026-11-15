import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { SupportService } from './support.service'
import { SupportController, SupportAdminController } from './support.controller'

@Module({
  imports: [PrismaModule],
  controllers: [SupportController, SupportAdminController],
  providers: [SupportService],
})
export class SupportModule {}
