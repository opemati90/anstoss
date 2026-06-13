import { Module } from '@nestjs/common'
import { OnboardingController } from './onboarding.controller'
import { OnboardingService } from './onboarding.service'
import { PrismaModule } from '../prisma/prisma.module'
import { ChannelsModule } from '../channels/channels.module'

@Module({
  imports: [PrismaModule, ChannelsModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
