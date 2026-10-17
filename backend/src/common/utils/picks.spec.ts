import { DEFAULT_PICKS, addDays, capped, isPerfectDay, normalizePicks, recordOf, streakOf, weekStart, winPoints, winnerOf } from './picks';

describe('Pronostics LNH : points', () => {
  it('la bonne prédiction rapporte les points de base, plus un bonus de série plafonné', () => {
    expect(winPoints(DEFAULT_PICKS, 0)).toBe(5);
    expect(winPoints(DEFAULT_PICKS, 3)).toBe(8);
    expect(winPoints(DEFAULT_PICKS, 5)).toBe(10);
    expect(winPoints(DEFAULT_PICKS, 40)).toBe(10);
    expect(winPoints(DEFAULT_PICKS, -2)).toBe(5);
  });

  it('les plafonds du jour et de la semaine limitent les points versés', () => {
    expect(capped(8, 0, 0, DEFAULT_PICKS)).toBe(8);
    expect(capped(8, 55, 0, DEFAULT_PICKS)).toBe(5); // reste 5 aujourd'hui
    expect(capped(8, 60, 0, DEFAULT_PICKS)).toBe(0);
    expect(capped(8, 0, 248, DEFAULT_PICKS)).toBe(2); // reste 2 cette semaine
    expect(capped(8, 0, 300, DEFAULT_PICKS)).toBe(0);
  });

  it('un plafond à 0 veut dire sans plafond', () => {
    const cfg = { ...DEFAULT_PICKS, dailyCap: 0, weeklyCap: 0 };
    expect(capped(8, 999, 999, cfg)).toBe(8);
  });

  it('la série compte les bonnes prédictions les plus récentes, en ignorant les annulées', () => {
    expect(streakOf([])).toBe(0);
    expect(streakOf(['WON', 'WON', 'LOST', 'WON'])).toBe(2);
    expect(streakOf(['LOST', 'WON'])).toBe(0);
    expect(streakOf(['WON', 'VOID', 'WON', 'LOST'])).toBe(2);
  });

  it('la journée parfaite demande assez de prédictions, toutes gagnées', () => {
    expect(isPerfectDay(['WON', 'WON', 'WON'], DEFAULT_PICKS)).toBe(true);
    expect(isPerfectDay(['WON', 'WON'], DEFAULT_PICKS)).toBe(false);
    expect(isPerfectDay(['WON', 'WON', 'LOST'], DEFAULT_PICKS)).toBe(false);
    expect(isPerfectDay(['WON', 'WON', 'WON', 'VOID'], DEFAULT_PICKS)).toBe(true);
    expect(isPerfectDay(['WON', 'WON', 'PENDING'], DEFAULT_PICKS)).toBe(false);
  });

  it('le vainqueur est le côté qui a marqué le plus', () => {
    expect(winnerOf(4, 2)).toBe('H');
    expect(winnerOf(1, 3)).toBe('A');
    expect(winnerOf(2, 2)).toBeNull();
    expect(winnerOf(null, 2)).toBeNull();
  });
});

describe('Pronostics LNH : calendrier', () => {
  it('ajoute des jours en traversant les mois, les années et les changements d\'heure', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09');
  });

  it('la semaine va du lundi au dimanche', () => {
    expect(weekStart('2026-10-17')).toBe('2026-10-12'); // samedi
    expect(weekStart('2026-10-12')).toBe('2026-10-12'); // lundi
    expect(weekStart('2026-10-18')).toBe('2026-10-12'); // dimanche
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
  });
});

describe('Pronostics LNH : réglages et fiches', () => {
  it('garde les valeurs précédentes quand une valeur est invalide', () => {
    expect(normalizePicks({ pointsPerWin: -1, daysAhead: 99, weeklyPrizes: ['x'], perfectMinGames: 0 })).toEqual(DEFAULT_PICKS);
  });

  it('règle les valeurs valides', () => {
    const c = normalizePicks({ pointsPerWin: 8, weeklyPrizes: [200, 100, 50], daysAhead: 2 });
    expect(c.pointsPerWin).toBe(8);
    expect(c.weeklyPrizes).toEqual([200, 100, 50]);
    expect(c.daysAhead).toBe(2);
  });

  it('lit la fiche d\'une équipe depuis le classement', () => {
    expect(recordOf({ wins: 7, losses: 2, otLosses: 1, points: 15, gamesPlayed: 10, l10Wins: 7, l10Losses: 2, l10OtLosses: 1, streakCode: 'W', streakCount: 2 }))
      .toEqual({ wins: 7, losses: 2, otLosses: 1, points: 15, gamesPlayed: 10, last10: '7-2-1', streak: 'W2' });
    expect(recordOf({ wins: 0, losses: 0, otLosses: 0 })).toMatchObject({ last10: '', streak: '' });
    expect(recordOf({})).toBeNull();
  });
});
