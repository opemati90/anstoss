import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { TranslationService } from './translation.service'
import { AiModule } from '../ai/ai.module'
import { TranslationController } from './translation.controller'

@Module({
  imports: [PrismaModule, AiModule],
  providers: [TranslationService],
  controllers: [TranslationController],
  exports: [TranslationService],
})
export class TranslationModule {}
