import { DEFAULT_DICE, KINDS, MIN_MULT_H, allBets, multH, normalizeDice, payoutOf, probability, roll, rtp, wellFormed, wins, ways } from './dice';

describe('Dés : probabilités', () => {
  it('le nombre de combinaisons de chaque total est exact', () => {
    const expected: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
    for (const n of Object.keys(expected).map(Number)) expect(ways({ kind: 'EXACT', n })).toBe(expected[n]);
  });

  it('« moins que » et « plus que » comptent les bonnes combinaisons', () => {
    expect(ways({ kind: 'UNDER', n: 3 })).toBe(1); // seulement 2
    expect(ways({ kind: 'UNDER', n: 8 })).toBe(21); // 2 à 7
    expect(ways({ kind: 'OVER', n: 7 })).toBe(15); // 8 à 12
    expect(ways({ kind: 'OVER', n: 11 })).toBe(1);
    expect(ways({ kind: 'DOUBLES', n: 0 })).toBe(6);
  });

  it('moins que N et plus que N-1 s\'excluent et complètent le total', () => {
    for (let n = 3; n <= 12; n++) {
      const under = ways({ kind: 'UNDER', n }), atLeast = 36 - under; // total >= n
      const over = ways({ kind: 'OVER', n: n - 1 });
      expect(over).toBe(atLeast);
    }
  });

  it('les paris gagnants dépendent bien des deux dés', () => {
    expect(wins({ kind: 'EXACT', n: 7 }, 3, 4)).toBe(true);
    expect(wins({ kind: 'EXACT', n: 7 }, 3, 3)).toBe(false);
    expect(wins({ kind: 'DOUBLES', n: 0 }, 5, 5)).toBe(true);
    expect(wins({ kind: 'DOUBLES', n: 0 }, 5, 4)).toBe(false);
    expect(wins({ kind: 'UNDER', n: 7 }, 3, 3)).toBe(true);
    expect(wins({ kind: 'UNDER', n: 7 }, 3, 4)).toBe(false); // strictement moins
  });
});

describe('Dés : cotes et retour', () => {
  it('la cote est arrondie vers le bas et connue exactement', () => {
    // 6 combinaisons sur 36, marge 5 % : 0,95 × 36 ÷ 6 = 5,70
    expect(multH({ kind: 'EXACT', n: 7 }, 0.05)).toBe(570);
    // 1 combinaison : 0,95 × 36 = 34,2
    expect(multH({ kind: 'EXACT', n: 2 }, 0.05)).toBe(3420);
    // doubles : 6 combinaisons
    expect(multH({ kind: 'DOUBLES', n: 0 }, 0.05)).toBe(570);
    // plus que 7 : 15 combinaisons : 0,95 × 36 ÷ 15 = 2,28
    expect(multH({ kind: 'OVER', n: 7 }, 0.05)).toBe(228);
    // moins que 8 : 21 combinaisons : 0,95 × 36 ÷ 21 = 1,628 arrondi à 1,62
    expect(multH({ kind: 'UNDER', n: 8 }, 0.05)).toBe(162);
  });

  it('le retour exact ne dépasse jamais 100 % moins la marge, pour tous les paris et toutes les marges', () => {
    for (const edge of [0.01, 0.03, 0.05, 0.1, 0.2, 0.3]) {
      for (const b of allBets(edge)) {
        expect(rtp({ kind: b.kind, n: b.n }, edge)).toBeLessThanOrEqual(1 - edge + 1e-12);
      }
    }
  });

  it('un pari qui paierait moins que ×1,10 n\'est pas proposé', () => {
    expect(multH({ kind: 'UNDER', n: 12 }, 0.05)).toBeNull(); // 35 sur 36 : ×0,97
    expect(multH({ kind: 'OVER', n: 2 }, 0.05)).toBeNull();
    for (const b of allBets(0.05)) expect(b.mult * 100).toBeGreaterThanOrEqual(MIN_MULT_H);
  });

  it('refuse les paris mal formés', () => {
    expect(wellFormed({ kind: 'UNDER', n: 2 })).toBe(false); // jamais gagnant
    expect(wellFormed({ kind: 'OVER', n: 12 })).toBe(false);
    expect(wellFormed({ kind: 'EXACT', n: 13 })).toBe(false);
    expect(wellFormed({ kind: 'DOUBLES', n: 3 })).toBe(false);
    expect(wellFormed({ kind: 'EXACT', n: 7.5 })).toBe(false);
    expect(wellFormed({ kind: 'TRICHE' as any, n: 7 })).toBe(false);
    expect(multH({ kind: 'UNDER', n: 2 }, 0.05)).toBeNull();
  });

  it('chaque famille de paris est proposée et les cotes montent avec la rareté', () => {
    const bets = allBets(0.05);
    for (const k of KINDS) expect(bets.some((b) => b.kind === k)).toBe(true);
    expect(bets.find((b) => b.kind === 'EXACT' && b.n === 7)!.mult).toBeLessThan(bets.find((b) => b.kind === 'EXACT' && b.n === 3)!.mult);
    expect(bets.find((b) => b.kind === 'UNDER' && b.n === 8)!.p).toBeCloseTo(21 / 36);
  });

  it('les gains sont arrondis vers le bas et plafonnés', () => {
    expect(payoutOf(5, 570)).toBe(28); // 28,5
    expect(payoutOf(100, 3420)).toBe(3420);
    expect(payoutOf(100, 3420, 1000)).toBe(1000);
    expect(payoutOf(100, 3420, 0)).toBe(3420);
  });

  it('probabilité : somme de tous les totaux exacts = 1', () => {
    let s = 0;
    for (let n = 2; n <= 12; n++) s += probability({ kind: 'EXACT', n });
    expect(s).toBeCloseTo(1);
  });
});

describe('Dés : lancer', () => {
  it('chaque dé donne de 1 à 6 avec le générateur fourni', () => {
    expect(roll(() => 0)).toEqual([1, 1]);
    expect(roll(() => 5)).toEqual([6, 6]);
    let i = 0; const seq = [2, 4];
    expect(roll(() => seq[i++])).toEqual([3, 5]);
  });

  it('l\'énumération des 36 combinaisons rend exactement le retour calculé', () => {
    const edge = 0.05;
    for (const b of allBets(edge)) {
      let paid = 0;
      for (let a = 0; a < 6; a++) for (let c = 0; c < 6; c++) {
        let k = 0; const [d1, d2] = roll(() => [a, c][k++]);
        if (wins(b, d1, d2)) paid += payoutOf(100, Math.round(b.mult * 100));
      }
      expect(paid / (36 * 100)).toBeLessThanOrEqual(1 - edge + 1e-12);
      expect(paid / (36 * 100)).toBeGreaterThan(1 - edge - 0.05); // arrondis vers le bas : jamais très loin
    }
  });
});

describe('Dés : réglages', () => {
  it('garde les valeurs précédentes quand une valeur est invalide', () => {
    expect(normalizeDice({ minStake: 3, edge: 0.9, maxWin: -2, dailyFree: { stake: 'x' } })).toEqual(DEFAULT_DICE);
  });

  it('règle les valeurs valides', () => {
    const c = normalizeDice({ edge: 0.08, maxStake: 200, dailyLossMax: 500 });
    expect(c).toMatchObject({ edge: 0.08, maxStake: 200, dailyLossMax: 500 });
  });
});
