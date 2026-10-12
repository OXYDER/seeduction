// Anti-triche : règles de détection et calcul du score, en fonctions pures (aucun accès à la base) pour pouvoir les tester.
// Le service (src/anticheat) les appelle à chaque announce et dans ses analyses horaires.

import { parsePeerClient } from './peer-client';

export type CheatFamily = 'ratio' | 'client' | 'network' | 'bonus';
export type CheatLevel = 'NONE' | 'WATCH' | 'SUSPECT' | 'LIKELY' | 'CRITICAL';

export interface CheatKindInfo {
  label: string;
  family: CheatFamily;
  /** Points maximum que ce type de signal peut rapporter par jour (évite qu'un seul signal bruyant sature le score). */
  dailyCap: number;
  /** Explication pour l'équipe. */
  hint: string;
}

export const CHEAT_KINDS: Record<string, CheatKindInfo> = {
  SPEED_IMPOSSIBLE: { label: 'Vitesse d\'upload irréaliste', family: 'ratio', dailyCap: 90, hint: 'Le client déclare avoir envoyé une quantité d\'octets que sa connexion ne peut pas physiquement débiter entre deux announces.' },
  LEFT_TAMPER: { label: 'Octets restants falsifiés', family: 'client', dailyCap: 80, hint: 'Le champ « left » dépasse la taille du torrent : valeur forgée par un outil.' },
  DOWNLOAD_UNDERREPORT: { label: 'Téléchargement sous-déclaré', family: 'ratio', dailyCap: 60, hint: 'Le torrent avance (octets restants en baisse) mais le client déclare bien moins de téléchargé : le ratio est protégé artificiellement.' },
  COUNTER_ROLLBACK: { label: 'Compteurs remis en arrière', family: 'client', dailyCap: 40, hint: 'Les compteurs d\'upload/download reculent sans changement de session (même peer_id) : typique d\'un outil qui réécrit les statistiques.' },
  ANNOUNCE_FLOOD: { label: 'Announces trop rapprochés', family: 'client', dailyCap: 15, hint: 'Announces à moins de 2 minutes d\'écart sans événement : ignore l\'intervalle demandé (outils de ratio, scripts).' },
  FAKE_CLIENT: { label: 'Client suspect ou usurpé', family: 'client', dailyCap: 60, hint: 'Le peer_id et le User-Agent ne correspondent pas, ou le User-Agent est celui d\'un outil de triche connu.' },
  SWARM_IMBALANCE: { label: 'Upload sans destinataire', family: 'ratio', dailyCap: 80, hint: 'Sur ce torrent, ce qui est déclaré envoyé dépasse largement ce que tous les autres ont déclaré recevoir (recoupement du swarm).' },
  RATIO_SURGE: { label: 'Envolée du ratio', family: 'ratio', dailyCap: 45, hint: 'Volume d\'upload sans commune mesure avec l\'ancienneté du compte ou avec ses habitudes.' },
  PASSKEY_SHARING: { label: 'Passkey partagée', family: 'network', dailyCap: 45, hint: 'La même passkey est utilisée depuis un nombre inhabituel de réseaux différents en quelques heures.' },
  SHARED_IP: { label: 'Adresse IP partagée entre comptes', family: 'network', dailyCap: 18, hint: 'Plusieurs comptes announcent depuis la même adresse. Souvent un foyer : ne compte que peu seul.' },
  ACCOUNT_COLLUSION: { label: 'Transferts entre comptes liés', family: 'network', dailyCap: 90, hint: 'Un compte envoie beaucoup à un autre compte de la même adresse IP : fermes de ratio (surtout en freeleech ou double upload).' },
  POINT_LAUNDERING: { label: 'Points bonus déplacés', family: 'bonus', dailyCap: 60, hint: 'Beaucoup de points bonus transférés vers (ou depuis) des comptes liés entre eux ou très récents.' },
};

export const CHEAT_FAMILY_LABELS: Record<CheatFamily, string> = { ratio: 'Ratio', client: 'Client', network: 'Réseau', bonus: 'Points bonus' };

export const kindLabel = (kind: string) => CHEAT_KINDS[kind]?.label ?? kind;

// ------------------------------------------------------------------ configuration

export interface AntiCheatConfig {
  enabled: boolean;
  /** Enregistre et score mais n'envoie aucune alerte (période de calibrage). */
  observeOnly: boolean;
  /** Niveau minimal qui déclenche une alerte à l'équipe. */
  alertLevel: Exclude<CheatLevel, 'NONE' | 'WATCH'>;
  /** Qui reçoit les alertes. */
  notifyScope: 'STAFF' | 'ADMINS';
  /** Sensibilité en % (100 = normal ; 150 = alerte plus tôt ; 60 = plus tolérant). */
  sensitivity: number;
  /** Vitesse moyenne d'upload (Mo/s) au-delà de laquelle un signal est enregistré (le signal grossit avec la vitesse). */
  speedWarnMBps: number;
  /** Nombre de réseaux distincts (en 6 h) à partir duquel la passkey est jugée partagée. */
  passkeyNetworks: number;
  /** Volume (Go sur 2 jours) à partir duquel une envolée d'upload est examinée. */
  surgeGb: number;
  /** Points bonus transférés entre comptes liés à partir desquels on alerte (sur 7 jours). */
  pointsLaunder: number;
  /** Le personnel est-il exempté des détections ? */
  exemptStaff: boolean;
}

export const DEFAULT_ANTICHEAT: AntiCheatConfig = {
  enabled: true, observeOnly: false, alertLevel: 'SUSPECT', notifyScope: 'STAFF', sensitivity: 100,
  speedWarnMBps: 125, passkeyNetworks: 4, surgeGb: 100, pointsLaunder: 300, exemptStaff: false,
};

const num = (v: any, d: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

export function normalizeAntiCheatConfig(raw: any): AntiCheatConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_ANTICHEAT;
  return {
    enabled: r.enabled === undefined ? d.enabled : r.enabled === true,
    observeOnly: r.observeOnly === true,
    alertLevel: ['SUSPECT', 'LIKELY', 'CRITICAL'].includes(r.alertLevel) ? r.alertLevel : d.alertLevel,
    notifyScope: r.notifyScope === 'ADMINS' ? 'ADMINS' : 'STAFF',
    sensitivity: Math.round(num(r.sensitivity, d.sensitivity, 40, 250)),
    speedWarnMBps: Math.round(num(r.speedWarnMBps, d.speedWarnMBps, 10, 5000)),
    passkeyNetworks: Math.round(num(r.passkeyNetworks, d.passkeyNetworks, 2, 20)),
    surgeGb: Math.round(num(r.surgeGb, d.surgeGb, 5, 100_000)),
    pointsLaunder: Math.round(num(r.pointsLaunder, d.pointsLaunder, 10, 1_000_000)),
    exemptStaff: r.exemptStaff === true,
  };
}

// ------------------------------------------------------------------ signaux à l'announce

export interface CheatSignal {
  kind: string;
  points: number;
  /** Rattaché à un torrent précis (sinon au membre). */
  torrentScoped: boolean;
  details: Record<string, any>;
}

export interface AnnounceInput {
  peerId: string;
  userAgent?: string | null;
  event?: string;
  viaStream?: boolean;
  /** Valeurs déclarées par le client à CET announce. */
  uploaded: number;
  downloaded: number;
  left: number;
  /** Taille du torrent (octets). */
  size: number;
  /** État du même peer (même peer_id) à l'announce précédent, s'il y en a un. */
  prev?: { uploaded: number; downloaded: number; left: number; lastAnnounceAt: Date } | null;
  now: Date;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Familles de clients dont le User-Agent doit mentionner le nom : si ce n'est pas le cas, le client se fait passer pour un autre. */
const UA_EXPECT: Record<string, RegExp> = { qB: /qbittorrent/i, TR: /transmission/i, DE: /deluge|libtorrent/i, UT: /torrent/i };
/** User-Agent d'outils connus pour truquer les statistiques. */
const CHEAT_UA = /ratio\s*-?master|ratiomaster|torrent\s*-?faker|bt\s*-?faker|fake\s*-?torrent|fake\s*-?ratio|ratio\s*-?(fake|spoof|hack)|tracker\s*-?faker|upload\s*-?spoof/i;

export function analyseClient(peerId: string, userAgent: string | null | undefined, viaStream?: boolean): CheatSignal[] {
  const out: CheatSignal[] = [];
  const ua = String(userAgent ?? '').trim();
  if (ua && CHEAT_UA.test(ua)) out.push({ kind: 'FAKE_CLIENT', points: 50, torrentScoped: false, details: { reason: 'Outil de triche connu dans le User-Agent', userAgent: ua.slice(0, 120) } });
  const m = /^-([A-Za-z]{2})[0-9A-Za-z]{4}-/.exec(peerId ?? '');
  if (m && !viaStream) {
    const expect = UA_EXPECT[m[1]];
    if (expect && ua && !expect.test(ua)) {
      out.push({ kind: 'FAKE_CLIENT', points: 20, torrentScoped: false, details: { reason: 'Le User-Agent ne correspond pas au client annoncé dans le peer_id', peerId: peerId.slice(0, 8), userAgent: ua.slice(0, 120) } });
    }
  } else if (!m && !viaStream && peerId && !parsePeerClient(peerId).known) {
    out.push({ kind: 'FAKE_CLIENT', points: 4, torrentScoped: false, details: { reason: 'peer_id dans un format inconnu', peerId: String(peerId).slice(0, 12), userAgent: ua.slice(0, 120) } });
  }
  return out;
}

/**
 * Examine un announce : ne regarde que ce qu'on sait à cet instant (compteurs précédents du même peer, taille du torrent, client).
 * Les recoupements entre membres (ce que les autres ont reçu) se font plus tard, dans les analyses horaires.
 */
export function analyseAnnounce(input: AnnounceInput, cfg: Pick<AntiCheatConfig, 'speedWarnMBps'> = DEFAULT_ANTICHEAT): CheatSignal[] {
  const out: CheatSignal[] = [...analyseClient(input.peerId, input.userAgent, input.viaStream)];
  const { size, left, prev } = input;

  // « left » ne peut pas dépasser la taille du torrent (tolérance d'une pièce arrondie).
  if (size > 0 && left > size * 1.001 + 64 * 1024) {
    out.push({ kind: 'LEFT_TAMPER', points: 40, torrentScoped: true, details: { left, size } });
  }
  if (!prev) return out;

  const elapsed = (input.now.getTime() - prev.lastAnnounceAt.getTime()) / 1000;
  const dUp = input.uploaded - prev.uploaded;
  const dDown = input.downloaded - prev.downloaded;

  // Compteurs qui reculent avec le même peer_id (une nouvelle session change de peer_id et repart de zéro).
  if (dUp < -10 * MB || dDown < -10 * MB) {
    out.push({ kind: 'COUNTER_ROLLBACK', points: 10, torrentScoped: true, details: { uploadedBefore: prev.uploaded, uploadedNow: input.uploaded, downloadedBefore: prev.downloaded, downloadedNow: input.downloaded } });
  }

  // Annonces à répétition sans événement (l'intervalle conseillé est de 30 min, le minimum de 15).
  if (!input.event && elapsed >= 0 && elapsed < 120) {
    out.push({ kind: 'ANNOUNCE_FLOOD', points: 3, torrentScoped: true, details: { seconds: Math.round(elapsed) } });
  }

  // Vitesse moyenne d'upload entre deux announces (au moins 1 Go déclaré, pour ne pas s'exciter sur de petites fenêtres).
  if (dUp >= 1 * GB && elapsed >= 30) {
    const mbps = dUp / elapsed / MB;
    const warn = Math.max(10, cfg.speedWarnMBps);
    let points = 0;
    if (mbps >= warn * 10) points = 60; // ≥ 10× le seuil : physiquement hors de portée
    else if (mbps >= warn * 5) points = 35;
    else if (mbps >= warn * 2) points = 20;
    else if (mbps >= warn) points = 8;
    if (points) out.push({ kind: 'SPEED_IMPOSSIBLE', points, torrentScoped: true, details: { mbps: Math.round(mbps), gb: Math.round((dUp / GB) * 10) / 10, seconds: Math.round(elapsed), thresholdMBps: warn } });
  }

  // Le torrent avance (left baisse) mais le client déclare nettement moins de téléchargé : ratio protégé.
  const got = input.event === 'started' ? 0 : Math.max(0, prev.left - left);
  if (got >= 512 * MB && dDown < got * 0.5) {
    const fraction = 1 - Math.max(0, dDown) / got;
    out.push({ kind: 'DOWNLOAD_UNDERREPORT', points: Math.round(8 + 14 * fraction), torrentScoped: true, details: { acquiredGb: Math.round((got / GB) * 100) / 100, reportedGb: Math.round((Math.max(0, dDown) / GB) * 100) / 100, hiddenPercent: Math.round(fraction * 100) } });
  }
  return out;
}

// ------------------------------------------------------------------ réseau

/** Adresse IP « normalisée » : IPv4 sans préfixe ::ffff:, IPv6 telle quelle. */
export function normalizeIp(ip: string | null | undefined): string {
  return String(ip ?? '').trim().replace(/^::ffff:/i, '').slice(0, 64);
}

/** Réseau d'une adresse : /24 pour l'IPv4, /48 pour l'IPv6 — deux adresses d'un même opérateur proche ne comptent que pour un seul réseau. */
export function ipNetwork(ip: string): string {
  const v = normalizeIp(ip);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return v.split('.').slice(0, 3).join('.') + '.0/24';
  if (v.includes(':')) {
    const parts = v.split(':');
    return parts.slice(0, 3).join(':') + '::/48';
  }
  return v;
}

/** Points pour une passkey vue depuis N réseaux distincts en quelques heures. */
export function passkeySharingPoints(networks: number, threshold: number): number {
  if (networks < threshold) return 0;
  return Math.min(45, 20 + (networks - threshold) * 8);
}

// ------------------------------------------------------------------ score

export interface ScoredEvent { kind: string; points: number; lastAt: Date; count?: number }

export interface ScoreContext {
  now?: Date;
  accountCreatedAt?: Date | null;
  sensitivity?: number;
}

export interface ScoreResult {
  score: number;
  level: CheatLevel;
  confidence: number;
  families: CheatFamily[];
  breakdown: Record<string, { points: number; events: number; lastAt: string }>;
}

export const HALF_LIFE_DAYS = 14;
export const WINDOW_DAYS = 60;
export const LEVEL_ORDER: CheatLevel[] = ['NONE', 'WATCH', 'SUSPECT', 'LIKELY', 'CRITICAL'];
const LEVEL_THRESHOLDS: [CheatLevel, number][] = [['CRITICAL', 180], ['LIKELY', 110], ['SUSPECT', 60], ['WATCH', 25]];

export const levelIndex = (l: CheatLevel | string) => Math.max(0, LEVEL_ORDER.indexOf(l as CheatLevel));

export function levelOf(score: number, sensitivity = 100): CheatLevel {
  const eff = score * (Math.max(40, sensitivity) / 100);
  for (const [lvl, min] of LEVEL_THRESHOLDS) if (eff >= min) return lvl;
  return 'NONE';
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Score de suspicion d'un membre.
 *  - un même type de signal ne rapporte qu'un plafond par jour (dailyCap) : un signal qui se répète toute la journée n'écrase pas les autres ;
 *  - chaque jour compte de moins en moins (demi-vie de 14 jours, fenêtre de 60 jours) : un membre qui se corrige redescend tout seul ;
 *  - la corroboration pèse : plusieurs familles de signaux indépendantes (ratio + réseau + client...) augmentent la confiance, un signal isolé non ;
 *  - un compte tout neuf est examiné plus sévèrement, un compte ancien avec un peu de tolérance.
 */
export function scoreEvents(events: ScoredEvent[], ctx: ScoreContext = {}): ScoreResult {
  const now = ctx.now ?? new Date();
  const perBucket = new Map<string, { kind: string; day: Date; points: number }>();
  const stats: Record<string, { points: number; events: number; lastAt: Date }> = {};
  for (const e of events) {
    const ageDays = (now.getTime() - e.lastAt.getTime()) / 86400_000;
    if (ageDays > WINDOW_DAYS || ageDays < -1) continue;
    const key = `${e.kind}|${dayKey(e.lastAt)}`;
    const cur = perBucket.get(key) ?? { kind: e.kind, day: e.lastAt, points: 0 };
    cur.points += e.points;
    perBucket.set(key, cur);
    const st = stats[e.kind] ?? { points: 0, events: 0, lastAt: e.lastAt };
    st.events += e.count ?? 1;
    if (e.lastAt > st.lastAt) st.lastAt = e.lastAt;
    stats[e.kind] = st;
  }
  let raw = 0;
  const families = new Set<CheatFamily>();
  for (const b of perBucket.values()) {
    const info = CHEAT_KINDS[b.kind];
    const capped = Math.min(b.points, info?.dailyCap ?? 40);
    const decay = Math.pow(0.5, Math.max(0, (now.getTime() - b.day.getTime()) / 86400_000) / HALF_LIFE_DAYS);
    const pts = capped * decay;
    raw += pts;
    if (info && pts >= 1) families.add(info.family);
    if (stats[b.kind]) stats[b.kind].points += pts;
  }
  const corroboration = families.size >= 3 ? 1.5 : families.size === 2 ? 1.25 : 1;
  const ageDays = ctx.accountCreatedAt ? (now.getTime() - ctx.accountCreatedAt.getTime()) / 86400_000 : 90;
  const tenure = ageDays < 14 ? 1.25 : ageDays > 365 ? 0.9 : 1;
  const score = Math.round(raw * corroboration * tenure * 10) / 10;
  const level = levelOf(score, ctx.sensitivity);
  // Confiance : monte avec le score, plafonnée tant que les indices viennent d'une seule famille.
  const base = 1 - Math.exp(-(score * (Math.max(40, ctx.sensitivity ?? 100) / 100)) / 90);
  const confidence = Math.round(100 * Math.min(base, families.size <= 1 ? 0.7 : 0.97));
  const breakdown: ScoreResult['breakdown'] = {};
  for (const [k, v] of Object.entries(stats)) if (v.points >= 0.5) breakdown[k] = { points: Math.round(v.points * 10) / 10, events: v.events, lastAt: v.lastAt.toISOString() };
  return { score, level, confidence, families: [...families], breakdown };
}

/** Points d'une envolée du ratio : `factor` = multiple de l'habitude du compte (null si pas d'historique). */
export function surgePoints(up2dBytes: number, baselineDailyBytes: number | null, accountAgeDays: number, surgeGb: number): number {
  const minBytes = surgeGb * GB;
  if (up2dBytes < minBytes) return 0;
  if (baselineDailyBytes === null || baselineDailyBytes <= 0) {
    // Pas d'historique : seul un compte récent qui envoie énormément est suspect.
    if (accountAgeDays > 14) return 0;
    return Math.min(40, 12 + Math.round(Math.log2(up2dBytes / minBytes + 1) * 8));
  }
  const factor = up2dBytes / 2 / baselineDailyBytes; // upload moyen par jour sur les 2 derniers jours / habitude
  if (factor < 8 || up2dBytes < 1.5 * minBytes) return 0;
  return Math.min(40, 12 + Math.round(Math.log2(factor) * 5));
}

/** Points d'un déséquilibre de swarm attribué à un membre (`gb` = part de l'excès qui lui revient). */
export function imbalancePoints(attributableGb: number): number {
  if (attributableGb < 1) return 0;
  return Math.min(45, Math.round(12 + 6 * Math.log2(1 + attributableGb)));
}
