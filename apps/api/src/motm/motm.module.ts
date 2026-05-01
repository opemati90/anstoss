import { Module } from '@nestjs/common'
import { MotmController } from './motm.controller'
import { MotmService } from './motm.service'
import { PrismaModule } from '../prisma/prisma.module'
import { TeamsModule } from '../teams/teams.module'

@Module({
  imports: [PrismaModule, TeamsModule],
  controllers: [MotmController],
  providers: [MotmService],
})
export class MotmModule {}
