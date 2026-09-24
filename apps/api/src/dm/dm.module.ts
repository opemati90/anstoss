import { Module } from '@nestjs/common'
import { ChatContactsController, DmController } from './dm.controller'
import { DmService } from './dm.service'
import { PrismaModule } from '../prisma/prisma.module'
import { TranslationModule } from '../translation/translation.module'
import { AssetsModule } from '../assets/assets.module'

@Module({
  imports: [PrismaModule, TranslationModule, AssetsModule],
  controllers: [DmController, ChatContactsController],
  providers: [DmService],
  exports: [DmService],
})
export class DmModule {}
