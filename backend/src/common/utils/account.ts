import { ForbiddenException } from '@nestjs/common';
import { PERM_LABELS, type PermKey } from './family-perms';

/**
 * Compte famille : `req.user.userId` est le PROFIL actif (messagerie, favoris, historique...) et `req.user.accountId` le
 * compte (ratio, points, passkey, sécurité). Pour un compte ordinaire sans profils, les deux sont identiques.
 */
export const accountOf = (req: any): string => req.user.accountId ?? req.user.userId;

/** Réservé au profil principal (le compte lui-même) : sécurité du compte, clés API, gestion de la famille. */
export function assertMaster(req: any) {
  if (req.user?.isMaster === false) throw new ForbiddenException('Réservé au profil principal du compte');
}

/** Ce que le profil principal a autorisé (ou non) à ce profil : contenu adulte, envoi de torrents, dépenses... */
export function assertPerm(req: any, key: PermKey) {
  if (req.user?.isMaster === false && req.user.perms?.[key] === false) {
    throw new ForbiddenException(`Le profil principal n'autorise pas cette action pour ce profil : ${PERM_LABELS[key].toLowerCase()}`);
  }
}
