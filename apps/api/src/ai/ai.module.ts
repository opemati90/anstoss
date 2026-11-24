import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { AiBudgetService } from './ai-budget.service'
import { AiTextService } from './ai-text.service'

@Module({
  imports: [PrismaModule],
  providers: [AiBudgetService, AiTextService],
  exports: [AiTextService],
})
export class AiModule {}
