/**
 * Journal de modération : les actions du journal d'audit rendues lisibles (libellé, catégorie, gravité, cible), pour que l'équipe voie qui a fait quoi, sur qui ou sur quoi.
 * Logique pure (testée) ; la lecture de la base est dans StaffLogService.
 */
export type Category = 'torrents' | 'membres' | 'chat' | 'forum' | 'anticheat' | 'suggestions' | 'donations' | 'config' | 'securite';
export type Severity = 'info' | 'important' | 'grave';

export const CATEGORIES: Record<Category, { label: string; icon: string; adminOnly: boolean }> = {
  torrents: { label: 'Torrents', icon: '🎬', adminOnly: false },
  membres: { label: 'Membres', icon: '👤', adminOnly: false },
  chat: { label: 'Chat', icon: '💬', adminOnly: false },
  forum: { label: 'Forum', icon: '🗨️', adminOnly: false },
  anticheat: { label: 'Anti-triche', icon: '🕵️', adminOnly: false },
  suggestions: { label: 'Suggestions', icon: '💡', adminOnly: false },
  donations: { label: 'Dons', icon: '💝', adminOnly: true },
  config: { label: 'Réglages du site', icon: '⚙️', adminOnly: true },
  securite: { label: 'Sécurité', icon: '🔐', adminOnly: true },
};

interface Info { label: string; category: Category; severity: Severity }
const A = (label: string, category: Category, severity: Severity = 'info'): Info => ({ label, category, severity });

export const ACTIONS: Record<string, Info> = {
  TORRENT_APPROVE: A('a validé un torrent', 'torrents'), TORRENT_REJECT: A('a refusé un torrent', 'torrents', 'important'), TORRENT_HOLD: A('a demandé une correction', 'torrents'),
  TORRENT_EDIT: A('a modifié un torrent', 'torrents'), TORRENT_DELETE: A('a supprimé un torrent', 'torrents', 'important'),
  REPORT_RESOLVE: A('a traité un signalement', 'membres'), REPORT_DISMISS: A('a classé un signalement sans suite', 'membres'),
  USER_WARN: A('a averti un membre', 'membres', 'important'), USER_BAN: A('a banni un membre', 'membres', 'grave'), USER_UNBAN: A('a levé un bannissement', 'membres', 'important'),
  USER_EDIT: A('a modifié un membre', 'membres'), USER_DELETE: A('a supprimé un compte', 'membres', 'grave'), USER_ACTIVATE: A('a activé un compte', 'membres'),
  USER_CLEAR_HNR: A('a effacé un hit & run', 'membres'), USER_WARNING_DELETE: A('a retiré un avertissement', 'membres'), USER_PASSKEY_RESET: A('a réinitialisé la passkey d\'un membre', 'membres', 'important'),
  PASSWORD_RESET_FORCED: A('a exigé la réinitialisation du mot de passe', 'membres', 'important'), PASSWORD_RESET_FORCE_CANCELED: A('a levé l\'exigence de réinitialisation', 'membres'), RESET_LINK_ISSUED: A('a émis un lien de réinitialisation', 'membres', 'important'),
  STAFF_VIEW_PRIVATE: A('a consulté des conversations privées', 'membres', 'grave'), STAFF_UNLOCK_PRIVATE: A('a déverrouillé l\'accès aux conversations privées', 'membres', 'grave'),
  CHAT_BAN: A('a banni du chat', 'chat', 'important'), CHAT_UNBAN: A('a levé un bannissement du chat', 'chat'), CHANNEL_PURGE: A('a purgé un canal', 'chat', 'important'),
  FORUM_TOPIC_DELETE: A('a supprimé un sujet', 'forum', 'important'), FORUM_TOPIC_LOCK: A('a verrouillé un sujet', 'forum'), FORUM_TOPIC_UNLOCK: A('a déverrouillé un sujet', 'forum'),
  FORUM_TOPIC_PIN: A('a épinglé un sujet', 'forum'), FORUM_TOPIC_UNPIN: A('a désépinglé un sujet', 'forum'), FORUM_TOPICS_MOVE: A('a déplacé des sujets', 'forum'),
  FORUM_STRUCTURE_CREATE: A('a créé un forum', 'forum'), FORUM_STRUCTURE_UPDATE: A('a modifié un forum', 'forum'), FORUM_STRUCTURE_DELETE: A('a supprimé un forum', 'forum', 'important'),
  FORUM_STRUCTURE_MOVE: A('a déplacé un forum', 'forum'), FORUM_STRUCTURE_MERGE: A('a fusionné des forums', 'forum', 'important'),
  ANTICHEAT_CASE: A('a traité un dossier anti-triche', 'anticheat', 'important'), ANTICHEAT_CONFIG: A('a réglé l\'anti-triche', 'anticheat'),
  SUGGESTION_STATUS: A('a changé le statut d\'une suggestion', 'suggestions'), SUGGESTION_CONFIG: A('a réglé les suggestions', 'suggestions'),
  DONATION_RECORD: A('a enregistré un don', 'donations'), DONATION_EVENT_IGNORED: A('a ignoré un don reçu', 'donations'), DONATION_CONFIG: A('a réglé les dons', 'donations'), DONATION_WEBHOOKS_CONFIG: A('a réglé les dons automatiques', 'donations'),
  CONFIG_EDIT: A('a modifié les paramètres du site', 'config', 'important'), CONFIG_RESET: A('a rétabli des paramètres', 'config', 'important'), CONFIG_MIN_RATIO_ALL: A('a changé le ratio minimum de tous', 'config', 'important'),
  INVITE_CREATE: A('a créé des invitations', 'config'), INVITE_DELETE: A('a supprimé une invitation', 'config'), INVITE_EDIT: A('a modifié une invitation', 'config'), REFERRAL_CONFIG: A('a réglé le parrainage', 'config'),
  FREELEECH_EVENT_CREATE: A('a programmé un freeleech', 'config'), FREELEECH_EVENT_EDIT: A('a modifié un freeleech', 'config'), FREELEECH_EVENT_DELETE: A('a supprimé un freeleech', 'config'), FREELEECH_GLOBAL: A('a lancé un freeleech global', 'config'),
  MAINTENANCE_START: A('a lancé une maintenance', 'config', 'important'), MAINTENANCE_END: A('a terminé la maintenance', 'config'),
  STAFF_2FA_REQUIRED_ON: A('a rendu la 2FA obligatoire pour l\'équipe', 'securite', 'important'), STAFF_2FA_REQUIRED_OFF: A('a levé l\'obligation de la 2FA', 'securite', 'important'),
  LOCKDOWN_START: A('a lancé l\'alerte générale', 'securite', 'grave'), LOCKDOWN_UNLOCK: A('a levé l\'alerte générale', 'securite', 'grave'),
  BACKUP_RUN: A('a lancé une sauvegarde', 'securite'), BACKUP_DELETE: A('a supprimé une sauvegarde', 'securite', 'important'), BACKUP_DOWNLOAD: A('a téléchargé une sauvegarde', 'securite', 'important'), BACKUP_CONFIG: A('a réglé les sauvegardes', 'securite'),
  MOD_LOG_EXPORT: A('a exporté le journal de modération', 'securite', 'important'),
  MAIL_MAILBOX_CONFIG: A('a réglé une boîte courriel', 'securite', 'important'), MAIL_SEND: A('a envoyé un courriel depuis le site', 'securite'),
};

/** Réglages de jeux et autres « X_CONFIG » non listés : rangés avec les réglages du site. */
export function infoOf(action: string): Info {
  if (ACTIONS[action]) return ACTIONS[action];
  if (/_CONFIG$/.test(action)) return A('a réglé : ' + action.replace(/_CONFIG$/, '').toLowerCase().replace(/_/g, ' '), 'config');
  return A(action.toLowerCase().replace(/_/g, ' '), 'config');
}

/** Codes d'action d'une catégorie (pour filtrer en base). Les « X_CONFIG » non listés vont dans « config » via le préfixe/suffixe côté service. */
export function actionsOf(category: Category): string[] {
  return Object.entries(ACTIONS).filter(([, i]) => i.category === category).map(([code]) => code);
}

export interface Target { kind: 'torrent' | 'user' | 'suggestion' | 'forum' | 'other'; id?: string; label: string; link?: string }

/** Sur quoi ou sur qui portait l'action, avec un lien quand il existe. */
export function targetOf(action: string, meta: any): Target | null {
  if (!meta || typeof meta !== 'object') return null;
  if (meta.torrentId) return { kind: 'torrent', id: meta.torrentId, label: String(meta.name ?? 'torrent'), link: `/torrents/${meta.torrentId}` };
  if (meta.targetId) return { kind: 'user', id: meta.targetId, label: String(meta.target ?? meta.username ?? 'membre'), link: `/users/${meta.targetId}` };
  if (meta.userId && meta.username) return { kind: 'user', id: meta.userId, label: String(meta.username), link: `/users/${meta.userId}` };
  if (meta.suggestionId) return { kind: 'suggestion', id: meta.suggestionId, label: 'suggestion', link: `/suggestions/${meta.suggestionId}` };
  if (meta.topicId) return { kind: 'forum', id: meta.topicId, label: String(meta.title ?? 'sujet'), link: `/forum/topics/${meta.topicId}` };
  if (meta.channel) return { kind: 'other', label: `#${meta.channel}` };
  if (meta.label) return { kind: 'other', label: String(meta.label) };
  return null;
}

const clip = (s: unknown, n = 160) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Le détail de l'action en une phrase (motif, changements, durée…). */
export function summarize(action: string, meta: any): string {
  if (!meta || typeof meta !== 'object') return '';
  const parts: string[] = [];
  if (meta.reason) parts.push(`motif : ${clip(meta.reason)}`);
  if (Array.isArray(meta.reasons) && meta.reasons.length) parts.push(`motifs : ${meta.reasons.map((r: unknown) => clip(r, 40)).join(', ')}`);
  if (meta.note) parts.push(`note : ${clip(meta.note)}`);
  if (meta.expiresAt) parts.push(`jusqu'au ${new Date(meta.expiresAt).toLocaleDateString('fr-CA')}`);
  if (meta.scope) parts.push(`portée : ${clip(meta.scope, 60)}`);
  if (meta.status) parts.push(`statut : ${clip(meta.status, 30)}`);
  if (meta.section) parts.push(`section : ${clip(meta.section, 30)}`);
  if (meta.changes && typeof meta.changes === 'object') parts.push(Object.entries(meta.changes).slice(0, 6).map(([k, v]: [string, any]) => `${k} : ${clip(v?.from, 30)} → ${clip(v?.to, 30)}`).join(', '));
  else if (Array.isArray(meta.fields) && meta.fields.length) parts.push(`champs : ${meta.fields.slice(0, 8).join(', ')}`);
  if (meta.hours !== undefined) parts.push(meta.hours ? `${meta.hours} h` : 'arrêt');
  if (meta.deleted !== undefined && action === 'CHANNEL_PURGE') parts.push(`${meta.deleted} message${meta.deleted > 1 ? 's' : ''} supprimé${meta.deleted > 1 ? 's' : ''}`);
  if (meta.amount !== undefined && action === 'DONATION_RECORD') parts.push(`${meta.amount} $`);
  return parts.join(' · ');
}

/** Cellule de CSV sûre : guillemets doublés, et une formule de tableur (=, +, -, @) est neutralisée. */
export function csvCell(v: unknown): string {
  let s = String(v ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
