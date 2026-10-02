import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma.service';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';
import { FamilyActivityInterceptor } from './family-activity.interceptor';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET ?? 'change-me-in-.env', signOptions: { expiresIn: '7d' } })],
  controllers: [FamilyController],
  providers: [FamilyService, PrismaService, { provide: APP_INTERCEPTOR, useClass: FamilyActivityInterceptor }],
  exports: [FamilyService],
})
export class FamilyModule {}
