import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MemberActivityService } from './member-activity.service';

type Cat = 'download' | 'upload' | 'view' | 'search' | 'comment' | 'forum' | 'social' | 'message' | 'economy' | 'settings' | 'team' | 'family' | 'security' | 'staff' | 'other';

interface Rule {
  m: string;
  /** Chemin de la route Nest (sans /api). */
  p: string;
  cat: Cat;
  label: string;
  tt?: 'torrent' | 'user' | 'topic' | 'team';
  tid?: (req: any, res: any) => unknown;
  detail?: (req: any, res: any) => unknown;
  when?: (req: any) => boolean;
  /** Ne pas renoter la même chose pendant ce délai (consultations répétées). */
  dedupe?: number;
}

const TEN_MIN = 10 * 60_000;
const param = (name: string) => (r: any) => r.params?.[name];
const body = (name: string) => (r: any) => r.body?.[name];

/**
 * Tout ce qu'un membre fait sur le site, noté dans son journal (visible par le staff uniquement).
 * Règle de confidentialité : jamais le contenu des messages privés, des mots de passe ni des jetons ; les commentaires,
 * sujets du forum et recherches (publics) sont notés tels quels.
 */
const RULES: Rule[] = [
  // Torrents
  { m: 'GET', p: '/torrents/:id/download', cat: 'download', label: 'Télécharge un .torrent', tt: 'torrent', tid: param('id') },
  { m: 'POST', p: '/stream/session', cat: 'view', label: 'Lance la lecture en streaming', tt: 'torrent', tid: body('torrentId') },
  { m: 'POST', p: '/torrents/upload', cat: 'upload', label: 'Envoie un torrent', tt: 'torrent', tid: (_r, res) => res?.id, detail: (_r, res) => res?.name },
  { m: 'POST', p: '/covers/upload', cat: 'upload', label: 'Envoie une jaquette' },
  { m: 'POST', p: '/templates', cat: 'upload', label: 'Crée un modèle de description' },
  { m: 'PATCH', p: '/templates/:id', cat: 'upload', label: 'Modifie un modèle de description' },
  { m: 'DELETE', p: '/templates/:id', cat: 'upload', label: 'Supprime un modèle de description' },
  { m: 'POST', p: '/templates/generate', cat: 'upload', label: 'Génère une description' },
  { m: 'GET', p: '/torrents/:id', cat: 'view', label: 'Consulte un torrent', tt: 'torrent', tid: param('id'), dedupe: TEN_MIN },
  { m: 'GET', p: '/torrents', cat: 'search', label: 'Cherche un torrent', detail: (r) => r.query?.search, when: (r) => !!String(r.query?.search ?? '').trim(), dedupe: 60_000 },
  { m: 'GET', p: '/forum/search', cat: 'search', label: 'Cherche dans le forum', detail: (r) => r.query?.q, when: (r) => !!String(r.query?.q ?? '').trim(), dedupe: 60_000 },
  { m: 'GET', p: '/users/:id', cat: 'view', label: 'Consulte un profil', tt: 'user', tid: param('id'), dedupe: TEN_MIN, when: (r) => r.params?.id !== r.user?.userId && r.params?.id !== r.user?.accountId },
  // Commentaires et forum
  { m: 'POST', p: '/comments/torrent/:torrentId', cat: 'comment', label: 'Commente un torrent', tt: 'torrent', tid: param('torrentId'), detail: body('content') },
  { m: 'PATCH', p: '/comments/:id', cat: 'comment', label: 'Modifie un commentaire', detail: body('content') },
  { m: 'DELETE', p: '/comments/:id', cat: 'comment', label: 'Supprime un commentaire' },
  { m: 'GET', p: '/forum/topics/:id', cat: 'view', label: 'Lit un sujet du forum', tt: 'topic', tid: param('id'), dedupe: TEN_MIN },
  { m: 'POST', p: '/forum/categories/:id/topics', cat: 'forum', label: 'Crée un sujet dans le forum', detail: body('title') },
  { m: 'POST', p: '/forum/topics/:id/reply', cat: 'forum', label: 'Répond dans le forum', tt: 'topic', tid: param('id'), detail: body('content') },
  { m: 'PATCH', p: '/forum/posts/:id', cat: 'forum', label: 'Modifie un message du forum', detail: body('content') },
  { m: 'DELETE', p: '/forum/posts/:id', cat: 'forum', label: 'Supprime un message du forum' },
  { m: 'POST', p: '/forum/topics/:id/moderate', cat: 'staff', label: 'Modère un sujet du forum', tt: 'topic', tid: param('id'), detail: body('action') },
  { m: 'DELETE', p: '/forum/topics/:id', cat: 'staff', label: 'Supprime un sujet du forum', tt: 'topic', tid: param('id') },
  // Social
  { m: 'PUT', p: '/favorites/:torrentId', cat: 'social', label: 'Ajoute aux favoris', tt: 'torrent', tid: param('torrentId') },
  { m: 'DELETE', p: '/favorites/:torrentId', cat: 'social', label: 'Retire des favoris', tt: 'torrent', tid: param('torrentId') },
  { m: 'POST', p: '/collections', cat: 'social', label: 'Crée une collection', detail: body('name') },
  { m: 'PATCH', p: '/collections/:id', cat: 'social', label: 'Modifie une collection', detail: body('name') },
  { m: 'DELETE', p: '/collections/:id', cat: 'social', label: 'Supprime une collection' },
  { m: 'POST', p: '/collections/:id/items', cat: 'social', label: 'Ajoute un torrent à une collection', tt: 'torrent', tid: body('torrentId') },
  { m: 'DELETE', p: '/collections/:id/items/:torrentId', cat: 'social', label: "Retire un torrent d'une collection", tt: 'torrent', tid: param('torrentId') },
  { m: 'POST', p: '/collections/:id/collaborators', cat: 'social', label: 'Ajoute un collaborateur à une collection', detail: body('username') },
  { m: 'DELETE', p: '/collections/:id/collaborators/:userId', cat: 'social', label: "Retire un collaborateur d'une collection", tt: 'user', tid: param('userId') },
  { m: 'PUT', p: '/social/likes/:torrentId', cat: 'social', label: 'Aime un torrent', tt: 'torrent', tid: param('torrentId') },
  { m: 'DELETE', p: '/social/likes/:torrentId', cat: 'social', label: "Retire son « j'aime »", tt: 'torrent', tid: param('torrentId') },
  { m: 'PUT', p: '/social/ratings/:torrentId', cat: 'social', label: 'Note un torrent', tt: 'torrent', tid: param('torrentId'), detail: (r) => ((r.body?.value ?? r.body?.rating) != null ? `${r.body?.value ?? r.body?.rating}` : null) },
  { m: 'DELETE', p: '/social/ratings/:torrentId', cat: 'social', label: 'Retire sa note', tt: 'torrent', tid: param('torrentId') },
  { m: 'PUT', p: '/social/follows/:entityId', cat: 'social', label: 'Suit un acteur, producteur ou genre' },
  { m: 'DELETE', p: '/social/follows/:entityId', cat: 'social', label: 'Ne suit plus un acteur, producteur ou genre' },
  { m: 'POST', p: '/social/reseed/:torrentId', cat: 'social', label: 'Demande un reseed', tt: 'torrent', tid: param('torrentId') },
  { m: 'POST', p: '/friends/request', cat: 'social', label: "Envoie une demande d'ami", detail: body('username') },
  { m: 'POST', p: '/friends/:id/accept', cat: 'social', label: "Accepte une demande d'ami" },
  { m: 'DELETE', p: '/friends/:id', cat: 'social', label: 'Retire un ami ou refuse une demande' },
  { m: 'POST', p: '/reports', cat: 'social', label: 'Signale un contenu', detail: (r) => [r.body?.targetType, r.body?.reason].filter(Boolean).join(' : ') },
  { m: 'POST', p: '/requests', cat: 'social', label: 'Crée une demande', detail: body('title') },
  { m: 'POST', p: '/requests/:id/fill', cat: 'social', label: 'Répond à une demande', tt: 'torrent', tid: body('torrentId') },
  { m: 'DELETE', p: '/requests/:id', cat: 'social', label: 'Supprime une demande' },
  { m: 'POST', p: '/requests/:id/bounty', cat: 'economy', label: 'Ajoute une récompense à une demande', detail: (r) => (r.body?.amount != null ? `${r.body.amount}` : null) },
  { m: 'POST', p: '/auth/invite', cat: 'social', label: 'Génère une invitation' },
  // Messagerie (jamais le contenu)
  { m: 'POST', p: '/messenger/conversations/:id/messages', cat: 'message', label: 'Envoie un message' },
  { m: 'POST', p: '/messenger/upload', cat: 'message', label: 'Envoie un fichier dans une conversation' },
  { m: 'POST', p: '/messenger/direct', cat: 'message', label: 'Ouvre une conversation privée' },
  { m: 'POST', p: '/messenger/groups', cat: 'message', label: 'Crée un groupe de discussion', detail: body('name') },
  { m: 'PATCH', p: '/messenger/messages/:id', cat: 'message', label: 'Modifie un message' },
  { m: 'DELETE', p: '/messenger/messages/:id', cat: 'message', label: 'Supprime un message' },
  { m: 'POST', p: '/messenger/messages/:id/reactions', cat: 'message', label: 'Réagit à un message' },
  { m: 'POST', p: '/messenger/conversations/:id/members', cat: 'message', label: 'Ajoute des membres à une conversation' },
  { m: 'DELETE', p: '/messenger/conversations/:id/members/:userId', cat: 'message', label: "Retire un membre d'une conversation", tt: 'user', tid: param('userId') },
  { m: 'POST', p: '/messages/send', cat: 'message', label: 'Envoie un message privé' },
  { m: 'POST', p: '/messages/thread/:threadId/reply', cat: 'message', label: 'Répond à un message privé' },
  { m: 'POST', p: '/dm/thread/:friendId', cat: 'message', label: 'Ouvre un message direct', tt: 'user', tid: param('friendId') },
  { m: 'POST', p: '/chat/files/upload', cat: 'message', label: 'Envoie un fichier dans le chat' },
  { m: 'POST', p: '/chat/images/upload', cat: 'message', label: 'Envoie une image dans le chat' },
  { m: 'DELETE', p: '/chat/messages/:id', cat: 'message', label: 'Supprime un message du chat' },
  // Économie
  { m: 'POST', p: '/bonus/redeem', cat: 'economy', label: 'Dépense ses points bonus', detail: (r) => r.body?.item ?? r.body?.itemId ?? r.body?.type },
  { m: 'POST', p: '/bonus/token/:torrentId', cat: 'economy', label: 'Utilise un jeton freeleech', tt: 'torrent', tid: param('torrentId') },
  // Réglages
  { m: 'PATCH', p: '/users/me/profile', cat: 'settings', label: 'Modifie son profil' },
  { m: 'PATCH', p: '/users/me/dm-privacy', cat: 'settings', label: 'Modifie la confidentialité des messages' },
  { m: 'PATCH', p: '/users/me/default-view', cat: 'settings', label: 'Change son affichage par défaut' },
  { m: 'PATCH', p: '/users/me/watching-visibility', cat: 'settings', label: "Change la visibilité de ce qu'il regarde" },
  { m: 'PATCH', p: '/users/me/adult', cat: 'settings', label: "Change l'option contenu adulte" },
  // Sécurité
  { m: 'POST', p: '/auth/change-password', cat: 'security', label: 'Change son mot de passe' },
  { m: 'POST', p: '/auth/2fa/setup', cat: 'security', label: "Commence l'activation de la double authentification" },
  { m: 'POST', p: '/auth/2fa/confirm', cat: 'security', label: 'Active la double authentification' },
  { m: 'POST', p: '/auth/2fa/disable', cat: 'security', label: 'Désactive la double authentification' },
  { m: 'POST', p: '/keys', cat: 'security', label: "Crée une clé d'API", detail: body('name') },
  { m: 'DELETE', p: '/keys/:id', cat: 'security', label: "Supprime une clé d'API" },
  // Teams
  { m: 'POST', p: '/teams', cat: 'team', label: 'Crée une team', detail: body('name') },
  { m: 'PATCH', p: '/teams/:id', cat: 'team', label: 'Modifie une team', tt: 'team', tid: param('id') },
  { m: 'DELETE', p: '/teams/:id', cat: 'team', label: 'Supprime une team', tt: 'team', tid: param('id') },
  { m: 'POST', p: '/teams/:id/apply', cat: 'team', label: 'Candidate à une team', tt: 'team', tid: param('id') },
  { m: 'DELETE', p: '/teams/:id/apply', cat: 'team', label: 'Retire sa candidature à une team', tt: 'team', tid: param('id') },
  { m: 'POST', p: '/teams/:id/leave', cat: 'team', label: 'Quitte une team', tt: 'team', tid: param('id') },
  { m: 'POST', p: '/teams/applications/:appId/accept', cat: 'team', label: 'Accepte une candidature de team' },
  { m: 'POST', p: '/teams/applications/:appId/decline', cat: 'team', label: 'Refuse une candidature de team' },
  { m: 'PATCH', p: '/teams/:id/members/:userId', cat: 'team', label: "Change le rôle d'un membre de team", tt: 'user', tid: param('userId') },
  { m: 'DELETE', p: '/teams/:id/members/:userId', cat: 'team', label: "Retire un membre d'une team", tt: 'user', tid: param('userId') },
  // Staff (administration et modération)
  { m: 'POST', p: '/admin/torrents/approve-many', cat: 'staff', label: 'Approuve plusieurs torrents' },
  { m: 'POST', p: '/admin/torrents/:id/approve', cat: 'staff', label: 'Approuve un torrent', tt: 'torrent', tid: param('id') },
  { m: 'POST', p: '/admin/torrents/:id/reject', cat: 'staff', label: 'Rejette un torrent', tt: 'torrent', tid: param('id'), detail: body('reason') },
  { m: 'PATCH', p: '/admin/torrents/:id', cat: 'staff', label: 'Modifie un torrent', tt: 'torrent', tid: param('id') },
  { m: 'DELETE', p: '/admin/torrents/:id', cat: 'staff', label: 'Supprime un torrent', tt: 'torrent', tid: param('id') },
  { m: 'PATCH', p: '/admin/users/:id', cat: 'staff', label: 'Modifie un membre', tt: 'user', tid: param('id') },
  { m: 'POST', p: '/admin/users/:id/warn', cat: 'staff', label: 'Avertit un membre', tt: 'user', tid: param('id'), detail: body('reason') },
  { m: 'POST', p: '/admin/users/:id/ban', cat: 'staff', label: 'Bannit un membre', tt: 'user', tid: param('id'), detail: body('reason') },
  { m: 'POST', p: '/admin/users/:id/unban', cat: 'staff', label: 'Débannit un membre', tt: 'user', tid: param('id') },
  { m: 'POST', p: '/admin/users/:id/reset-link', cat: 'staff', label: 'Génère un lien de réinitialisation de mot de passe', tt: 'user', tid: param('id') },
  { m: 'POST', p: '/admin/users/:id/clear-hnr', cat: 'staff', label: 'Efface des H&R', tt: 'user', tid: param('id') },
  { m: 'DELETE', p: '/admin/users/:id/warnings/:wid', cat: 'staff', label: "Retire un avertissement d'un membre", tt: 'user', tid: param('id') },
  { m: 'POST', p: '/admin/users/:id/passkey', cat: 'staff', label: "Régénère la passkey d'un membre", tt: 'user', tid: param('id') },
  { m: 'POST', p: '/admin/reports/:id/resolve', cat: 'staff', label: 'Traite un signalement' },
  { m: 'POST', p: '/admin/invites', cat: 'staff', label: "Crée des codes d'invitation" },
  { m: 'PATCH', p: '/admin/invites/:id', cat: 'staff', label: "Modifie un code d'invitation" },
  { m: 'DELETE', p: '/admin/invites/:id', cat: 'staff', label: "Supprime un code d'invitation" },
  { m: 'PATCH', p: '/admin/config', cat: 'staff', label: 'Modifie les paramètres du tracker' },
  { m: 'POST', p: '/admin/config/reset', cat: 'staff', label: 'Rétablit les paramètres par défaut' },
  { m: 'POST', p: '/admin/config/apply-min-ratio', cat: 'staff', label: 'Applique le ratio minimum à tous les membres' },
  { m: 'POST', p: '/wiki/articles', cat: 'staff', label: 'Crée un article du wiki', detail: body('title') },
  { m: 'PATCH', p: '/wiki/articles/:id', cat: 'staff', label: 'Modifie un article du wiki', detail: body('title') },
  { m: 'DELETE', p: '/wiki/articles/:id', cat: 'staff', label: 'Supprime un article du wiki' },
  { m: 'POST', p: '/wiki/categories', cat: 'staff', label: 'Crée une catégorie du wiki', detail: body('name') },
  { m: 'PATCH', p: '/wiki/categories/:id', cat: 'staff', label: 'Modifie une catégorie du wiki' },
  { m: 'DELETE', p: '/wiki/categories/:id', cat: 'staff', label: 'Supprime une catégorie du wiki' },
  // Compte famille
  { m: 'POST', p: '/family/exit', cat: 'family', label: 'Quitte son profil' },
  { m: 'POST', p: '/family/enable', cat: 'family', label: 'Active le compte famille' },
  { m: 'POST', p: '/family/master-pin', cat: 'family', label: 'Change le PIN du profil principal' },
  { m: 'POST', p: '/family/profiles', cat: 'family', label: 'Crée un profil', detail: body('name') },
  { m: 'PATCH', p: '/family/profiles/:id', cat: 'family', label: 'Modifie un profil' },
  { m: 'POST', p: '/family/profiles/:id/pin', cat: 'family', label: "Change le PIN d'un profil" },
  { m: 'POST', p: '/family/profiles/:id/block', cat: 'family', label: 'Bloque ou débloque un profil' },
];

/** Requêtes sans intérêt (battements de cœur, accusés de lecture) : jamais notées. */
const SKIP = new Set([
  '/stream/watching', '/stream/watching/stop', '/users/me/presence', '/notifications/:id/read', '/notifications/read-all',
  '/forum/mark-read', '/messenger/conversations/:id/read', '/messages/:id/read', '/family/select',
]);

const STAFF_PREFIXES = ['/admin', '/wiki', '/categories', '/announcements', '/roadmap', '/bonus/events', '/bonus/freeleech', '/messenger/admin'];

@Injectable()
export class MemberActivityInterceptor implements NestInterceptor {
  constructor(private activity: MemberActivityService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest();
    return next.handle().pipe(
      tap((res) => {
        try {
          const user = req.user;
          if (!user?.userId || user.scope === 'account') return;
          const path = String(req.route?.path ?? '').replace(/^\/api/, '');
          if (!path || SKIP.has(path)) return;
          const rule = RULES.find((r) => r.m === req.method && r.p === path && (!r.when || r.when(req)));
          let cat: Cat;
          let label: string;
          let tt: string | null = null;
          let tid: string | null = null;
          let detail: unknown = null;
          let dedupe = 0;
          if (rule) {
            cat = rule.cat;
            label = rule.label;
            dedupe = rule.dedupe ?? 0;
            const t = rule.tid?.(req, res);
            tid = typeof t === 'string' && t ? t : null;
            if (rule.tt) {
              if (!tid) return;
              tt = rule.tt;
            }
            detail = rule.detail?.(req, res);
          } else {
            // Les lectures non listées ne sont pas notées ; toute autre action l'est (administration comprise).
            if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
            cat = STAFF_PREFIXES.some((p) => path.startsWith(p)) ? 'staff' : 'other';
            label = `${req.method} ${path}`;
            // Une action d'administration vise souvent un membre : on le retient.
            if (req.params?.id && path.startsWith('/admin/users/')) {
              tt = 'user';
              tid = String(req.params.id);
            }
          }
          const ip = (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? null;
          void this.activity.record({
            accountId: user.accountId ?? user.userId, userId: user.userId, category: cat, action: label, targetType: tt, targetId: tid,
            detail: detail == null || detail === '' ? null : String(detail), ip, dedupeMs: dedupe,
          });
        } catch { /* le journal ne doit jamais casser une requête */ }
      }),
    );
  }
}
