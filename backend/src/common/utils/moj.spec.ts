import { DEFAULT_MOJ, estimatePayout, freePrize, modeOf, normalizeMojConfig, settleMarket, validPick, winningPicks } from './moj';

const bet = (id: string, userId: string, stake: number, pick: string) => ({ id, userId, stake, pick });
const total = (m: Map<string, number>) => [...m.values()].reduce((s, n) => s + n, 0);

describe('Mise-O-jeu : partage de la caisse', () => {
  it('les gagnants se partagent toute la caisse au prorata de leur mise', () => {
    const s = settleMarket([bet('a', 'u1', 100, 'W'), bet('b', 'u2', 300, 'W'), bet('c', 'u3', 200, 'L')], 'W', 2);
    expect(s.refund).toBeNull();
    expect(s.payouts.get('a')).toBe(150);
    expect(s.payouts.get('b')).toBe(450);
    expect(s.payouts.has('c')).toBe(false);
  });

  it('ne perd et ne crée aucun point, même avec des restes', () => {
    const bets = [bet('a', 'u1', 10, 'W'), bet('b', 'u2', 10, 'W'), bet('c', 'u3', 10, 'W'), bet('d', 'u4', 11, 'L'), bet('e', 'u5', 13, 'L')];
    const s = settleMarket(bets, 'W', 2);
    expect(total(s.payouts)).toBe(54);
    for (const id of ['a', 'b', 'c']) expect([18, 19]).toContain(s.payouts.get(id));
  });

  it('rembourse si trop peu de joueurs', () => {
    const s = settleMarket([bet('a', 'u1', 50, 'W'), bet('b', 'u1', 50, 'L')], 'W', 2);
    expect(s.refund).toBe('players');
    expect(s.payouts.get('a')).toBe(50);
    expect(s.payouts.get('b')).toBe(50);
  });

  it('rembourse si personne n\'a gagné', () => {
    const s = settleMarket([bet('a', 'u1', 50, 'W'), bet('b', 'u2', 70, 'W')], 'L', 2);
    expect(s.refund).toBe('no-winner');
    expect(total(s.payouts)).toBe(120);
  });

  it('rembourse si tout le monde a gagné (personne à qui prendre la caisse)', () => {
    const s = settleMarket([bet('a', 'u1', 50, 'W'), bet('b', 'u2', 70, 'W')], 'W', 2);
    expect(s.refund).toBe('no-loser');
    expect(s.payouts.get('b')).toBe(70);
  });

  it('sans mise, rien à régler', () => {
    const s = settleMarket([], 'W', 2);
    expect(s.refund).toBeNull();
    expect(s.payouts.size).toBe(0);
  });

  it('conserve la caisse sur un grand nombre de paris', () => {
    const bets = Array.from({ length: 200 }, (_, i) => bet(`b${i}`, `u${i}`, 10 + (i * 7) % 90, i % 3 === 0 ? 'W' : 'L'));
    const pool = bets.reduce((s, b) => s + b.stake, 0);
    expect(total(settleMarket(bets, 'W', 2).payouts)).toBe(pool);
  });
});

describe('Mise-O-jeu : choix et résultats', () => {
  it('valide les choix', () => {
    expect(validPick('WIN', 'W')).toBe(true);
    expect(validPick('WIN', 'X')).toBe(false);
    expect(validPick('MODE', 'SO')).toBe(true);
    expect(validPick('MODE', 'W')).toBe(false);
    expect(validPick('SCORE', '3-2')).toBe(true);
    expect(validPick('SCORE', '16-2')).toBe(false);
    expect(validPick('SCORE', '3-')).toBe(false);
    expect(validPick('SCORE', 12)).toBe(false);
  });

  it('déduit le mode de fin de match du libellé de la LNH', () => {
    expect(modeOf('Final')).toBe('REG');
    expect(modeOf('Final (prolongation)')).toBe('OT');
    expect(modeOf('Final (tirs de barrage)')).toBe('SO');
    expect(modeOf(null)).toBe('REG');
  });

  it('donne le choix gagnant de chaque pari', () => {
    expect(winningPicks({ mine: 4, theirs: 3, mode: 'SO' })).toEqual({ WIN: 'W', MODE: 'SO', SCORE: '4-3' });
    expect(winningPicks({ mine: 1, theirs: 2, mode: 'OT' })).toEqual({ WIN: 'L', MODE: 'OT', SCORE: '1-2' });
  });

  it('estime le gain d\'une nouvelle mise', () => {
    expect(estimatePayout(300, 100, 100)).toBe(200);
    expect(estimatePayout(0, 0, 100)).toBe(100);
    expect(estimatePayout(300, 100, 0)).toBe(0);
  });
});

describe('Mise-O-jeu : réglages et pronostics gratuits', () => {
  it('garde les anciennes valeurs quand une valeur est invalide', () => {
    const c = normalizeMojConfig({ minStake: -5, maxStake: 'abc', minPlayers: 1, freePrize: { WIN: 99999999 } });
    expect(c.minStake).toBe(DEFAULT_MOJ.minStake);
    expect(c.maxStake).toBe(DEFAULT_MOJ.maxStake);
    expect(c.minPlayers).toBe(DEFAULT_MOJ.minPlayers);
    expect(c.freePrize.WIN).toBe(DEFAULT_MOJ.freePrize.WIN);
  });

  it('accepte des valeurs valides et garde mise max >= mise min', () => {
    const c = normalizeMojConfig({ minStake: 50, maxStake: 20, enabled: false, markets: { SCORE: false }, preseason: true });
    expect(c.minStake).toBe(50);
    expect(c.maxStake).toBe(50);
    expect(c.enabled).toBe(false);
    expect(c.markets).toEqual({ WIN: true, MODE: true, SCORE: false });
    expect(c.preseason).toBe(true);
  });

  it('limite la récompense gratuite au plafond hebdomadaire', () => {
    expect(freePrize(DEFAULT_MOJ, 'WIN', 0)).toBe(10);
    expect(freePrize(DEFAULT_MOJ, 'SCORE', 80)).toBe(20);
    expect(freePrize(DEFAULT_MOJ, 'SCORE', 100)).toBe(0);
    expect(freePrize(DEFAULT_MOJ, 'SCORE', 150)).toBe(0);
  });
});
