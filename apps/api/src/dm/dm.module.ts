import { Module } from '@nestjs/common'
import { DmController } from './dm.controller'
import { DmService } from './dm.service'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  controllers: [DmController],
  providers: [DmService],
  exports: [DmService],
})
export class DmModule {}
