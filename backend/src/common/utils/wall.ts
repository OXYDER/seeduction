/** Le Mur : règles pures (qui voit une publication, liens, réactions), testées à part. */
export const WALL_REACTIONS = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F525}'] as const;
export const WALL_PROFILE_VISIBILITY = ['ME', 'FRIENDS', 'MEMBERS'] as const;
export const WALL_TEAM_VISIBILITY = ['TEAM', 'MEMBERS'] as const;
export const WALL_POSTS_PER_DAY = 30;
export const WALL_COMMENTS_PER_DAY = 100;

/** Un lien http(s) propre (sans identifiants ni espaces), ou null. Aucun aperçu n'est jamais chargé par le serveur : le lien est seulement affiché. */
export function cleanWallLink(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s || s.length > 500 || /\s/.test(s)) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Une image envoyée sur Seeduction (jamais l'adresse d'un autre site : elle révélerait l'IP des lecteurs). */
export function cleanWallImage(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  return /^\/api\/covers\/[\w.-]+$/.test(s) && s.length <= 300 ? s : null;
}

export interface WallViewerCtx {
  isAuthor: boolean;
  isFriend: boolean;
  isTeamMember: boolean;
  isStaff: boolean;
}

/** Qui peut lire une publication : l'auteur et l'équipe du site voient tout ; les autres selon la visibilité choisie. */
export function canSeeWallPost(p: { visibility: string; teamId: string | null }, v: WallViewerCtx): boolean {
  if (v.isAuthor || v.isStaff) return true;
  if (p.visibility === 'MEMBERS') return true;
  if (p.teamId) return p.visibility === 'TEAM' && v.isTeamMember;
  if (p.visibility === 'FRIENDS') return v.isFriend;
  return false;
}

export const isWallReaction = (t: unknown): t is (typeof WALL_REACTIONS)[number] => (WALL_REACTIONS as readonly string[]).includes(String(t));
