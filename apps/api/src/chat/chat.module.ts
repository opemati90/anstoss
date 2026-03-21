import { Module } from '@nestjs/common'
import { ChatGateway } from './chat.gateway'
import { PrismaModule } from '../prisma/prisma.module'
import { PushModule } from '../push/push.module'

@Module({
  imports: [PrismaModule, PushModule],
  providers: [ChatGateway],
})
export class ChatModule {}
