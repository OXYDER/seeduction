import { CHALLENGES, DEFAULT_CHALLENGES, TIERS, advancedBy, bonusStreak, challengeById, normalizeChallenges, pick, scaled } from './challenges';
import { challengeBus, emitChallenge } from './challenge-bus';

describe('Défis : catalogue', () => {
  it('les identifiants sont uniques et chaque défi a un objectif et une récompense', () => {
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
    for (const c of CHALLENGES) {
      expect(c.target).toBeGreaterThan(0);
      expect(c.points).toBeGreaterThan(0);
      expect(c.title.length).toBeGreaterThan(3);
      expect(c.desc.length).toBeGreaterThan(10);
    }
  });

  it('chaque niveau a plusieurs défis quotidiens et hebdomadaires à choisir', () => {
    for (const scope of ['daily', 'weekly'] as const) for (const tier of TIERS) expect(CHALLENGES.filter((c) => c.scope === scope && c.tier === tier).length).toBeGreaterThanOrEqual(scope === 'daily' ? 3 : 2);
  });

  it('aucun défi ne demande de miser des points : tous portent sur des activités gratuites', () => {
    const allowed = new Set(['wheel', 'quiz', 'quiz_correct', 'quiz_perfect', 'picks', 'picks_won', 'cards_open', 'cards_daily', 'free_play', 'distinct']);
    for (const c of CHALLENGES) expect(allowed.has(c.event)).toBe(true);
    for (const c of CHALLENGES) expect(`${c.title} ${c.desc}`).not.toMatch(/\bmise[rz]?\b|\bparie\b/i);
  });

  it('les récompenses restent modestes et croissent avec la difficulté', () => {
    const avg = (scope: string, tier: string) => { const l = CHALLENGES.filter((c) => c.scope === scope && c.tier === tier); return l.reduce((s, c) => s + c.points, 0) / l.length; };
    for (const scope of ['daily', 'weekly']) { expect(avg(scope, 'easy')).toBeLessThan(avg(scope, 'medium')); expect(avg(scope, 'medium')).toBeLessThan(avg(scope, 'hard')); }
    expect(Math.max(...CHALLENGES.filter((c) => c.scope === 'daily').map((c) => c.points))).toBeLessThanOrEqual(30);
  });
});

describe('Défis : tirage de la période', () => {
  it('trois défis, un par niveau, du bon type', () => {
    const day = pick('daily', '2026-10-17');
    expect(day.map((c) => c.tier)).toEqual(['easy', 'medium', 'hard']);
    day.forEach((c) => expect(c.scope).toBe('daily'));
    const week = pick('weekly', '2026-10-12');
    expect(week.map((c) => c.tier)).toEqual(['easy', 'medium', 'hard']);
    week.forEach((c) => expect(c.scope).toBe('weekly'));
  });

  it('le tirage est le même pour tous et ne change pas dans la journée', () => {
    expect(pick('daily', '2026-10-17').map((c) => c.id)).toEqual(pick('daily', '2026-10-17').map((c) => c.id));
  });

  it('les jours se suivent sans toujours se ressembler', () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 28; i++) seen.add(pick('daily', `2026-11-${String(i).padStart(2, '0')}`).map((c) => c.id).join(','));
    expect(seen.size).toBeGreaterThan(10);
  });
});

describe('Défis : réglages, points et séries', () => {
  it('garde les valeurs précédentes quand une valeur est invalide', () => {
    expect(normalizeChallenges({ rewardScale: 9999, minAccountDays: -1, dailyBonus: { points: 'x', packs: 99 } })).toEqual(DEFAULT_CHALLENGES);
  });

  it('règle les valeurs valides', () => {
    const c = normalizeChallenges({ rewardScale: 50, weeklyBonus: { points: 100, packs: 3 } });
    expect(c.rewardScale).toBe(50);
    expect(c.weeklyBonus).toEqual({ points: 100, packs: 3 });
    expect(c.dailyBonus).toEqual(DEFAULT_CHALLENGES.dailyBonus);
  });

  it('l\'échelle des points arrondit à l\'entier le plus proche', () => {
    expect(scaled(10, DEFAULT_CHALLENGES)).toBe(10);
    expect(scaled(25, { ...DEFAULT_CHALLENGES, rewardScale: 50 })).toBe(13);
    expect(scaled(25, { ...DEFAULT_CHALLENGES, rewardScale: 0 })).toBe(0);
    expect(scaled(25, { ...DEFAULT_CHALLENGES, rewardScale: 200 })).toBe(50);
  });

  it('un événement fait avancer le bon défi ; « jeux différents » avance à chaque jeu essayé', () => {
    const wheel = challengeById('d-wheel')!, four = challengeById('d-four')!, picks = challengeById('d-picks3')!;
    expect(advancedBy(wheel, 'wheel')).toBe(true);
    expect(advancedBy(wheel, 'quiz')).toBe(false);
    expect(advancedBy(picks, 'picks_won')).toBe(false);
    expect(advancedBy(four, 'quiz', 'quiz')).toBe(true);
    expect(advancedBy(four, 'picks_won')).toBe(false); // sans jeu précisé
  });

  it('la série de jours avec bonus compte jusqu\'à aujourd\'hui, ou hier si aujourd\'hui n\'est pas fini', () => {
    expect(bonusStreak([], '2026-10-17')).toBe(0);
    expect(bonusStreak(['2026-10-17', '2026-10-16', '2026-10-15'], '2026-10-17')).toBe(3);
    expect(bonusStreak(['2026-10-16', '2026-10-15'], '2026-10-17')).toBe(2);
    expect(bonusStreak(['2026-10-17', '2026-10-15'], '2026-10-17')).toBe(1);
    expect(bonusStreak(['2026-10-14'], '2026-10-17')).toBe(0);
    expect(bonusStreak(['2026-11-01', '2026-10-31'], '2026-11-01')).toBe(2);
  });
});

describe('Défis : bus d\'événements', () => {
  it('transmet les événements aux écouteurs et ne lève jamais d\'erreur', () => {
    const got: any[] = [];
    const listener = (e: any) => got.push(e);
    challengeBus.on('challenge', listener);
    emitChallenge({ userId: 'u1', event: 'wheel', game: 'wheel' });
    challengeBus.off('challenge', listener);
    expect(got).toEqual([{ userId: 'u1', event: 'wheel', game: 'wheel' }]);
    const boom = () => { throw new Error('écouteur défaillant'); };
    challengeBus.on('challenge', boom);
    expect(() => emitChallenge({ userId: 'u1', event: 'quiz' })).not.toThrow();
    challengeBus.off('challenge', boom);
  });
});
