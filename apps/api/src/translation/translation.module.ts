import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { TranslationService } from './translation.service'

@Module({
  imports: [PrismaModule],
  providers: [TranslationService],
  exports: [TranslationService],
})
export class TranslationModule {}
