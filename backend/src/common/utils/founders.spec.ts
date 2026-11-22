import { DEFAULT_FOUNDERS_CONFIG, FOUNDER, evaluateFounder, keepFounderRank, normalizeFoundersConfig, usernameProblem } from './founders';

const cfg = DEFAULT_FOUNDERS_CONFIG;
const now = new Date('2026-11-30T12:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86_400_000);
const base = { loginDays: 0, posts: 0, uploads: 0, feedback: 0, seedHours: 0, lastSeenAt: day(1) };

describe('evaluateFounder', () => {
  it('éligible avec deux critères sur cinq et une présence récente', () => {
    const v = evaluateFounder({ ...base, loginDays: 12, posts: 8 }, cfg, now);
    expect(v.met).toEqual(['loginDays', 'posts']);
    expect(v.eligible).toBe(true);
  });

  it('un seul critère ne suffit pas', () => {
    expect(evaluateFounder({ ...base, uploads: 40 }, cfg, now).eligible).toBe(false);
  });

  it('pas éligible sans présence récente, même avec tous les critères', () => {
    const m = { loginDays: 50, posts: 50, uploads: 5, feedback: 5, seedHours: 500, lastSeenAt: day(200) };
    const v = evaluateFounder(m, cfg, now);
    expect(v.met).toHaveLength(5);
    expect(v.recent).toBe(false);
    expect(v.eligible).toBe(false);
    expect(evaluateFounder({ ...m, lastSeenAt: null }, cfg, now).eligible).toBe(false);
  });

  it('présence non vérifiée quand le réglage est à 0 ; seuils exacts acceptés', () => {
    const lenient = { ...cfg, activeDays: 0 };
    expect(evaluateFounder({ ...base, loginDays: 5, feedback: 1, lastSeenAt: null }, lenient, now).eligible).toBe(true);
    expect(evaluateFounder({ ...base, loginDays: 4, posts: 4 }, cfg, now).met).toEqual([]);
  });

  it('un critère à 0 dans les réglages est ignoré (il ne compte pas comme rempli)', () => {
    expect(evaluateFounder({ ...base, posts: 10 }, { ...cfg, posts: 0 }, now).met).toEqual([]);
  });
});

describe('normalizeFoundersConfig', () => {
  it('valeurs par défaut : bêta finie le 22 novembre 2026, deux critères, 60 jours', () => {
    const c = normalizeFoundersConfig(undefined);
    expect(c).toEqual(cfg);
    expect(new Date(c.cutoff).getTime()).toBe(new Date('2026-11-23T05:00:00.000Z').getTime());
    expect(c.minCriteria).toBe(2);
  });
  it('borne les valeurs et garde la date précédente si la nouvelle est invalide', () => {
    expect(normalizeFoundersConfig({ minCriteria: 99 }).minCriteria).toBe(5);
    expect(normalizeFoundersConfig({ minCriteria: 0 }).minCriteria).toBe(1);
    expect(normalizeFoundersConfig({ cutoff: 'pas une date' }).cutoff).toBe(cfg.cutoff);
    expect(normalizeFoundersConfig({ cutoff: '2026-12-01' }).cutoff).toBe('2026-12-01T00:00:00.000Z');
    expect(normalizeFoundersConfig({ posts: '12' }).posts).toBe(12);
    expect(normalizeFoundersConfig({ activeDays: -3 }).activeDays).toBe(0);
  });
});

describe('avantages des fondateurs', () => {
  it('un fondateur ne descend jamais de rang, mais monte normalement', () => {
    expect(keepFounderRank(true, 3, 1)).toBe(true);
    expect(keepFounderRank(true, 1, 3)).toBe(false);
    expect(keepFounderRank(true, 2, 2)).toBe(false);
    expect(keepFounderRank(false, 3, 1)).toBe(false);
  });
  it('avantages mesurés : +5 % de points, 3 invitations, 3 jetons par an', () => {
    expect(FOUNDER).toEqual({ bonusMultiplier: 1.05, extraInvites: 3, yearlyTokens: 3 });
  });
});

describe('usernameProblem', () => {
  it('accepte un pseudo ordinaire', () => {
    expect(usernameProblem('Éric_77')).toBeNull();
    expect(usernameProblem('dark.hawk')).toBeNull();
  });
  it('refuse trop court, trop long, caractères spéciaux, noms réservés', () => {
    expect(usernameProblem('ab')).toMatch(/entre 3 et 24/);
    expect(usernameProblem('a'.repeat(25))).toMatch(/entre 3 et 24/);
    expect(usernameProblem('mauvais pseudo')).toMatch(/lettres/);
    expect(usernameProblem('a·b·c')).toMatch(/lettres/);
    expect(usernameProblem('Admin_officiel')).toMatch(/réservé/);
  });
});
