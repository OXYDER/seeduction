import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MemberActivityInterceptor } from './member-activity.interceptor';
import { MemberActivityService } from './member-activity.service';

@Global()
@Module({
  providers: [MemberActivityService, { provide: APP_INTERCEPTOR, useClass: MemberActivityInterceptor }],
  exports: [MemberActivityService],
})
export class MemberActivityModule {}
