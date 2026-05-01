import { Module } from '@nestjs/common'
import { MediaController } from './media.controller'
import { TeamsModule } from '../teams/teams.module'
import { AssetsModule } from '../assets/assets.module'
import { R2Provider } from '../assets/r2.provider'

@Module({
  imports: [TeamsModule, AssetsModule],
  controllers: [MediaController],
  providers: [R2Provider],
})
export class MediaModule {}
