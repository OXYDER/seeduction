import { DEFAULT_PROFILE, DEFAULT_SLOTS, FREE_MULT, FREE_SPINS, PAYLINES, PROFILES, PROFILE_IDS, SCATTER, STRIPS, WILD, column, evaluateGrid, exactRtp, gridAt, linePay, normalizeSlotsConfig, playRound, resultAt, winOf, winTier } from './slots';

const P = PROFILES[DEFAULT_PROFILE];

describe('Machines à sous : règles', () => {
  it('chaque rouleau a 24 arrêts et des symboles valides', () => {
    for (const s of STRIPS) { expect(s).toHaveLength(24); expect(s.every((x) => x >= 0 && x <= 7)).toBe(true); }
  });

  it('le joker n\'est pas sur le premier rouleau', () => {
    expect(STRIPS[0].includes(WILD)).toBe(false);
  });

  it('lit trois symboles autour d\'un arrêt, en bouclant', () => {
    const strip = [0, 1, 2, 3];
    expect(column(strip, 0)).toEqual([3, 0, 1]);
    expect(column(strip, 3)).toEqual([2, 3, 0]);
  });

  it('trois symboles identiques paient selon la table du profil', () => {
    expect(linePay([0, 0, 0], P)).toBe(P.pay3[0]);
    expect(linePay([5, 5, 5], P)).toBe(P.pay3[5]);
    expect(linePay([3, 3, 3], P)).toBe(P.pay3[3]);
  });

  it('le joker remplace un symbole, trois jokers valent le meilleur', () => {
    expect(linePay([2, WILD, 2], P)).toBe(P.pay3[2]);
    expect(linePay([WILD, WILD, 1], P)).toBe(P.pay3[1]); // deux jokers et un symbole : trois symboles de ce type
    expect(linePay([WILD, WILD, WILD], P)).toBe(P.pay3[0]);
  });

  it('le bonus ne forme pas de ligne', () => {
    expect(linePay([SCATTER, SCATTER, SCATTER], P)).toBe(0);
    expect(linePay([0, SCATTER, 0], P)).toBe(0);
  });

  it('une paire à gauche paie, pour tous les symboles', () => {
    expect(linePay([5, 5, 3], P)).toBe(P.pair[5]);
    expect(linePay([2, 2, 4], P)).toBe(P.pair[2]);
    expect(linePay([0, WILD, 4], P)).toBe(P.pair[0]);
    expect(linePay([4, 4, SCATTER], P)).toBe(P.pair[4]); // un bonus au bout n'annule pas la paire
    expect(linePay([4, 3, 3], P)).toBe(0);
    expect(linePay([5, 5, 5], P)).toBe(P.pay3[5]);
    expect(linePay([5, 5, WILD], P)).toBe(P.pay3[5]);
  });

  it('évalue les cinq lignes et compte les bonus', () => {
    const grid = [[2, 2, 5], [2, 2, 5], [2, 7, 7]];
    const r = evaluateGrid(grid, P);
    expect(r.scatters).toBe(2);
    expect(PAYLINES).toHaveLength(5);
    expect(r.lines.find((l) => l.line === 0)?.mult).toBe(P.pay3[2]);
  });

  it('un gain est toujours un nombre entier de points pour une mise multiple de 5', () => {
    for (const stake of [5, 10, 25, 50, 100]) for (const mult of [1, 4, 8, 18, 40, 100, 401]) expect(Number.isInteger(winOf(mult, stake))).toBe(true);
  });
});

describe('Machines à sous : retour au joueur', () => {
  it('chaque profil rend toujours moins de 100 % : la maison reste gagnante à long terme', () => {
    for (const id of PROFILE_IDS) {
      const s = exactRtp(PROFILES[id]);
      expect(s.rtp).toBeLessThan(0.99);
      expect(s.rtp).toBeGreaterThan(0.9);
    }
  });

  it('les profils sont ordonnés : prudent < équilibré < généreux', () => {
    const r = (id: keyof typeof PROFILES) => exactRtp(PROFILES[id]).rtp;
    expect(r('prudent')).toBeLessThan(r('equilibre'));
    expect(r('equilibre')).toBeLessThan(r('genereux'));
  });

  it('le profil par défaut rend environ 95 %, avec beaucoup de gains qui rendent au moins la mise', () => {
    const s = exactRtp(P);
    expect(s.rtp).toBeGreaterThan(0.94);
    expect(s.rtp).toBeLessThan(0.97);
    expect(s.atLeastStake).toBeGreaterThan(0.25); // plus d'un tour sur quatre rend au moins la mise (avant même le bonus)
    expect(s.bonusRate).toBeGreaterThan(0.04); // le bonus tombe environ une fois sur vingt
    expect(s.maxMultiple).toBeGreaterThan(30);
  });

  it('une simulation de 400 000 parties reste proche du retour exact, pour chaque profil', () => {
    for (const id of PROFILE_IDS) {
      let seed = 987654321;
      const rng = (max: number) => { seed = (seed * 1664525 + 1013904223) >>> 0; return Math.floor((seed / 4294967296) * max); };
      let paid = 0, atLeast = 0; const n = 400_000;
      for (let i = 0; i < n; i++) { const w = playRound(10, rng, 0, PROFILES[id]).win; paid += w; if (w >= 10) atLeast++; }
      const exact = exactRtp(PROFILES[id]).rtp;
      expect(Math.abs(paid / (n * 10) - exact)).toBeLessThan(0.05);
      expect(atLeast / n).toBeGreaterThan(0.25); // les joueurs gagnent au moins leur mise assez souvent
    }
  });
});

describe('Machines à sous : parties', () => {
  it('trois bonus ou plus donnent cinq tours gratuits', () => {
    // l'arrêt 5 des trois rouleaux porte un bonus sur la rangée du milieu
    const r = resultAt([5, 5, 5], P);
    expect(r.scatters).toBeGreaterThanOrEqual(3);
    let calls = 0;
    const rng = () => { calls++; return calls <= 3 ? 5 : 0; };
    const round = playRound(10, rng, 0, P);
    expect(round.freeSpins).toBe(FREE_SPINS);
    expect(round.spins).toHaveLength(1 + FREE_SPINS);
    expect(round.spins.slice(1).every((s) => s.free)).toBe(true);
  });

  it('les gains des tours gratuits sont doublés', () => {
    let calls = 0;
    const rng = () => { calls++; return calls <= 3 ? 5 : 10; }; // premier tirage : trois bonus ; tours gratuits : le meilleur symbole sur la rangée du milieu
    const round = playRound(10, rng, 0, P);
    expect(round.freeSpins).toBe(FREE_SPINS);
    const free = round.spins.slice(1);
    expect(free.every((s) => s.mult >= P.pay3[0])).toBe(true);
    for (const s of free) expect(s.win).toBe(winOf(s.mult, 10) * FREE_MULT);
    expect(free[0].win).toBeGreaterThan(winOf(free[0].mult, 10));
  });

  it('les tours gratuits ne se redéclenchent pas', () => {
    const round = playRound(10, () => 5, 0, P);
    expect(round.freeSpins).toBe(FREE_SPINS);
    expect(round.spins).toHaveLength(1 + FREE_SPINS);
  });

  it('le plafond limite le gain total', () => {
    const round = playRound(100, () => 10, 500, P);
    expect(round.win).toBeLessThanOrEqual(500);
    expect(playRound(100, () => 10, 0, P).win).toBeGreaterThan(500);
  });

  it('classe les gains', () => {
    expect(winTier(0, 10)).toBe('none');
    expect(winTier(20, 10)).toBe('small');
    expect(winTier(100, 10)).toBe('big');
    expect(winTier(300, 10)).toBe('mega');
  });

  it('la grille est cohérente avec les arrêts', () => {
    expect(gridAt([0, 0, 0])[0]).toEqual(column(STRIPS[0], 0));
  });
});

describe('Machines à sous : réglages', () => {
  it('garde les anciennes valeurs quand une valeur est invalide', () => {
    expect(normalizeSlotsConfig({ minStake: -3, maxStake: 'x', dailyLossMax: 'abc', machines: { cinema: 'oui' }, profile: 'triche' })).toEqual(DEFAULT_SLOTS);
  });

  it('arrondit les mises à un multiple de 5 et garde max >= min', () => {
    const c = normalizeSlotsConfig({ minStake: 23, maxStake: 10 });
    expect(c.minStake % 5).toBe(0);
    expect(c.maxStake).toBeGreaterThanOrEqual(c.minStake);
  });

  it('active et coupe les machines une par une', () => {
    const c = normalizeSlotsConfig({ machines: { pirate: false }, dailyFree: { enabled: false } });
    expect(c.machines.pirate).toBe(false);
    expect(c.machines.cinema).toBe(true);
    expect(c.dailyFree.enabled).toBe(false);
  });

  it('accepte un profil valide et refuse un inconnu', () => {
    expect(normalizeSlotsConfig({ profile: 'genereux' }).profile).toBe('genereux');
    expect(normalizeSlotsConfig({ profile: 'tricheur' }).profile).toBe(DEFAULT_PROFILE);
  });
});
