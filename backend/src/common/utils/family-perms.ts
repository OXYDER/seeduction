/**
 * Compte famille : ce que le profil principal autorise à chaque profil. Le profil principal (et tout compte sans profils)
 * a tous les droits. Un profil créé n'a au départ aucun accès aux contenus adultes, à l'envoi de torrents ni aux dépenses
 * de points ; le reste est permis. Le profil principal change tout ça à tout moment.
 */
export const PERM_KEYS = ['adult', 'upload', 'spend', 'download', 'messaging', 'write'] as const;
export type PermKey = (typeof PERM_KEYS)[number];
export type Perms = Record<PermKey, boolean>;

export const PERM_LABELS: Record<PermKey, string> = {
  adult: 'Contenu adulte (XXX)',
  upload: 'Envoyer des torrents',
  spend: 'Dépenser les points (boutique, jetons freeleech, primes de demandes)',
  download: 'Télécharger et lire les torrents',
  messaging: 'Messagerie, chat et appels',
  write: 'Commentaires et forum',
};

export const ALL_PERMS: Perms = { adult: true, upload: true, spend: true, download: true, messaging: true, write: true };
export const DEFAULT_PERMS: Perms = { adult: false, upload: false, spend: false, download: true, messaging: true, write: true };

/** Droits d'un profil à partir de sa ligne en base (anciens profils « adulte / enfant » compris). */
export function permsOf(row: { parentId?: string | null; profilePerms?: unknown; profileType?: string | null }): Perms {
  if (!row.parentId) return ALL_PERMS;
  if (row.profilePerms && typeof row.profilePerms === 'object') return normalizePerms(row.profilePerms);
  if (row.profileType === 'ADULT') return { ...DEFAULT_PERMS, adult: true, upload: true };
  return DEFAULT_PERMS;
}

/** Ne garde que les droits connus, en booléens ; ce qui manque prend la valeur par défaut. */
export function normalizePerms(input: unknown): Perms {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_PERMS };
  for (const k of PERM_KEYS) if (typeof src[k] === 'boolean') out[k] = src[k] as boolean;
  return out;
}

const cache = new Map<string, { at: number; perms: Perms }>();

/** Droits d'un utilisateur (mis en cache 15 s) pour les services qui n'ont pas `req.user` sous la main (messagerie, contenu adulte). */
export async function loadPerms(prisma: { user: { findUnique: (a: any) => Promise<any> } }, userId: string): Promise<Perms> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < 15_000) return hit.perms;
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { parentId: true, profilePerms: true, profileType: true } });
  const perms = row ? permsOf(row) : ALL_PERMS;
  cache.set(userId, { at: Date.now(), perms });
  if (cache.size > 1000) cache.clear();
  return perms;
}
