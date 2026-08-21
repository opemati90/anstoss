import { Module } from '@nestjs/common'
import { OnboardingController } from './onboarding.controller'
import { OnboardingService } from './onboarding.service'
import { PrismaModule } from '../prisma/prisma.module'
import { ChannelsModule } from '../channels/channels.module'
import { ClubsModule } from '../clubs/clubs.module'

@Module({
  imports: [PrismaModule, ChannelsModule, ClubsModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
