import { ForbiddenException } from '@nestjs/common';

/**
 * Compte famille : `req.user.userId` est le PROFIL actif (messagerie, favoris, historique...) et `req.user.accountId` le
 * compte (ratio, points, passkey, sécurité). Pour un compte ordinaire sans profils, les deux sont identiques.
 */
export const accountOf = (req: any): string => req.user.accountId ?? req.user.userId;

/** Réservé au profil principal (le compte lui-même) : sécurité, dépenses de points, invitations, clés API. */
export function assertMaster(req: any) {
  if (req.user?.isMaster === false) throw new ForbiddenException('Réservé au profil principal du compte');
}

/** Les profils enfants ne peuvent ni envoyer de torrent ni dépenser de points. */
export function assertNotChild(req: any, what = 'Cette action') {
  if (req.user?.profileType === 'CHILD') throw new ForbiddenException(`${what} n'est pas disponible pour un profil enfant`);
}
