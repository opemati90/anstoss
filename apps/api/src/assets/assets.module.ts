import { Module } from '@nestjs/common'
import { AssetsController } from './assets.controller'
import { AssetsService } from './assets.service'
import { R2Provider } from './r2.provider'
import { AccountMediaDeletionWorker } from './account-media-deletion.worker'

@Module({
  controllers: [AssetsController],
  providers: [AssetsService, R2Provider, AccountMediaDeletionWorker],
  exports: [R2Provider],
})
export class AssetsModule {}
