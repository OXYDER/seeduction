import { SetMetadata } from '@nestjs/common';

export const ALLOW_ACCOUNT_SCOPE = 'allowAccountScope';

/**
 * Compte famille : après le mot de passe, le membre reçoit un jeton « de compte » valable quelques minutes, qui ne sert
 * qu'à choisir un profil (et saisir son PIN). Toutes les autres routes le refusent, sauf celles marquées avec ceci.
 */
export const AllowAccountScope = () => SetMetadata(ALLOW_ACCOUNT_SCOPE, true);
