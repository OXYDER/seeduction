import { DECK, DEFAULT_HILO, MAX_RANK, MIN_RANK, RANKS, isWin, labelOf, nextMultBp, normalizeHiLo, odds, payoutOf, probability, rankOf, stepHundredths, suitOf } from './hilo';

describe('Plus haut ou plus bas : cartes', () => {
  it('52 cartes : valeurs de 2 à l\'as et quatre couleurs', () => {
    expect(DECK).toBe(52);
    const ranks = new Set<number>(), suits = new Set<string>();
    for (let c = 0; c < DECK; c++) { ranks.add(rankOf(c)); suits.add(suitOf(c)); }
    expect(ranks.size).toBe(13);
    expect(Math.min(...ranks)).toBe(MIN_RANK);
    expect(Math.max(...ranks)).toBe(MAX_RANK);
    expect(suits.size).toBe(4);
  });

  it('nomme les figures', () => {
    expect([labelOf(10), labelOf(11), labelOf(12), labelOf(13), labelOf(14)]).toEqual(['10', 'J', 'Q', 'K', 'A']);
  });
});

describe('Plus haut ou plus bas : probabilités et gains', () => {
  it('les probabilités sont comptées sur 13 valeurs, l\'égalité faisant perdre', () => {
    expect(probability(8, 'H')).toBeCloseTo(6 / 13);
    expect(probability(8, 'L')).toBeCloseTo(6 / 13);
    expect(probability(MAX_RANK, 'H')).toBe(0);
    expect(probability(MIN_RANK, 'L')).toBe(0);
    for (let r = MIN_RANK; r <= MAX_RANK; r++) expect(probability(r, 'H') + probability(r, 'L') + 1 / RANKS).toBeCloseTo(1);
  });

  it('une réponse impossible n\'a pas de multiplicateur', () => {
    expect(stepHundredths(MAX_RANK, 'H', 0.05)).toBeNull();
    expect(stepHundredths(MIN_RANK, 'L', 0.05)).toBeNull();
    expect(odds(MAX_RANK, 0.05).H).toBeNull();
    expect(odds(MAX_RANK, 0.05).L).not.toBeNull();
  });

  it('la maison garde sa marge à chaque réponse, pour toutes les cartes et les deux choix', () => {
    for (const edge of [0.02, 0.05, 0.1]) {
      for (let r = MIN_RANK; r <= MAX_RANK; r++) for (const g of ['H', 'L'] as const) {
        const h = stepHundredths(r, g, edge);
        if (h === null) continue;
        const ev = probability(r, g) * (h / 100); // retour attendu d'une étape
        expect(ev).toBeLessThanOrEqual(1 - edge + 0.0001 + (h === 101 ? 0.2 : 0));
      }
    }
  });

  it('un choix risqué paie plus qu\'un choix sûr', () => {
    expect(stepHundredths(13, 'H', 0.05)!).toBeGreaterThan(stepHundredths(13, 'L', 0.05)!); // un roi : plus haut est rare
    expect(stepHundredths(2, 'H', 0.05)!).toBeLessThan(stepHundredths(13, 'H', 0.05)!);
  });

  it('le multiplicateur cumulé s\'arrondit vers le bas et le gain aussi', () => {
    let bp = 10_000;
    bp = nextMultBp(bp, 129);
    expect(bp).toBe(12_900);
    bp = nextMultBp(bp, 103);
    expect(bp).toBe(13_287);
    expect(payoutOf(10, bp)).toBe(13);
    expect(payoutOf(100, bp)).toBe(132);
    expect(payoutOf(100, 1_000_000, 500)).toBe(500);
  });

  it('juge la réponse, l\'égalité faisant perdre', () => {
    expect(isWin(8, 9, 'H')).toBe(true);
    expect(isWin(8, 7, 'H')).toBe(false);
    expect(isWin(8, 8, 'H')).toBe(false);
    expect(isWin(8, 8, 'L')).toBe(false);
    expect(isWin(8, 2, 'L')).toBe(true);
  });

  it('une simulation de 200 000 séries toutes encaissées après 3 bonnes réponses rend moins de 100 %', () => {
    let seed = 20261017;
    const rnd = (n: number) => { seed = (seed * 1664525 + 1013904223) >>> 0; return Math.floor((seed / 4294967296) * n); };
    let staked = 0, paid = 0;
    for (let i = 0; i < 200_000; i++) {
      staked += 10;
      let rank = rankOf(rnd(DECK)), bp = 10_000, ok = true;
      for (let s = 0; s < 3 && ok; s++) {
        // stratégie : toujours le choix le plus probable (le plus rentable pour le joueur)
        const g = probability(rank, 'H') >= probability(rank, 'L') ? 'H' : 'L';
        const h = stepHundredths(rank, g, 0.05)!;
        const next = rankOf(rnd(DECK));
        if (isWin(rank, next, g)) { bp = nextMultBp(bp, h); rank = next; } else ok = false;
      }
      if (ok) paid += payoutOf(10, bp);
    }
    expect(paid / staked).toBeLessThan(1);
  });
});

describe('Plus haut ou plus bas : réglages', () => {
  it('garde les anciennes valeurs quand une valeur est invalide', () => {
    expect(normalizeHiLo({ edge: -1, minStake: 'x', maxStake: -3, idleMinutes: 0 })).toEqual(DEFAULT_HILO);
  });

  it('la marge reste entre 1 % et 30 %', () => {
    expect(normalizeHiLo({ edge: 0 }).edge).toBe(DEFAULT_HILO.edge);
    expect(normalizeHiLo({ edge: 0.5 }).edge).toBe(DEFAULT_HILO.edge);
    expect(normalizeHiLo({ edge: 0.08 }).edge).toBe(0.08);
  });

  it('arrondit les mises à un multiple de 5', () => {
    const c = normalizeHiLo({ minStake: 23, maxStake: 10 });
    expect(c.minStake % 5).toBe(0);
    expect(c.maxStake).toBeGreaterThanOrEqual(c.minStake);
  });
});
