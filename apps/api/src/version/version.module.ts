import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { VersionMiddleware } from './version.middleware'

@Module({})
export class VersionModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(VersionMiddleware).forRoutes('*')
  }
}
