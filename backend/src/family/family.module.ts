import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';
import { FamilyActivityInterceptor } from './family-activity.interceptor';
import { jwtSecret } from '../common/utils/secret';

@Module({
  imports: [JwtModule.register({ secret: jwtSecret(), signOptions: { expiresIn: '7d' } })],
  controllers: [FamilyController],
  providers: [FamilyService, { provide: APP_INTERCEPTOR, useClass: FamilyActivityInterceptor }],
  exports: [FamilyService],
})
export class FamilyModule {}
