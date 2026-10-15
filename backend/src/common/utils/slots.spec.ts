import { DEFAULT_SLOTS, FREE_SPINS, PAYLINES, SCATTER, STRIPS, WILD, column, evaluateGrid, exactRtp, gridAt, linePay, normalizeSlotsConfig, playRound, resultAt, winOf, winTier } from './slots';

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

  it('trois symboles identiques paient selon la table', () => {
    expect(linePay([0, 0, 0])).toBe(400);
    expect(linePay([5, 5, 5])).toBe(4);
    expect(linePay([3, 3, 3])).toBe(18);
  });

  it('le joker remplace un symbole, trois jokers valent le meilleur', () => {
    expect(linePay([2, WILD, 2])).toBe(40);
    expect(linePay([WILD, WILD, 1])).toBe(100);
    expect(linePay([WILD, WILD, WILD])).toBe(400);
  });

  it('le bonus ne forme pas de ligne', () => {
    expect(linePay([SCATTER, SCATTER, SCATTER])).toBe(0);
    expect(linePay([0, SCATTER, 0])).toBe(0);
  });

  it('deux symboles de base à gauche paient un petit gain', () => {
    expect(linePay([5, 5, 3])).toBe(1);
    expect(linePay([5, WILD, 4])).toBe(1);
    expect(linePay([4, 4, 3])).toBe(0);
    expect(linePay([5, 5, 5])).toBe(4);
    expect(linePay([5, 5, WILD])).toBe(4);
  });

  it('évalue les cinq lignes et compte les bonus', () => {
    const grid = [[2, 2, 5], [2, 2, 5], [2, 7, 7]];
    const r = evaluateGrid(grid);
    expect(r.scatters).toBe(2);
    expect(PAYLINES).toHaveLength(5);
    expect(r.lines.find((l) => l.line === 0)?.mult).toBe(40);
  });

  it('un gain est toujours un nombre entier de points pour une mise multiple de 5', () => {
    for (const stake of [5, 10, 25, 50, 100]) for (const mult of [1, 4, 8, 18, 40, 100, 401]) expect(Number.isInteger(winOf(mult, stake))).toBe(true);
  });
});

describe('Machines à sous : retour au joueur', () => {
  const stats = exactRtp();

  it('le retour exact au joueur est d\'environ 90 % : le site gagne plus que les joueurs, à long terme', () => {
    expect(stats.rtp).toBeGreaterThan(0.88);
    expect(stats.rtp).toBeLessThan(0.93);
  });

  it('le jeu donne de petits gains fréquents et de gros gains rares', () => {
    expect(stats.hitRate).toBeGreaterThan(0.5);
    expect(stats.bonusRate).toBeGreaterThan(0.005);
    expect(stats.bonusRate).toBeLessThan(0.03);
    expect(stats.maxMultiple).toBeGreaterThan(50);
  });

  it('une simulation de 300 000 parties reste proche du retour exact', () => {
    // générateur pseudo-aléatoire déterministe (le test doit toujours donner le même résultat)
    let seed = 123456789;
    const rng = (max: number) => { seed = (seed * 1664525 + 1013904223) >>> 0; return Math.floor((seed / 4294967296) * max); };
    let paid = 0; const n = 300_000;
    for (let i = 0; i < n; i++) paid += playRound(10, rng).win;
    const rtp = paid / (n * 10);
    expect(Math.abs(rtp - stats.rtp)).toBeLessThan(0.05);
  });
});

describe('Machines à sous : parties', () => {
  it('trois bonus ou plus donnent cinq tours gratuits', () => {
    // les arrêts 5 et 18 des trois rouleaux portent un bonus : visibles ensemble sur la rangée du milieu
    const stops = [5, 5, 5];
    const r = resultAt(stops);
    expect(r.scatters).toBeGreaterThanOrEqual(3);
    let calls = 0;
    const rng = () => { calls++; return calls <= 3 ? 5 : 0; };
    const round = playRound(10, rng);
    expect(round.freeSpins).toBe(FREE_SPINS);
    expect(round.spins).toHaveLength(1 + FREE_SPINS);
    expect(round.spins.slice(1).every((s) => s.free)).toBe(true);
  });

  it('les tours gratuits ne se redéclenchent pas', () => {
    const round = playRound(10, () => 5);
    expect(round.freeSpins).toBe(FREE_SPINS);
    expect(round.spins).toHaveLength(1 + FREE_SPINS);
  });

  it('le plafond limite le gain total', () => {
    const round = playRound(100, () => 10, 500); // arrêt 10 = le meilleur symbole sur les trois rouleaux
    expect(round.win).toBeLessThanOrEqual(500);
    expect(playRound(100, () => 10).win).toBeGreaterThan(500);
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
    expect(normalizeSlotsConfig({ minStake: -3, maxStake: 'x', dailyLossMax: 'abc', machines: { cinema: 'oui' } })).toEqual(DEFAULT_SLOTS);
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
});
