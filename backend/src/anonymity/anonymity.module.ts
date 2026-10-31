import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AnonymityService } from './anonymity.service';
import { AnonymityInterceptor } from './anonymity.interceptor';

@Global()
@Module({
  providers: [AnonymityService, { provide: APP_INTERCEPTOR, useClass: AnonymityInterceptor }],
  exports: [AnonymityService],
})
export class AnonymityModule {}
