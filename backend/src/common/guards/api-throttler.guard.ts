import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Chemins exclus de la limite générale : le tracker BitTorrent (des milliers d'announces légitimes), les flux audio / vidéo, les images, l'état du site. */
const SKIPPED = ['/tracker/', '/api/stream/', '/api/messenger/files/', '/api/covers/', '/api/system/status', '/api/lockdown/'];

export const skippedByRateLimit = (url: string): boolean => SKIPPED.some((p) => url.startsWith(p));

/**
 * Limite générale par adresse IP (plafond large : c'est un filet contre les abus et les robots, pas une gêne pour un membre normal ; les connexions, inscriptions et
 * réinitialisations ont leurs propres limites, bien plus strictes). L'adresse vient de `trust proxy` (voir main.ts). Ne s'applique qu'aux requêtes HTTP : pas aux messages temps réel.
 */
@Injectable()
export class ApiThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest();
    return req.method === 'OPTIONS' || skippedByRateLimit(String(req.originalUrl ?? req.url ?? ''));
  }
}
