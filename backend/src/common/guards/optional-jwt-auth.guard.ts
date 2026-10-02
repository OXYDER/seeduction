import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Comme JwtAuthGuard, mais n'échoue jamais : req.user reste undefined si aucun token valide (ou si un profil n'est pas encore choisi). */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    return user && user.scope !== 'account' ? user : undefined;
  }
}
