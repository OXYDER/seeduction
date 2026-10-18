import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Historiquement « session facultative » : la route répondait aussi aux visiteurs sans connexion. Le site entier est privé (rien n'est visible aux non-membres) : une session valide est
 * maintenant exigée. Le nom est gardé pour ne pas toucher aux contrôleurs ; `req.user` est toujours défini quand la route répond.
 * Un jeton « de compte » (avant le choix du profil) est refusé comme avant.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    if (err || !user || user.scope === 'account') throw err || new UnauthorizedException();
    return user;
  }
}
