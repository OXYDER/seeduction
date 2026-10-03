import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from '../common/prisma.service';
import { MemberActivityInterceptor } from './member-activity.interceptor';
import { MemberActivityService } from './member-activity.service';

@Global()
@Module({
  providers: [MemberActivityService, PrismaService, { provide: APP_INTERCEPTOR, useClass: MemberActivityInterceptor }],
  exports: [MemberActivityService],
})
export class MemberActivityModule {}
