import { Module } from '@nestjs/common'
import { ChatGateway } from './chat.gateway'
import { PrismaModule } from '../prisma/prisma.module'
import { PushModule } from '../push/push.module'
import { TeamsModule } from '../teams/teams.module'

@Module({
  imports: [PrismaModule, PushModule, TeamsModule],
  providers: [ChatGateway],
})
export class ChatModule {}
