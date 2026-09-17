import { SetMetadata } from '@nestjs/common';

export const SCOPE_KEY = 'apiScope';

/** Portée requise sur la clé API pour accéder à cette route publique (voir ApiKeyGuard). */
export const RequireScope = (scope: string) => SetMetadata(SCOPE_KEY, scope);
