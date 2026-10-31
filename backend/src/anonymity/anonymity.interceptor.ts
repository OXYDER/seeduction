import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { AnonymityService } from './anonymity.service';
import { maskAnonymous } from '../common/utils/anonymity';

/** Masque les membres anonymes dans toutes les réponses JSON destinées à un autre membre (voir maskAnonymous). Ne fait rien tant qu'aucun membre n'est anonyme. */
@Injectable()
export class AnonymityInterceptor implements NestInterceptor {
  constructor(private anonymity: AnonymityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http' || this.anonymity.size === 0) return next.handle();
    const req = context.switchToHttp().getRequest();
    const ctx = this.anonymity.contextFor(req.user ? { userId: req.user.userId, role: req.user.role, accountId: req.user.accountId ?? req.user.parentId, username: req.user.username } : null);
    return next.handle().pipe(map((body) => (body && typeof body === 'object' ? maskAnonymous(body, ctx) : body)));
  }
}
