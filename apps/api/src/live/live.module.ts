import { Module } from '@nestjs/common'
import { LiveGateway } from './live.gateway'
import { PrismaModule } from '../prisma/prisma.module'
import { TeamsModule } from '../teams/teams.module'

@Module({
  imports: [PrismaModule, TeamsModule],
  providers: [LiveGateway],
  exports: [LiveGateway],
})
export class LiveModule {}
