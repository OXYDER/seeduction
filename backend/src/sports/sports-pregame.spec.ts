import { DEFAULT_PRE_GAME, normalizePreGame, normalizeSportsConfig } from './sports.service';

describe('avant-match du Canadien', () => {
  it('activé par défaut, 15 minutes avant', () => {
    expect(DEFAULT_PRE_GAME).toEqual({ enabled: true, minutes: 15 });
    expect(normalizeSportsConfig({}).preGame).toEqual({ enabled: true, minutes: 15 });
  });
  it('délai borné entre 0 et 120, coupable, conservé si absent', () => {
    expect(normalizePreGame({ minutes: 30 }).minutes).toBe(30);
    expect(normalizePreGame({ minutes: 999 }).minutes).toBe(120);
    expect(normalizePreGame({ minutes: -4 }).minutes).toBe(0);
    expect(normalizePreGame({ enabled: false }).enabled).toBe(false);
    expect(normalizePreGame({ minutes: 'abc' }, { enabled: true, minutes: 20 }).minutes).toBe(20);
    expect(normalizePreGame({}, { enabled: false, minutes: 5 })).toEqual({ enabled: false, minutes: 5 });
  });
  it('les réglages du site gardent l\'avant-match en enregistrant autre chose', () => {
    const before = normalizeSportsConfig({ preGame: { enabled: false, minutes: 25 } });
    expect(normalizeSportsConfig({ team: 'MTL' }, before).preGame).toEqual({ enabled: false, minutes: 25 });
  });
});
