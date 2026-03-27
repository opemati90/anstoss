import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { TeamsModule } from '../teams/teams.module'
import { AssetsModule } from '../assets/assets.module'

@Module({
  imports: [TeamsModule, AssetsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
