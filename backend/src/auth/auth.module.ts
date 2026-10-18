import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { NotificationsModule } from '../notifications/notifications.module';
import { BadgesModule } from '../badges/badges.module';
import { jwtSecret } from '../common/utils/secret';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
    NotificationsModule,
    BadgesModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, EmailVerificationService, JwtStrategy],
  exports: [AuthService, EmailVerificationService],
})
export class AuthModule {}
