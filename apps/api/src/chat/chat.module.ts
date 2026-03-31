import { Module } from '@nestjs/common'
import { ChatGateway } from './chat.gateway'
import { PrismaModule } from '../prisma/prisma.module'
import { PushModule } from '../push/push.module'
import { TeamsModule } from '../teams/teams.module'
import { DmModule } from '../dm/dm.module'

@Module({
  imports: [PrismaModule, PushModule, TeamsModule, DmModule],
  providers: [ChatGateway],
})
export class ChatModule {}
