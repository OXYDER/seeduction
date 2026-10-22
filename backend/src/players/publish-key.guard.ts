import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PlayersService } from './players.service';

/**
 * Session d'administration habituelle, OU clé de publication (en-tête X-Publish-Key) pour le script qui compile et publie les lecteurs sans mot de passe.
 * La clé ne donne accès qu'aux routes protégées par cette garde (la publication des installateurs) ; elle est révocable depuis Admin > Lecteurs.
 */
@Injectable()
export class PublishKeyJwtAuthGuard extends JwtAuthGuard {
  constructor(reflector: Reflector, private players: PlayersService) { super(reflector); }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const key = req.headers['x-publish-key'];
    if (typeof key === 'string' && key) {
      if (!(await this.players.verifyKey(key))) throw new UnauthorizedException('Clé de publication invalide.');
      req.user = { userId: null, username: 'script de publication', role: 'ADMIN', twoFactor: true, viaPublishKey: true };
      return true;
    }
    return (await super.canActivate(context)) as boolean;
  }
}
