/**
 * Membres anonymes : leur pseudo et leur avatar sont remplacés par « Anonyme » dans toutes les réponses du site pour les autres membres (listes de torrents, commentaires, forum, équipes,
 * classements, recherche...). L'équipe et le membre lui-même voient toujours la vérité. Logique pure et testée ; la liste des membres anonymes vient d'AnonymityService.
 */
export const ANONYMOUS_NAME = 'Anonyme';

/** Clés de réponse qui contiennent un pseudo en texte : remplacées quand la valeur est celle d'un membre anonyme. */
const NAME_KEYS = new Set(['username', 'senderUsername', 'authorName', 'authorUsername', 'uploaderName', 'uploaderUsername', 'ownerName', 'ownerUsername', 'createdByName', 'requesterName', 'fillerName', 'usedBy', 'assigneeName', 'partner', 'invitedByUsername', 'memberName', 'captainName', 'leaderName']);
/** Clés qui portent l'identifiant d'un membre à côté de son pseudo. */
const ID_KEYS = ['id', 'userId', 'senderId', 'authorId', 'ownerId', 'uploaderId', 'createdById'];

export interface AnonymityCtx {
  /** Identifiants des membres anonymes (comptes et profils famille). */
  ids: ReadonlySet<string>;
  /** Pseudos des membres anonymes, en minuscules. */
  names: ReadonlySet<string>;
  /** Qui regarde : l'équipe et le membre lui-même (compte et profil) voient les vrais noms. */
  viewerIds: ReadonlySet<string>;
  /** Pseudos du membre qui regarde (comptes et profils), en minuscules. */
  viewerNames: ReadonlySet<string>;
  viewerStaff: boolean;
}

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/**
 * Renvoie la réponse avec les membres anonymes masqués. Les objets ne sont jamais modifiés sur place (une réponse peut venir d'un cache partagé avec l'équipe) : on ne copie que
 * le chemin qui change, le reste est rendu tel quel.
 */
export function maskAnonymous<T>(payload: T, ctx: AnonymityCtx): T {
  if (ctx.viewerStaff || ctx.ids.size === 0) return payload;
  const hidden = (id: unknown) => typeof id === 'string' && ctx.ids.has(id) && !ctx.viewerIds.has(id);

  const walk = (v: unknown, depth: number): unknown => {
    if (depth > 9 || v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) {
      let out: unknown[] | null = null;
      v.forEach((item, i) => { const r = walk(item, depth + 1); if (r !== item) { out ??= v.slice(); out[i] = r; } });
      return out ?? v;
    }
    if (!isPlain(v)) return v; // dates, tampons, flux...
    // Un objet « membre » (identifiant + pseudo) : masqué en entier.
    const memberHidden = typeof v.username === 'string' && ID_KEYS.some((k) => hidden(v[k]));
    let out: Record<string, unknown> | null = null;
    for (const [k, val] of Object.entries(v)) {
      let next: unknown = val;
      if (typeof val === 'string' && NAME_KEYS.has(k) && (memberHidden || (ctx.names.has(val.toLowerCase()) && !ctx.viewerNames.has(val.toLowerCase())))) next = ANONYMOUS_NAME;
      else if ((k === 'avatarUrl' || k === 'avatar') && memberHidden && val) next = null;
      else if (val && typeof val === 'object') next = walk(val, depth + 1);
      if (next !== val) { out ??= { ...v }; out[k] = next; }
    }
    if (memberHidden) { out ??= { ...v }; out.anonymous = true; }
    return out ?? v;
  };
  return walk(payload, 0) as T;
}
