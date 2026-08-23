import { Module } from '@nestjs/common';
import { AccessLogMiddleware } from './access-log.middleware';

@Module({
  providers: [AccessLogMiddleware],
  exports: [AccessLogMiddleware],
})
export class LoggingModule {}
