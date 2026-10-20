import { compareEp, countdownLabel, daysUntil, epLabel, isNewForFollow, noticesFor, seriesKeyOf, torrentEp, FollowState } from './series-follow';

const NOW = Date.parse('2026-06-10T15:00:00Z'); // 11 h à Montréal

describe('numéros d\'épisodes', () => {
  it('libellé et lecture d\'un torrent', () => {
    expect(epLabel({ season: 2, episode: 5 })).toBe('S02E05');
    expect(epLabel(null)).toBe('');
    expect(torrentEp({ season: '02', episode: '5' })).toEqual({ season: 2, episode: 5 });
    expect(torrentEp({ season: null, episode: '5' })).toBeNull();
    expect(compareEp({ season: 1, episode: 10 }, { season: 2, episode: 1 })).toBeLessThan(0);
    expect(compareEp({ season: 2, episode: 3 }, { season: 2, episode: 3 })).toBe(0);
  });
  it('seule une fiche de série TMDB se suit', () => {
    expect(seriesKeyOf({ metaSource: 'tmdb', metaExternalId: '9', metadata: { kind: 'tv' } })).toEqual({ source: 'tmdb', id: '9' });
    expect(seriesKeyOf({ metaSource: 'tmdb', metaExternalId: '9', metadata: { kind: 'movie' } })).toBeNull();
    expect(seriesKeyOf({ metaSource: 'deezer', metaExternalId: '9', metadata: { kind: 'tv' } })).toBeNull();
    expect(seriesKeyOf({ metaSource: 'tmdb', metaExternalId: null })).toBeNull();
  });
});

describe('compte à rebours', () => {
  it('jours restants à l\'heure de Montréal', () => {
    expect(daysUntil('2026-06-10', NOW)).toBe(0);
    expect(daysUntil('2026-06-11', NOW)).toBe(1);
    expect(daysUntil('2026-06-17', NOW)).toBe(7);
    expect(daysUntil('2026-06-09', NOW)).toBe(-1);
    expect(daysUntil(null, NOW)).toBeNull();
    // 2 h UTC le 11 juin = 22 h le 10 juin à Montréal : on est encore le 10
    expect(daysUntil('2026-06-11', Date.parse('2026-06-11T02:00:00Z'))).toBe(1);
  });
  it('libellés', () => {
    expect(countdownLabel(0)).toBe('aujourd\'hui');
    expect(countdownLabel(1)).toBe('demain');
    expect(countdownLabel(5)).toBe('dans 5 jours');
    expect(countdownLabel(21)).toBe('dans 3 semaines');
    expect(countdownLabel(120)).toBe('dans 4 mois');
    expect(countdownLabel(-1)).toBe('sorti hier');
    expect(countdownLabel(null)).toBe('date inconnue');
  });
});

describe('noticesFor', () => {
  const base: FollowState = { nextAirDate: null, next: null, lastAirDate: null, last: null, notifiedSoon: null, notifiedAired: null };
  it('la veille de la sortie : une seule fois', () => {
    const s = { ...base, nextAirDate: '2026-06-11', next: { season: 2, episode: 5 } };
    expect(noticesFor(s, NOW)).toEqual([{ kind: 'soon', ep: { season: 2, episode: 5 } }]);
    expect(noticesFor({ ...s, notifiedSoon: '2x5' }, NOW)).toEqual([]);
    expect(noticesFor({ ...s, nextAirDate: '2026-06-14' }, NOW)).toEqual([]);
  });
  it('un épisode sorti aujourd\'hui ou hier est annoncé une fois ; un vieil épisode jamais', () => {
    const today = { ...base, lastAirDate: '2026-06-10', last: { season: 2, episode: 4 } };
    expect(noticesFor(today, NOW)).toEqual([{ kind: 'aired', ep: { season: 2, episode: 4 } }]);
    expect(noticesFor({ ...today, lastAirDate: '2026-06-09' }, NOW)).toHaveLength(1);
    expect(noticesFor({ ...today, lastAirDate: '2026-06-01' }, NOW)).toEqual([]);
    expect(noticesFor({ ...today, notifiedAired: '2x4' }, NOW)).toEqual([]);
  });
  it('sans information, rien', () => {
    expect(noticesFor(base, NOW)).toEqual([]);
  });
});

describe('isNewForFollow', () => {
  it('seuls les épisodes à partir du dernier connu au moment du suivi comptent', () => {
    const baseline = { season: 2, episode: 4 };
    expect(isNewForFollow({ season: 2, episode: 5 }, baseline)).toBe(true);
    expect(isNewForFollow({ season: 2, episode: 4 }, baseline)).toBe(true);
    expect(isNewForFollow({ season: 1, episode: 9 }, baseline)).toBe(false);
    expect(isNewForFollow({ season: 1, episode: 9 }, null)).toBe(true);
    expect(isNewForFollow(null, baseline)).toBe(false);
  });
});
