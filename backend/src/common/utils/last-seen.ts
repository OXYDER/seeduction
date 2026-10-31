/**
 * « Vu la dernière fois il y a… » : à qui on montre la dernière activité d'un membre. Elle est cachée pour les autres membres quand il l'a choisi (Profil > Compte),
 * quand il apparaît hors ligne (sinon elle trahirait son choix) et quand il est anonyme ; lui-même et l'équipe la voient toujours.
 */
export const LAST_SEEN_SELECT = { lastSeenAt: true, showLastSeen: true, presenceStatus: true, anonymous: true, anonymousSelf: true } as const;

export interface LastSeenRow { lastSeenAt: Date | null; showLastSeen: boolean; presenceStatus: string; anonymous: boolean; anonymousSelf: boolean }

export function lastSeenVisible(u: LastSeenRow, viewer: { self: boolean; staff: boolean }): Date | null {
  if (viewer.self || viewer.staff) return u.lastSeenAt;
  if (!u.showLastSeen || u.presenceStatus === 'INVISIBLE' || u.anonymous || u.anonymousSelf) return null;
  return u.lastSeenAt;
}
