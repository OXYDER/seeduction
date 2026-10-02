import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ALLOW_ACCOUNT_SCOPE } from '../decorators/allow-account-scope.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  handleRequest(err: any, user: any, _info: any, context: ExecutionContext) {
    if (err || !user) throw err || new UnauthorizedException();
    // Jeton « de compte » (avant le choix du profil) : refusé partout sauf sur les routes de sélection de profil.
    if (user.scope === 'account' && !this.reflector.get<boolean>(ALLOW_ACCOUNT_SCOPE, context.getHandler())) {
      throw new UnauthorizedException('Choisis un profil pour continuer');
    }
    return user;
  }
}
