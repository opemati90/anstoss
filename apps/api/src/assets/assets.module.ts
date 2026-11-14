import { Module } from '@nestjs/common'
import { AssetsController } from './assets.controller'
import { AssetsService } from './assets.service'
import { R2Provider } from './r2.provider'
import { MediaDeletionService } from './media-deletion.service'

@Module({
  controllers: [AssetsController],
  providers: [AssetsService, R2Provider, MediaDeletionService],
  exports: [R2Provider, MediaDeletionService],
})
export class AssetsModule {}
