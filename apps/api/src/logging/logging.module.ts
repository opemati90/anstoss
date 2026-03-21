import { Global, Module } from '@nestjs/common'
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core'
import { LoggerService } from './logger.service'
import { RequestLoggingInterceptor } from './request-logging.interceptor'
import { AppExceptionFilter } from './app-exception.filter'

@Global()
@Module({
  providers: [
    LoggerService,
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AppExceptionFilter,
    },
  ],
  exports: [LoggerService],
})
export class LoggingModule {}
