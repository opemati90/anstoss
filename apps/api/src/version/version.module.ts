import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { VersionMiddleware } from './version.middleware'
import { AdminModule } from '../admin/admin.module'

@Module({ imports: [AdminModule] })
export class VersionModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(VersionMiddleware).forRoutes('*')
  }
}
