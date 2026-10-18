/**
 * Détection d'activité suspecte à partir du journal d'audit (logique pure, sans base de données).
 *
 * Trois motifs de piratage courants : une adresse qui essaie énormément de mots de passe (force brute), une adresse qui essaie beaucoup de comptes différents
 * (« arrosage » avec une liste de mots de passe volés), un compte précis attaqué depuis plusieurs adresses, et la connexion d'un membre de l'équipe depuis une adresse jamais vue.
 */
export interface FailedLogin { ip: string | null; username: string; at: number }
export interface StaffLogin { userId: string; username: string; role: string; ip: string | null; at: number }

export type FindingKind = 'ip-burst' | 'ip-spray' | 'account-targeted' | 'staff-new-ip';
export interface Finding { key: string; kind: FindingKind; severity: 'warn' | 'high'; subject: string; count: number; detail: string }

export interface Thresholds { burst: number; spray: number; targeted: number }
export const DEFAULT_THRESHOLDS: Thresholds = { burst: 15, spray: 5, targeted: 8 };

const norm = (s: string) => String(s ?? '').trim().toLowerCase().slice(0, 64);
const ipOf = (ip: string | null) => ip ?? 'inconnue';

/** Échecs de connexion : force brute (beaucoup d'essais d'une adresse), arrosage (beaucoup de comptes d'une adresse), compte ciblé (échecs répétés depuis plusieurs adresses). */
export function analyzeFailures(events: FailedLogin[], t: Thresholds = DEFAULT_THRESHOLDS): Finding[] {
  const byIp = new Map<string, FailedLogin[]>();
  const byUser = new Map<string, FailedLogin[]>();
  for (const e of events) {
    const ip = ipOf(e.ip), u = norm(e.username);
    (byIp.get(ip) ?? byIp.set(ip, []).get(ip)!).push(e);
    if (u) (byUser.get(u) ?? byUser.set(u, []).get(u)!).push(e);
  }
  const out: Finding[] = [];
  for (const [ip, list] of byIp) {
    const users = new Set(list.map((e) => norm(e.username)).filter(Boolean));
    if (users.size >= t.spray) out.push({ key: `spray:${ip}`, kind: 'ip-spray', severity: 'high', subject: ip, count: users.size, detail: `${list.length} échecs sur ${users.size} comptes différents depuis cette adresse (liste de mots de passe volés ?)` });
    else if (list.length >= t.burst) out.push({ key: `burst:${ip}`, kind: 'ip-burst', severity: list.length >= t.burst * 3 ? 'high' : 'warn', subject: ip, count: list.length, detail: `${list.length} échecs de connexion depuis cette adresse (force brute ?)` });
  }
  for (const [u, list] of byUser) {
    const ips = new Set(list.map((e) => ipOf(e.ip)));
    if (list.length >= t.targeted && ips.size >= 2) out.push({ key: `targeted:${u}`, kind: 'account-targeted', severity: 'warn', subject: u, count: list.length, detail: `${list.length} échecs sur ce compte depuis ${ips.size} adresses différentes (compte ciblé ?)` });
  }
  return out.sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === 'high' ? -1 : 1));
}

/** Connexion réussie d'un membre de l'équipe depuis une adresse qu'il n'avait jamais utilisée avant (`known` : adresses déjà vues par membre, avant la fenêtre analysée). */
export function newStaffIps(logins: StaffLogin[], known: Map<string, Set<string>>): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const l of [...logins].sort((a, b) => a.at - b.at)) {
    if (!l.ip) continue;
    const k = known.get(l.userId);
    if (!k || k.size === 0) continue; // aucun historique : premier compte observé, rien à comparer
    if (k.has(l.ip) || seen.has(`${l.userId}:${l.ip}`)) continue;
    seen.add(`${l.userId}:${l.ip}`);
    out.push({ key: `staffip:${l.userId}:${l.ip}`, kind: 'staff-new-ip', severity: 'high', subject: l.username, count: 1, detail: `Connexion de ${l.username} (${l.role}) depuis une adresse jamais vue : ${l.ip}` });
  }
  return out;
}

export const KIND_LABEL: Record<FindingKind, string> = {
  'ip-burst': 'Force brute', 'ip-spray': 'Arrosage de comptes', 'account-targeted': 'Compte ciblé', 'staff-new-ip': 'Équipe : nouvelle adresse',
};
