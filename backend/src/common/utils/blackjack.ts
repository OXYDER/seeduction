/**
 * Blackjack : règles pures (sans base de données), pour pouvoir les tester à fond.
 *
 * Un joueur contre la maison, un sabot de plusieurs jeux battu à chaque partie (tirage sans remise, exact). Règles par défaut : le croupier tire sur un 17 souple (règle habituelle des casinos ; l'administration peut le faire rester sur tous les 17),
 * le blackjack paie 3 pour 2, doublement sur n'importe quelles deux premières cartes (aussi après une séparation), une seule séparation par partie, un seul coup par as
 * séparé, pas d'assurance ni d'abandon. Le croupier regarde sa carte cachée quand il montre un as ou une figure : s'il a un blackjack, la partie s'arrête tout de suite.
 *
 * Les cartes sont des codes de 0 à 51 (même codage que « Plus haut ou plus bas ») : valeur = code % 13 + 2 (2 à 14, l'as est 14), couleur = code ÷ 13.
 */
import { rankOf } from './hilo';

export const CARDS = 52;
export type Action = 'hit' | 'stand' | 'double' | 'split';
export const ACTIONS: Action[] = ['hit', 'stand', 'double', 'split'];
export type HandStatus = 'PLAY' | 'STAND' | 'BUST' | 'BLACKJACK';
export type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export interface Hand { cards: number[]; /** 1 ou 2 (mise doublée). */ bet: number; status: HandStatus; split: boolean }
export interface State {
  /** Toutes les cartes sorties du sabot, dans l'ordre : sert à tirer la suivante sans remise. */
  dealt: number[];
  dealer: number[];
  hands: Hand[];
  /** Indice de la main en cours de jeu. */
  cur: number;
  phase: 'PLAYER' | 'DONE';
  /** Le croupier a un blackjack (connu dès la distribution quand il montre un as ou une figure). */
  dealerBJ: boolean;
}

export interface BjConfig {
  enabled: boolean;
  minStake: number;
  maxStake: number;
  /** Paiement du blackjack : « 3:2 » (par défaut) ou « 6:5 » (moins généreux). */
  blackjackPays: '3:2' | '6:5';
  /** Le croupier tire sur un 17 « souple » (avec un as compté 11). */
  dealerHitsSoft17: boolean;
  doubleAfterSplit: boolean;
  /** Nombre de jeux de 52 cartes dans le sabot. */
  decks: number;
  /** Gain maximal d'une partie (0 = sans plafond). */
  maxWin: number;
  dailyLossMax: number;
  minAccountDays: number;
  dailyFree: { enabled: boolean; stake: number; maxWin: number };
  idleMinutes: number;
  /** Les pertes au blackjack comptent pour la remise de fidélité quotidienne (désactivé : le retour est déjà proche de 100 %). */
  cashback: boolean;
}

export const DEFAULT_BJ: BjConfig = {
  enabled: true, minStake: 5, maxStake: 100, blackjackPays: '3:2', dealerHitsSoft17: true, doubleAfterSplit: true, decks: 6,
  maxWin: 5000, dailyLossMax: 1000, minAccountDays: 7, dailyFree: { enabled: true, stake: 10, maxWin: 100 }, idleMinutes: 30, cashback: false,
};

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export function normalizeBj(raw: any, previous: BjConfig = DEFAULT_BJ): BjConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const step = (v: unknown, fallback: number) => { const n = int(v, 5, 100_000, fallback); return n - (n % 5) || fallback; };
  const minStake = step(r.minStake, previous.minStake);
  const free = r.dailyFree && typeof r.dailyFree === 'object' ? r.dailyFree : {};
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  return {
    enabled: bool(r.enabled, previous.enabled),
    minStake, maxStake: Math.max(minStake, step(r.maxStake, previous.maxStake)),
    blackjackPays: r.blackjackPays === '6:5' || r.blackjackPays === '3:2' ? r.blackjackPays : previous.blackjackPays,
    dealerHitsSoft17: bool(r.dealerHitsSoft17, previous.dealerHitsSoft17),
    doubleAfterSplit: bool(r.doubleAfterSplit, previous.doubleAfterSplit),
    decks: int(r.decks, 1, 8, previous.decks),
    maxWin: int(r.maxWin, 0, 100_000_000, previous.maxWin),
    dailyLossMax: int(r.dailyLossMax, 0, 10_000_000, previous.dailyLossMax),
    minAccountDays: int(r.minAccountDays, 0, 3650, previous.minAccountDays),
    dailyFree: { enabled: bool(free.enabled, previous.dailyFree.enabled), stake: step(free.stake, previous.dailyFree.stake), maxWin: int(free.maxWin, 0, 1_000_000, previous.dailyFree.maxWin) },
    idleMinutes: int(r.idleMinutes, 5, 1440, previous.idleMinutes),
    cashback: bool(r.cashback, previous.cashback),
  };
}

// ------------------------------------------------------------------ cartes et mains

/** Valeur au blackjack : 2 à 10 ; figures 10 ; as 11 (compté 1 si nécessaire). */
export function valueOf(card: number): number {
  const r = rankOf(card);
  return r === 14 ? 11 : r >= 11 ? 10 : r;
}

/** Total d'une main et si elle est « souple » (contient un as compté 11). */
export function handValue(cards: number[]): { total: number; soft: boolean } {
  let total = 0, aces = 0;
  for (const c of cards) { total += valueOf(c); if (rankOf(c) === 14) aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

export const isBlackjack = (cards: number[]): boolean => cards.length === 2 && handValue(cards).total === 21;

/** Tire au hasard une carte parmi celles qui restent dans le sabot (sans remise). `rng(n)` renvoie un entier de [0, n[. */
export function drawFromShoe(dealt: number[], decks: number, rng: (max: number) => number): number {
  const left = new Array<number>(CARDS).fill(decks);
  for (const c of dealt) left[c]--;
  const total = left.reduce((s, n) => s + n, 0);
  if (total <= 0) throw new Error('Sabot vide');
  let pick = rng(total);
  for (let c = 0; c < CARDS; c++) {
    if (pick < left[c]) return c;
    pick -= left[c];
  }
  throw new Error('Tirage invalide');
}

/** Un tireur : reçoit les cartes déjà sorties et renvoie la suivante (le service le branche sur le générateur sécurisé ; les tests sur des cartes imposées). */
export type Draw = (dealt: number[]) => number;

const take = (s: State, draw: Draw): number => { const c = draw(s.dealt); s.dealt = [...s.dealt, c]; return c; };
const clone = (s: State): State => ({ ...s, dealt: [...s.dealt], dealer: [...s.dealer], hands: s.hands.map((h) => ({ ...h, cards: [...h.cards] })) });

// ------------------------------------------------------------------ déroulement

/** Distribue : joueur, croupier (visible), joueur, croupier (cachée). Règle tout de suite les blackjacks. */
export function newGame(draw: Draw): State {
  const s: State = { dealt: [], dealer: [], hands: [{ cards: [], bet: 1, status: 'PLAY', split: false }], cur: 0, phase: 'PLAYER', dealerBJ: false };
  s.hands[0].cards.push(take(s, draw));
  s.dealer.push(take(s, draw));
  s.hands[0].cards.push(take(s, draw));
  s.dealer.push(take(s, draw));
  const up = valueOf(s.dealer[0]);
  s.dealerBJ = (up === 10 || up === 11) && isBlackjack(s.dealer); // le croupier regarde sa carte cachée
  if (isBlackjack(s.hands[0].cards)) s.hands[0].status = 'BLACKJACK';
  if (s.dealerBJ || s.hands[0].status === 'BLACKJACK') {
    if (s.hands[0].status === 'PLAY') s.hands[0].status = 'STAND';
    s.phase = 'DONE';
  }
  return s;
}

const canSplitPair = (h: Hand) => h.cards.length === 2 && valueOf(h.cards[0]) === valueOf(h.cards[1]);

/** Coups permis sur la main en cours (sans tenir compte de l'argent : c'est le service qui vérifie les points disponibles). */
export function legalActions(s: State, cfg: BjConfig): Action[] {
  if (s.phase !== 'PLAYER') return [];
  const h = s.hands[s.cur];
  if (!h || h.status !== 'PLAY') return [];
  const out: Action[] = ['hit', 'stand'];
  if (h.cards.length === 2 && (!h.split || cfg.doubleAfterSplit)) out.push('double');
  if (s.hands.length === 1 && canSplitPair(h)) out.push('split');
  return out;
}

/** La main en cours est-elle terminée ? On passe alors à la suivante, et au croupier quand il n'y en a plus. */
function advance(s: State, draw: Draw, cfg: BjConfig): void {
  for (;;) {
    const h = s.hands[s.cur];
    if (h && h.status === 'PLAY') {
      if (h.cards.length === 1) { h.cards.push(take(s, draw)); } // deuxième main séparée : sa deuxième carte arrive à son tour
      const v = handValue(h.cards).total;
      if (v > 21) h.status = 'BUST';
      else if (v === 21) h.status = 'STAND';
      else return; // la main attend un coup du joueur
    }
    if (s.cur + 1 < s.hands.length) { s.cur++; continue; }
    break;
  }
  // toutes les mains sont jouées : le croupier joue (inutile si toutes les mains ont dépassé 21)
  if (s.hands.some((x) => x.status !== 'BUST')) {
    for (;;) {
      const { total, soft } = handValue(s.dealer);
      if (total < 17 || (total === 17 && soft && cfg.dealerHitsSoft17)) s.dealer.push(take(s, draw)); else break;
    }
  }
  s.phase = 'DONE';
}

/** Applique un coup du joueur et renvoie le nouvel état. Lève une erreur si le coup n'est pas permis. */
export function act(state: State, action: Action, draw: Draw, cfg: BjConfig): State {
  if (!legalActions(state, cfg).includes(action)) throw new Error('Coup non permis');
  const s = clone(state);
  const h = s.hands[s.cur];
  if (action === 'stand') { h.status = 'STAND'; advance(s, draw, cfg); return s; }
  if (action === 'hit') {
    h.cards.push(take(s, draw));
    advance(s, draw, cfg);
    return s;
  }
  if (action === 'double') {
    h.bet = 2;
    h.cards.push(take(s, draw));
    h.status = handValue(h.cards).total > 21 ? 'BUST' : 'STAND';
    advance(s, draw, cfg);
    return s;
  }
  // séparation : deux mains d'une carte ; la première reçoit tout de suite sa deuxième carte
  const [a, b] = h.cards;
  const aces = rankOf(a) === 14;
  s.hands = [{ cards: [a], bet: 1, status: 'PLAY', split: true }, { cards: [b], bet: 1, status: 'PLAY', split: true }];
  s.cur = 0;
  if (aces) {
    // un seul coup par as : chaque main reçoit une carte et s'arrête
    for (const x of s.hands) { x.cards.push(take(s, draw)); x.status = 'STAND'; }
    advance(s, draw, cfg);
    return s;
  }
  advance(s, draw, cfg);
  return s;
}

/** Le joueur ne répond plus : toutes ses mains restent comme elles sont (le croupier joue). */
export function standAll(state: State, draw: Draw, cfg: BjConfig): State {
  let s = state;
  for (let i = 0; i < 4 && s.phase === 'PLAYER'; i++) s = act(s, 'stand', draw, cfg);
  return s;
}

// ------------------------------------------------------------------ règlement

export interface HandResult { outcome: Outcome; payout: number }

/** Résultat et gain de chaque main (la mise est comprise dans le gain : un match nul rend la mise). Les gains sont arrondis vers le bas. */
export function settle(state: State, valued: number, cfg: BjConfig, cap = 0): { hands: HandResult[]; payout: number; outcome: Outcome } {
  const dealer = handValue(state.dealer).total;
  const hands: HandResult[] = state.hands.map((h) => {
    const bet = valued * h.bet;
    if (h.status === 'BLACKJACK') {
      if (state.dealerBJ) return { outcome: 'push' as Outcome, payout: bet };
      return { outcome: 'blackjack' as Outcome, payout: bet + (cfg.blackjackPays === '3:2' ? Math.floor((bet * 3) / 2) : Math.floor((bet * 6) / 5)) };
    }
    if (h.status === 'BUST') return { outcome: 'bust' as Outcome, payout: 0 };
    if (state.dealerBJ) return { outcome: 'lose' as Outcome, payout: 0 };
    const mine = handValue(h.cards).total;
    if (dealer > 21 || mine > dealer) return { outcome: 'win' as Outcome, payout: bet * 2 };
    if (mine === dealer) return { outcome: 'push' as Outcome, payout: bet };
    return { outcome: 'lose' as Outcome, payout: 0 };
  });
  let payout = hands.reduce((s, x) => s + x.payout, 0);
  if (cap > 0) payout = Math.min(payout, cap);
  // résultat global : le meilleur des résultats de ses mains
  const rank: Outcome[] = ['blackjack', 'win', 'push', 'lose', 'bust'];
  const outcome = hands.map((x) => x.outcome).sort((a, b) => rank.indexOf(a) - rank.indexOf(b))[0] ?? 'lose';
  return { hands, payout, outcome };
}

/** Points misés au total sur la partie (mise de départ + doublements + séparation), en mises de base. */
export const unitsBet = (s: State): number => s.hands.reduce((n, h) => n + h.bet, 0);
