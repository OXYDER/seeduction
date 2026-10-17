import { Action, BjConfig, DEFAULT_BJ, Draw, State, act, drawFromShoe, handValue, isBlackjack, legalActions, newGame, normalizeBj, settle, standAll, unitsBet, valueOf } from './blackjack';
import { seededRandom } from './quiz';

/** Code de carte pour une valeur (2 à 14, 14 = as) : la couleur n'a aucune importance au blackjack. */
const c = (rank: number) => rank - 2;
const A = 14, K = 13, Q = 12, J = 11;
/** Tireur qui sort les valeurs données, dans l'ordre. */
const seq = (...ranks: number[]): Draw => { let i = 0; return () => { if (i >= ranks.length) throw new Error('plus de cartes imposées'); return c(ranks[i++]); }; };
const cfg = (over: Partial<BjConfig> = {}): BjConfig => ({ ...DEFAULT_BJ, ...over });
// ordre de distribution : joueur, croupier (visible), joueur, croupier (cachée)

describe('Blackjack : cartes et mains', () => {
  it('valeurs des cartes', () => {
    expect([valueOf(c(2)), valueOf(c(10)), valueOf(c(J)), valueOf(c(K)), valueOf(c(A))]).toEqual([2, 10, 10, 10, 11]);
  });

  it('total dur et souple', () => {
    expect(handValue([c(A), c(K)])).toEqual({ total: 21, soft: true });
    expect(handValue([c(A), c(6)])).toEqual({ total: 17, soft: true });
    expect(handValue([c(A), c(6), c(10)])).toEqual({ total: 17, soft: false });
    expect(handValue([c(A), c(A), c(9)])).toEqual({ total: 21, soft: true });
    expect(handValue([c(A), c(A), c(A)])).toEqual({ total: 13, soft: true });
    expect(handValue([c(10), c(6), c(5)])).toEqual({ total: 21, soft: false });
    expect(handValue([c(K), c(Q), c(5)]).total).toBe(25);
  });

  it('seules deux cartes faisant 21 forment un blackjack', () => {
    expect(isBlackjack([c(A), c(J)])).toBe(true);
    expect(isBlackjack([c(7), c(7), c(7)])).toBe(false);
  });
});

describe('Blackjack : distribution', () => {
  it('distribue joueur, croupier, joueur, croupier', () => {
    const s = newGame(seq(10, 6, 8, 9));
    expect(s.hands[0].cards.map((x) => x + 2)).toEqual([10, 8]);
    expect(s.dealer.map((x) => x + 2)).toEqual([6, 9]);
    expect(s.phase).toBe('PLAYER');
    expect(s.dealt).toHaveLength(4);
  });

  it('blackjack du joueur : la partie s\'arrête, paiement 3 pour 2', () => {
    const s = newGame(seq(A, 5, K, 9));
    expect(s.phase).toBe('DONE');
    expect(s.hands[0].status).toBe('BLACKJACK');
    expect(settle(s, 10, cfg()).hands[0]).toEqual({ outcome: 'blackjack', payout: 25 });
  });

  it('le croupier regarde sa carte cachée sous un as ou une figure : blackjack, la partie s\'arrête', () => {
    const s = newGame(seq(10, A, 9, K));
    expect(s.dealerBJ).toBe(true);
    expect(s.phase).toBe('DONE');
    expect(settle(s, 10, cfg())).toMatchObject({ payout: 0, outcome: 'lose' });
    const both = newGame(seq(A, K, K, A));
    expect(settle(both, 10, cfg())).toMatchObject({ payout: 10, outcome: 'push' }); // les deux ont un blackjack : mise rendue
  });

  it('un as caché sous un petit nombre n\'est pas un blackjack', () => {
    const s = newGame(seq(10, 5, 9, A));
    expect(s.dealerBJ).toBe(false);
    expect(s.phase).toBe('PLAYER');
  });
});

describe('Blackjack : coups du joueur', () => {
  it('tirer jusqu\'à dépasser 21 perd, sans que le croupier joue', () => {
    let s = newGame(seq(10, 6, 6, 9));
    s = act(s, 'hit', seq(10), cfg());
    expect(s.phase).toBe('DONE');
    expect(s.hands[0].status).toBe('BUST');
    expect(s.dealer).toHaveLength(2); // inutile de tirer quand le joueur a perdu
    expect(settle(s, 10, cfg())).toMatchObject({ payout: 0, outcome: 'bust' });
  });

  it('atteindre 21 arrête la main d\'office', () => {
    let s = newGame(seq(10, 10, 5, 7));
    s = act(s, 'hit', seq(6), cfg());
    expect(s.hands[0].status).toBe('STAND');
    expect(s.phase).toBe('DONE');
    expect(settle(s, 10, cfg())).toMatchObject({ payout: 20, outcome: 'win' }); // 21 contre 17
  });

  it('rester : le croupier tire jusqu\'à 17 et un dépassement fait gagner le joueur', () => {
    let s = newGame(seq(10, 6, 8, 10));
    s = act(s, 'stand', seq(9), cfg()); // croupier 16 -> 25
    expect(s.dealer.map((x) => x + 2)).toEqual([6, 10, 9]);
    expect(settle(s, 10, cfg())).toMatchObject({ payout: 20, outcome: 'win' });
  });

  it('égalité : la mise est rendue ; croupier plus fort : perdu', () => {
    const tie = act(newGame(seq(10, 9, 8, 9)), 'stand', seq(), cfg()); // 18 contre 18
    expect(settle(tie, 10, cfg())).toMatchObject({ payout: 10, outcome: 'push' });
    const lose = act(newGame(seq(10, 10, 7, 9)), 'stand', seq(), cfg()); // 17 contre 19
    expect(settle(lose, 10, cfg())).toMatchObject({ payout: 0, outcome: 'lose' });
  });

  it('le croupier tire sur un 17 souple par défaut, et reste dessus si la règle le demande', () => {
    const base = () => newGame(seq(10, A, 9, 6)); // croupier A + 6 = 17 souple ; joueur 19
    const stays = act(base(), 'stand', seq(), cfg({ dealerHitsSoft17: false }));
    expect(stays.dealer).toHaveLength(2);
    expect(settle(stays, 10, cfg()).outcome).toBe('win');
    const hits = act(base(), 'stand', seq(5, 10), cfg()); // 17 souple + 5 = 12 dur -> tire encore (10 : 22)
    expect(hits.dealer.length).toBeGreaterThan(2);
  });

  it('doubler : une seule carte, la mise double, le gain aussi', () => {
    let s = newGame(seq(5, 6, 6, 10)); // joueur 11 contre 6/10
    expect(legalActions(s, cfg())).toEqual(['hit', 'stand', 'double']);
    s = act(s, 'double', seq(10, 5), cfg()); // joueur 21, croupier 16 -> 21? 6+10=16 puis tire 5 = 21
    expect(s.hands[0].bet).toBe(2);
    expect(s.hands[0].cards).toHaveLength(3);
    expect(unitsBet(s)).toBe(2);
    expect(settle(s, 10, cfg())).toMatchObject({ payout: 20, outcome: 'push' }); // 21 contre 21 : la mise doublée (20) est rendue
  });

  it('doubler puis gagner paie le double', () => {
    let s = newGame(seq(5, 6, 6, 10));
    s = act(s, 'double', seq(10, 9), cfg()); // joueur 21, croupier 16 + 9 = 25
    expect(settle(s, 10, cfg())).toMatchObject({ payout: 40, outcome: 'win' });
  });

  it('on ne peut pas doubler après avoir tiré', () => {
    const s = act(newGame(seq(2, 6, 3, 10)), 'hit', seq(2), cfg());
    expect(legalActions(s, cfg())).toEqual(['hit', 'stand']);
    expect(() => act(s, 'double', seq(2), cfg())).toThrow('Coup non permis');
  });

  it('séparer une paire : deux mains, chacune reçoit sa carte à son tour, une seule séparation', () => {
    let s = newGame(seq(8, 6, 8, 10));
    expect(legalActions(s, cfg())).toContain('split');
    s = act(s, 'split', seq(3), cfg());
    expect(s.hands).toHaveLength(2);
    expect(s.hands[0].cards.map((x) => x + 2)).toEqual([8, 3]);
    expect(s.hands[1].cards).toHaveLength(1);
    expect(s.cur).toBe(0);
    expect(unitsBet(s)).toBe(2);
    expect(legalActions(s, cfg())).not.toContain('split'); // pas de nouvelle séparation
    s = act(s, 'stand', seq(4), cfg()); // la 2e main reçoit sa 2e carte (4) et attend
    expect(s.cur).toBe(1);
    expect(s.hands[1].cards.map((x) => x + 2)).toEqual([8, 4]);
    s = act(s, 'stand', seq(10), cfg()); // croupier 16 + 10 = 26
    expect(s.phase).toBe('DONE');
    expect(settle(s, 10, cfg())).toMatchObject({ payout: 40, outcome: 'win' });
  });

  it('as séparés : un seul coup chacun et un 21 compte comme 21, pas comme blackjack', () => {
    let s = newGame(seq(A, 6, A, 10));
    s = act(s, 'split', seq(K, 5, 5), cfg()); // A+K = 21, A+5 = 16 ; croupier 16 + 5 = 21
    expect(s.hands.map((h) => h.status)).toEqual(['STAND', 'STAND']);
    expect(s.hands.every((h) => h.cards.length === 2)).toBe(true);
    expect(s.phase).toBe('DONE');
    const r = settle(s, 10, cfg());
    expect(r.hands[0].outcome).toBe('push'); // 21 contre 21 : pas de paiement 3 pour 2
    expect(r.hands[1].outcome).toBe('lose');
  });

  it('doubler après séparation selon le réglage', () => {
    const s = act(newGame(seq(8, 6, 8, 10)), 'split', seq(3), cfg());
    expect(legalActions(s, cfg())).toContain('double');
    expect(legalActions(s, cfg({ doubleAfterSplit: false }))).not.toContain('double');
  });

  it('un 21 sur la première main séparée passe tout de suite à la suivante', () => {
    let s = newGame(seq(8, 6, 8, 10));
    s = act(s, 'split', seq(A, 2), cfg()); // 8 + A = 19, pas 21 : la main attend
    expect(s.cur).toBe(0);
    const t = act(newGame(seq(K, 6, K, 10)), 'split', seq(A, 2), cfg()); // K + A = 21 : auto-stand, 2e main reçoit 2 et attend
    expect(t.hands[0].status).toBe('STAND');
    expect(t.cur).toBe(1);
  });

  it('toutes les mains perdues : le croupier ne tire pas', () => {
    let s = newGame(seq(10, 6, 10, 9));
    s = act(s, 'hit', seq(K), cfg());
    expect(s.dealer).toHaveLength(2);
  });

  it('ne rien faire revient à rester', () => {
    const s = standAll(newGame(seq(10, 6, 7, 10)), seq(10), cfg());
    expect(s.phase).toBe('DONE');
  });

  it('refuse un coup quand la partie est finie', () => {
    const done = newGame(seq(A, 5, K, 9));
    expect(() => act(done, 'hit', seq(2), cfg())).toThrow();
    expect(legalActions(done, cfg())).toEqual([]);
  });
});

describe('Blackjack : paiements', () => {
  it('le blackjack paie 3 pour 2 ou 6 pour 5, arrondi vers le bas', () => {
    const s = newGame(seq(A, 5, K, 9));
    expect(settle(s, 10, cfg()).payout).toBe(25);
    expect(settle(s, 5, cfg()).payout).toBe(5 + 7); // 7,5 arrondi à 7
    expect(settle(s, 10, cfg({ blackjackPays: '6:5' })).payout).toBe(22);
  });

  it('le gain maximal plafonne le total', () => {
    const s = newGame(seq(A, 5, K, 9));
    expect(settle(s, 100, cfg(), 120).payout).toBe(120);
    expect(settle(s, 100, cfg(), 0).payout).toBe(250);
  });
});

describe('Blackjack : réglages', () => {
  it('garde les valeurs précédentes quand une valeur est invalide', () => {
    expect(normalizeBj({ minStake: 3, decks: 99, blackjackPays: '2:1', idleMinutes: 1 })).toEqual(DEFAULT_BJ);
  });

  it('règle les valeurs valides', () => {
    const n = normalizeBj({ blackjackPays: '6:5', dealerHitsSoft17: true, decks: 8, maxStake: 200, cashback: true });
    expect(n).toMatchObject({ blackjackPays: '6:5', dealerHitsSoft17: true, decks: 8, maxStake: 200, cashback: true });
  });
});

describe('Blackjack : sabot', () => {
  it('le tirage sans remise est exact : chaque carte sort autant de fois qu\'il y en a dans le sabot', () => {
    const counts = new Array(52).fill(0);
    for (let r = 0; r < 6 * 52; r++) counts[drawFromShoe([], 6, () => r)]++;
    expect(counts.every((n) => n === 6)).toBe(true);
  });

  it('les cartes déjà sorties ne reviennent pas au-delà de leur nombre', () => {
    const rnd = seededRandom('sabot');
    const dealt: number[] = [];
    for (let i = 0; i < 2 * 52; i++) dealt.push(drawFromShoe(dealt, 2, (n) => Math.floor(rnd() * n)));
    const counts = new Array(52).fill(0);
    dealt.forEach((x) => counts[x]++);
    expect(counts.every((n) => n === 2)).toBe(true);
    expect(() => drawFromShoe(dealt, 2, () => 0)).toThrow('Sabot vide');
  });
});

// ---------------------------------------------------------------- simulation

/** Stratégie de base (6 jeux, croupier sur tous les 17, doublement après séparation permis) : joue au mieux, pour mesurer le retour réel. */
function basic(s: State, c: BjConfig): Action {
  const h = s.hands[s.cur];
  const legal = legalActions(s, c);
  const up = valueOf(s.dealer[0]); // 2 à 11
  const { total, soft } = handValue(h.cards);
  const can = (a: Action) => legal.includes(a);
  const dbl = (otherwise: Action): Action => (can('double') ? 'double' : otherwise);
  if (can('split')) {
    const v = valueOf(h.cards[0]);
    const split = v === 11 || v === 8 || (v === 9 && ![7, 10, 11].includes(up)) || (v === 7 && up <= 7) || (v === 6 && up <= 6) || (v === 4 && (up === 5 || up === 6)) || ((v === 2 || v === 3) && up <= 7);
    if (split) return 'split';
  }
  if (soft && h.cards.length >= 2) {
    if (total >= 19) return 'stand';
    if (total === 18) return up >= 9 ? 'hit' : up === 2 || up === 7 || up === 8 ? 'stand' : dbl('stand') === 'double' && up >= 3 && up <= 6 ? 'double' : 'stand';
    if (total === 17) return up >= 3 && up <= 6 ? dbl('hit') : 'hit';
    if (total === 15 || total === 16) return up >= 4 && up <= 6 ? dbl('hit') : 'hit';
    return up === 5 || up === 6 ? dbl('hit') : 'hit';
  }
  if (total >= 17) return 'stand';
  if (total >= 13) return up <= 6 ? 'stand' : 'hit';
  if (total === 12) return up >= 4 && up <= 6 ? 'stand' : 'hit';
  if (total === 11) return up === 11 ? 'hit' : dbl('hit');
  if (total === 10) return up <= 9 ? dbl('hit') : 'hit';
  if (total === 9) return up >= 3 && up <= 6 ? dbl('hit') : 'hit';
  return 'hit';
}

/** Joueur qui imite le croupier (tire jusqu'à 17, ne double ni ne sépare jamais). */
function mimic(s: State): Action {
  return handValue(s.hands[s.cur].cards).total < 17 ? 'hit' : 'stand';
}

function simulate(hands: number, seed: string, strategy: (s: State, c: BjConfig) => Action, conf: BjConfig) {
  const rnd = seededRandom(seed);
  const draw: Draw = (dealt) => drawFromShoe(dealt, conf.decks, (n) => Math.floor(rnd() * n));
  let bet = 0, back = 0, bj = 0, wins = 0;
  const VALUED = 100; // évite les arrondis du paiement 3 pour 2
  for (let i = 0; i < hands; i++) {
    let s = newGame(draw);
    while (s.phase === 'PLAYER') s = act(s, strategy(s, conf), draw, conf);
    const r = settle(s, VALUED, conf);
    bet += unitsBet(s) * VALUED; back += r.payout;
    if (r.outcome === 'blackjack') bj++;
    if (r.payout > unitsBet(s) * VALUED) wins++;
  }
  return { rtp: back / bet, bjRate: bj / hands, winRate: wins / hands };
}

describe('Blackjack : retour au joueur (simulation à graine fixe)', () => {
  const N = 400_000;

  it('avec la stratégie de base, le retour reste sous 100 % (la maison garde un petit avantage)', () => {
    const r = simulate(N, 'bj-basic', basic, cfg());
    // simulation de 1 million de mains : environ 99,4 % pour ces règles (99,7 % si le croupier reste sur 17 souple) ; marge pour le bruit statistique de la simulation (écart-type ≈ 0,2 %)
    expect(r.rtp).toBeGreaterThan(0.985);
    expect(r.rtp).toBeLessThan(1.0);
    expect(r.bjRate).toBeGreaterThan(0.04);
    expect(r.bjRate).toBeLessThan(0.05); // 4,75 % des mains
  });

  it('un joueur qui imite le croupier perd beaucoup plus', () => {
    const r = simulate(N / 2, 'bj-mimic', mimic, cfg());
    expect(r.rtp).toBeLessThan(0.97);
    expect(r.rtp).toBeGreaterThan(0.9);
  });

  it('le paiement 6 pour 5 rapproche encore la maison', () => {
    const generous = simulate(N, 'bj-cmp', basic, cfg());
    const stingy = simulate(N, 'bj-cmp', basic, cfg({ blackjackPays: '6:5' }));
    expect(stingy.rtp).toBeLessThan(generous.rtp - 0.008);
  });
});
