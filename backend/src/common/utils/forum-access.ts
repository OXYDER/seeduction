// Accès aux forums : qui peut lire, qui peut écrire. Logique pure (sans base) pour pouvoir la tester ; le service du forum l'applique.

export type AccessType = 'ALL' | 'CLASS' | 'UPLOADERS' | 'DONORS' | 'ADULT' | 'STAFF';
export interface AccessRule { type: AccessType; minClass?: string }
export interface ForumAccess { read?: AccessRule; write?: AccessRule }

/** Ce qu'on sait du visiteur pour décider. `null` = visiteur non connecté. */
export interface AccessCtx { role: string; memberClass: string; donor: boolean; adult: boolean }

export const CLASS_ORDER = ['NOUVEAU', 'MEMBRE', 'POWER_USER', 'ELITE', 'VETERAN'] as const;
export const CLASS_LABELS: Record<string, string> = { NOUVEAU: 'Nouveau', MEMBRE: 'Membre', POWER_USER: 'Power User', ELITE: 'Élite', VETERAN: 'Vétéran' };
const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
const UPLOADERS = ['UPLOADER', ...STAFF];
const TYPES: AccessType[] = ['ALL', 'CLASS', 'UPLOADERS', 'DONORS', 'ADULT', 'STAFF'];

export const isStaffRole = (role?: string | null) => !!role && STAFF.includes(role);

export function normalizeRule(raw: any): AccessRule | undefined {
  if (!raw || typeof raw !== 'object' || !TYPES.includes(raw.type) || raw.type === 'ALL') return undefined;
  if (raw.type === 'CLASS') {
    const minClass = (CLASS_ORDER as readonly string[]).includes(raw.minClass) ? String(raw.minClass) : 'MEMBRE';
    return { type: 'CLASS', minClass };
  }
  return { type: raw.type };
}

/** Nettoie ce qui vient du navigateur : seules les règles reconnues sont gardées ; rien du tout = accès libre (null). */
export function normalizeAccess(raw: any): ForumAccess | null {
  if (!raw || typeof raw !== 'object') return null;
  const read = normalizeRule(raw.read), write = normalizeRule(raw.write);
  return read || write ? { ...(read ? { read } : {}), ...(write ? { write } : {}) } : null;
}

/** Le visiteur satisfait-il la règle ? L'équipe passe toujours. Un visiteur non connecté ne passe que les accès libres. */
export function passes(rule: AccessRule | undefined, ctx: AccessCtx | null): boolean {
  if (!rule || rule.type === 'ALL') return true;
  if (!ctx) return false;
  if (isStaffRole(ctx.role)) return true;
  switch (rule.type) {
    case 'STAFF': return false;
    case 'UPLOADERS': return UPLOADERS.includes(ctx.role);
    case 'DONORS': return ctx.donor;
    case 'ADULT': return ctx.adult;
    case 'CLASS': return (CLASS_ORDER as readonly string[]).indexOf(ctx.memberClass) >= (CLASS_ORDER as readonly string[]).indexOf(rule.minClass ?? 'MEMBRE');
    default: return false;
  }
}

/** Libellé à afficher : « Réservé : Élite et plus ». */
export function describeRule(rule: AccessRule | undefined): string | null {
  if (!rule || rule.type === 'ALL') return null;
  switch (rule.type) {
    case 'STAFF': return "l'équipe";
    case 'UPLOADERS': return 'les uploaders et l\'équipe';
    case 'DONORS': return 'les donateurs ❤️';
    case 'ADULT': return 'les membres qui ont activé le contenu 18+';
    case 'CLASS': return `les membres ${CLASS_LABELS[rule.minClass ?? 'MEMBRE'] ?? rule.minClass} et plus`;
    default: return null;
  }
}

export interface FlatForum { id: string; parentId: string | null; isCategory: boolean; staffOnly: boolean; locked: boolean; archived: boolean; access: unknown }

const accessOf = (f: FlatForum): ForumAccess => normalizeAccess(f.access) ?? {};

/** Chaîne du forum jusqu'à la racine (lui d'abord). */
function chain(id: string, byId: Map<string, FlatForum>): FlatForum[] {
  const out: FlatForum[] = [];
  for (let cur = byId.get(id); cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) out.push(cur);
  return out;
}

/** Lecture : chaque niveau (le forum et tout ce qui le contient) doit être lisible par le visiteur. Renvoie le premier obstacle, sinon null. */
export function readBlocker(id: string, byId: Map<string, FlatForum>, ctx: AccessCtx | null): AccessRule | null {
  for (const f of chain(id, byId).reverse()) {
    if (f.staffOnly && !(ctx && isStaffRole(ctx.role))) return { type: 'STAFF' };
    const r = accessOf(f).read;
    if (!passes(r, ctx)) return r!;
  }
  return null;
}
export const canRead = (id: string, byId: Map<string, FlatForum>, ctx: AccessCtx | null) => readBlocker(id, byId, ctx) === null;

export type WriteDenied = { reason: 'LOGIN' | 'READ' | 'CATEGORY' | 'LOCKED' | 'ARCHIVED' | 'RULE'; rule?: AccessRule };

/** Écriture (nouveau sujet ou réponse) : null = autorisé, sinon la raison du refus. */
export function writeDenied(id: string, byId: Map<string, FlatForum>, ctx: AccessCtx | null): WriteDenied | null {
  const self = byId.get(id);
  if (!self) return { reason: 'READ' };
  if (!ctx) return { reason: 'LOGIN' };
  if (self.isCategory) return { reason: 'CATEGORY' };
  const blocker = readBlocker(id, byId, ctx);
  if (blocker) return { reason: 'READ', rule: blocker };
  const staff = isStaffRole(ctx.role);
  for (const f of chain(id, byId)) {
    const r = accessOf(f).write;
    if (!passes(r, ctx)) return { reason: 'RULE', rule: r };
  }
  if (!staff) {
    if (chain(id, byId).some((f) => f.archived)) return { reason: 'ARCHIVED' };
    if (chain(id, byId).some((f) => f.locked)) return { reason: 'LOCKED' };
  }
  return null;
}

export function describeDenied(d: WriteDenied): string {
  switch (d.reason) {
    case 'LOGIN': return 'Connecte-toi pour participer.';
    case 'CATEGORY': return 'Cette catégorie ne contient pas de sujets : choisis un de ses forums.';
    case 'LOCKED': return 'Ce forum est verrouillé : seule l\'équipe peut y publier.';
    case 'ARCHIVED': return 'Ce forum est archivé : il reste lisible, mais on n\'y publie plus.';
    case 'READ': return d.rule ? `Ce forum est réservé à ${describeRule(d.rule)}.` : 'Forum introuvable.';
    case 'RULE': return `Écrire ici est réservé à ${describeRule(d.rule)}.`;
  }
}
