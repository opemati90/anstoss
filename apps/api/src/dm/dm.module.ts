import { Module } from '@nestjs/common'
import { DmController } from './dm.controller'
import { DmService } from './dm.service'
import { PrismaModule } from '../prisma/prisma.module'
import { TranslationModule } from '../translation/translation.module'

@Module({
  imports: [PrismaModule, TranslationModule],
  controllers: [DmController],
  providers: [DmService],
  exports: [DmService],
})
export class DmModule {}
