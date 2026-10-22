/**
 * Salle du direct : spectateurs, chat et réactions pendant une diffusion (page « Direct »). Logique pure, sans réseau : la passerelle temps réel ne fait que l'appeler.
 * Tout reste en mémoire et se remet à zéro à chaque nouvelle diffusion : ce n'est pas un historique, c'est une ambiance.
 */
export const DEFAULT_EMOJIS = ['👍', '❤️', '🔥', '😂', '😮', '👏', '🏒', '🚨'];

export interface InteractionConfig {
  chat: boolean;
  reactions: boolean;
  /** Délai minimum entre deux messages d'un même membre (secondes). */
  slowSeconds: number;
  maxLen: number;
  /** Réactions maximum par membre et par minute. */
  reactionsPerMinute: number;
  emojis: string[];
}

export const DEFAULT_INTERACTIONS: InteractionConfig = { chat: true, reactions: true, slowSeconds: 3, maxLen: 200, reactionsPerMinute: 30, emojis: DEFAULT_EMOJIS };

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export function normalizeInteractions(raw: any, previous: InteractionConfig = DEFAULT_INTERACTIONS): InteractionConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const emojis = Array.isArray(r.emojis)
    ? [...new Set((r.emojis as unknown[]).filter((e): e is string => typeof e === 'string' && e.length > 0 && e.length <= 8).map((e) => e.trim()).filter(Boolean))].slice(0, 12)
    : previous.emojis;
  return {
    chat: typeof r.chat === 'boolean' ? r.chat : previous.chat,
    reactions: typeof r.reactions === 'boolean' ? r.reactions : previous.reactions,
    slowSeconds: int(r.slowSeconds, 0, 60, previous.slowSeconds),
    maxLen: int(r.maxLen, 20, 500, previous.maxLen),
    reactionsPerMinute: int(r.reactionsPerMinute, 1, 120, previous.reactionsPerMinute),
    emojis: emojis.length ? emojis : DEFAULT_EMOJIS,
  };
}

const LINK = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|ca|io|me|tv|to|ly|gg|xyz|info)\b)/i;

/** Nettoie un message de chat : sans caractères de contrôle ni espaces en trop ; null s'il est vide, trop long, ou contient un lien (sauf pour l'équipe). */
export function cleanChatText(text: unknown, maxLen: number, allowLinks = false): { text: string } | { error: string } {
  if (typeof text !== 'string') return { error: 'Message invalide.' };
  // eslint-disable-next-line no-control-regex
  const t = text.replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return { error: 'Message vide.' };
  if (t.length > maxLen) return { error: `Message trop long (${maxLen} caractères au plus).` };
  if (!allowLinks && LINK.test(t)) return { error: 'Les liens ne sont pas permis dans le chat du direct.' };
  return { text: t };
}

export interface ChatEntry { id: string; userId: string; username: string; role: string; text: string; at: number }

const REACTION_BATCH_CAP = 12; // par émoji et par envoi groupé : 200 personnes qui appuient en même temps ne font pas 200 animations

export class LiveRoomState {
  private viewers = new Map<string, Set<string>>(); // membre → ses connexions (plusieurs onglets = un spectateur)
  private log: ChatEntry[] = [];
  private muted = new Map<string, number>();
  private lastChat = new Map<string, number>();
  private chatTimes = new Map<string, number[]>();
  private reactTimes = new Map<string, number[]>();
  private pending = new Map<string, number>();
  private seq = 0;

  // ── Spectateurs ───────────────────────────────────────────────────────────
  join(userId: string, socketId: string): void { (this.viewers.get(userId) ?? this.viewers.set(userId, new Set()).get(userId)!).add(socketId); }
  leave(socketId: string): void { for (const [u, s] of this.viewers) { s.delete(socketId); if (!s.size) this.viewers.delete(u); } }
  count(): number { return this.viewers.size; }

  // ── Chat ──────────────────────────────────────────────────────────────────
  mute(userId: string, minutes: number, now = Date.now()): void { this.muted.set(userId, now + Math.max(1, Math.min(minutes, 1440)) * 60_000); }
  isMuted(userId: string, now = Date.now()): boolean { const u = this.muted.get(userId); if (u && u > now) return true; if (u) this.muted.delete(userId); return false; }

  /** Un message est-il permis maintenant ? Mode lent (un message toutes les N secondes) et plafond de 6 messages par minute. */
  canChat(userId: string, cfg: InteractionConfig, now = Date.now()): { ok: true } | { ok: false; reason: string } {
    if (!cfg.chat) return { ok: false, reason: 'Le chat est désactivé pendant ce direct.' };
    if (this.isMuted(userId, now)) return { ok: false, reason: 'Tu es réduit au silence pour quelques minutes.' };
    const last = this.lastChat.get(userId) ?? 0;
    if (now - last < cfg.slowSeconds * 1000) return { ok: false, reason: `Mode lent : un message toutes les ${cfg.slowSeconds} secondes.` };
    const recent = (this.chatTimes.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 6) return { ok: false, reason: 'Tu écris trop vite : reprends dans un instant.' };
    return { ok: true };
  }

  addChat(entry: Omit<ChatEntry, 'id' | 'at'>, now = Date.now()): ChatEntry {
    const e: ChatEntry = { ...entry, id: `${now.toString(36)}-${(++this.seq).toString(36)}`, at: now };
    this.log.push(e);
    if (this.log.length > 50) this.log.shift();
    this.lastChat.set(e.userId, now);
    this.chatTimes.set(e.userId, [...(this.chatTimes.get(e.userId) ?? []).filter((t) => now - t < 60_000), now]);
    return e;
  }

  recent(): ChatEntry[] { return [...this.log]; }
  deleteChat(id: string): boolean { const n = this.log.length; this.log = this.log.filter((e) => e.id !== id); return this.log.length < n; }

  // ── Réactions ─────────────────────────────────────────────────────────────
  /** Une réaction est-elle permise ? Émoji de la liste, au plus N par minute et par membre, pas plus de 3 par seconde. */
  canReact(userId: string, emoji: unknown, cfg: InteractionConfig, now = Date.now()): { ok: true } | { ok: false; reason: string } {
    if (!cfg.reactions) return { ok: false, reason: 'Les réactions sont désactivées pendant ce direct.' };
    if (typeof emoji !== 'string' || !cfg.emojis.includes(emoji)) return { ok: false, reason: 'Réaction inconnue.' };
    const recent = (this.reactTimes.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= cfg.reactionsPerMinute) return { ok: false, reason: `Limite atteinte : ${cfg.reactionsPerMinute} réactions par minute.` };
    if (recent.filter((t) => now - t < 1000).length >= 3) return { ok: false, reason: 'Doucement avec les réactions.' };
    return { ok: true };
  }

  addReaction(userId: string, emoji: string, now = Date.now()): void {
    this.reactTimes.set(userId, [...(this.reactTimes.get(userId) ?? []).filter((t) => now - t < 60_000), now]);
    this.pending.set(emoji, (this.pending.get(emoji) ?? 0) + 1);
  }

  /** Ce qu'on diffuse aux spectateurs (envois groupés, plafonnés) ; remet le compteur à zéro. */
  takeReactions(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [e, n] of this.pending) out[e] = Math.min(n, REACTION_BATCH_CAP);
    this.pending.clear();
    return out;
  }

  /** Nouvelle diffusion : on repart de zéro (chat, silences, compteurs) ; les spectateurs connectés restent. */
  reset(): void { this.log = []; this.muted.clear(); this.lastChat.clear(); this.chatTimes.clear(); this.reactTimes.clear(); this.pending.clear(); }
}
