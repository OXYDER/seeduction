import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeysService } from './api-keys.service';
import { SCOPE_KEY } from './scope.decorator';

/**
 * Authentifie les routes de l'API publique via une clé API (pas un JWT).
 * Clé attendue dans l'en-tête `x-api-key`, `Authorization: Bearer <clé>`,
 * ou en paramètre `?key=` — ce dernier existe pour les lecteurs RSS, qui ne
 * peuvent pas envoyer d'en-têtes personnalisés.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private apiKeysService: ApiKeysService, private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
    const rawKey = req.headers['x-api-key'] ?? bearer ?? req.query?.key;
    if (!rawKey || typeof rawKey !== 'string') throw new UnauthorizedException('Clé API manquante');

    const apiKey = await this.apiKeysService.validate(rawKey);
    if (!apiKey) throw new UnauthorizedException('Clé API invalide ou révoquée');

    const requiredScope = this.reflector.get<string>(SCOPE_KEY, context.getHandler());
    if (requiredScope && !apiKey.scopes.includes(requiredScope)) {
      throw new ForbiddenException(`Cette clé n'a pas la portée "${requiredScope}"`);
    }

    req.apiKey = apiKey;
    return true;
  }
}
