import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { FamilyService } from './family.service';

interface Rule {
  method: string;
  /** Chemin de la route (sans /api). */
  path: string;
  action: string;
  targetType?: 'torrent' | 'user';
  target?: (req: any, res: any) => string | null | undefined;
  detail?: (req: any, res: any) => string | null | undefined;
  when?: (req: any) => boolean;
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Ce qui est noté dans le journal du compte famille (voir FamilyService.activity). */
const RULES: Rule[] = [
  { method: 'GET', path: '/torrents/:id/download', action: 'download', targetType: 'torrent', target: (r) => r.params.id },
  { method: 'POST', path: '/stream/session', action: 'play', targetType: 'torrent', target: (r) => r.body?.torrentId },
  { method: 'POST', path: '/torrents/upload', action: 'upload', targetType: 'torrent', target: (_r, res) => res?.id, detail: (_r, res) => text(res?.name) },
  { method: 'GET', path: '/torrents/:id', action: 'view', targetType: 'torrent', target: (r) => r.params.id },
  { method: 'GET', path: '/torrents', action: 'search', detail: (r) => text(r.query?.search), when: (r) => !!text(r.query?.search) },
  { method: 'POST', path: '/comments/torrent/:torrentId', action: 'comment', targetType: 'torrent', target: (r) => r.params.torrentId, detail: (r) => text(r.body?.content) },
  { method: 'POST', path: '/forum/categories/:id/topics', action: 'forum', detail: (r) => text(r.body?.title) },
  { method: 'POST', path: '/forum/topics/:id/reply', action: 'forum', detail: (r) => text(r.body?.content) },
  { method: 'PUT', path: '/favorites/:torrentId', action: 'favorite', targetType: 'torrent', target: (r) => r.params.torrentId },
  { method: 'POST', path: '/collections', action: 'collection', detail: (r) => text(r.body?.name) },
  { method: 'POST', path: '/collections/:id/items', action: 'collection', targetType: 'torrent', target: (r) => r.body?.torrentId },
  { method: 'PUT', path: '/social/likes/:torrentId', action: 'rate', targetType: 'torrent', target: (r) => r.params.torrentId },
  { method: 'PUT', path: '/social/ratings/:torrentId', action: 'rate', targetType: 'torrent', target: (r) => r.params.torrentId },
  { method: 'POST', path: '/friends/request', action: 'friend', detail: (r) => text(r.body?.username) },
  { method: 'POST', path: '/reports', action: 'report', detail: (r) => [text(r.body?.targetType), text(r.body?.reason)].filter(Boolean).join(' : ') },
  { method: 'POST', path: '/requests', action: 'request', detail: (r) => text(r.body?.title) },
];

/**
 * Compte famille : note, pour chaque profil connecté, ses actions importantes (téléchargements, lectures, commentaires,
 * recherches...) avec le profil qui les a faites. Seules les requêtes réussies sont notées, et jamais le contenu des
 * messages privés (les conversations des profils enfants se lisent directement dans la messagerie).
 */
@Injectable()
export class FamilyActivityInterceptor implements NestInterceptor {
  constructor(private family: FamilyService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest();
    return next.handle().pipe(
      tap((res) => {
        const user = req.user;
        if (!user?.fam || user.scope === 'account') return;
        const path = String(req.route?.path ?? '').replace(/^\/api/, '');
        const rule = RULES.find((r) => r.method === req.method && r.path === path && (!r.when || r.when(req)));
        if (!rule) return;
        const targetId = rule.target?.(req, res) ?? null;
        if (rule.targetType && !targetId) return;
        const ip = (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? null;
        void this.family.record(user.accountId, user.userId, rule.action, rule.targetType ?? null, targetId, rule.detail?.(req, res) ?? null, ip);
      }),
    );
  }
}
