import { bestDay, compare, dailyGains, monthKeyOf, monthRange, previousMonth, summarizeWatching, tzOffsetMinutes } from './recap';

const GB = 1e9;
const snap = (iso: string, up: number, down = 0) => ({ takenAt: new Date(iso), uploaded: up * GB, downloaded: down * GB });

describe('monthRange', () => {
  it('bornes à l\'heure de Montréal (heure d\'été : UTC-4, heure d\'hiver : UTC-5)', () => {
    const jun = monthRange('2026-06')!;
    expect(jun.start.toISOString()).toBe('2026-06-01T04:00:00.000Z');
    expect(jun.end.toISOString()).toBe('2026-07-01T04:00:00.000Z');
    expect(jun.days).toBe(30);
    expect(jun.label).toBe('juin 2026');
    const dec = monthRange('2026-12')!;
    expect(dec.start.toISOString()).toBe('2026-12-01T05:00:00.000Z');
    expect(dec.end.toISOString()).toBe('2027-01-01T05:00:00.000Z');
    expect(monthRange('2026-02')!.days).toBe(28);
  });
  it('refuse une clé invalide', () => {
    expect(monthRange('2026-13')).toBeNull();
    expect(monthRange('juin')).toBeNull();
    expect(monthRange('')).toBeNull();
  });
  it('décalage de fuseau et mois précédent', () => {
    expect(tzOffsetMinutes(new Date('2026-07-01T12:00:00Z'))).toBe(-240);
    expect(tzOffsetMinutes(new Date('2026-01-15T12:00:00Z'))).toBe(-300);
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-06')).toBe('2026-05');
    expect(monthKeyOf(new Date('2026-07-01T02:00:00Z'))).toBe('2026-06'); // 22 h le 30 juin à Montréal
  });
});

describe('dailyGains et bestDay', () => {
  const range = monthRange('2026-06')!;
  it('l\'écart entre deux relevés de nuit décrit la journée précédente', () => {
    // relevés à 3 h UTC (23 h la veille à Montréal) : le relevé du 5 juin 3 h décrit la journée du 4 juin
    const days = dailyGains([snap('2026-06-04T03:00:00Z', 110), snap('2026-06-05T03:00:00Z', 160), snap('2026-06-06T03:00:00Z', 170)], snap('2026-06-03T03:00:00Z', 100), range);
    expect(days).toHaveLength(30);
    expect(days.find((d) => d.day === '2026-06-03')!.up).toBe(10 * GB);
    expect(days.find((d) => d.day === '2026-06-04')!.up).toBe(50 * GB);
    expect(days.find((d) => d.day === '2026-06-05')!.up).toBe(10 * GB);
    expect(bestDay(days)).toMatchObject({ day: '2026-06-04', up: 50 * GB });
  });
  it('sans relevé d\'avant le mois, le premier écart est inconnu ; un compteur remis à zéro est ignoré', () => {
    const days = dailyGains([snap('2026-06-02T03:00:00Z', 500), snap('2026-06-03T03:00:00Z', 40), snap('2026-06-04T03:00:00Z', 60)], null, range);
    expect(days.find((d) => d.day === '2026-06-01')!.up).toBe(0);
    expect(days.find((d) => d.day === '2026-06-02')!.up).toBe(0);
    expect(days.find((d) => d.day === '2026-06-03')!.up).toBe(20 * GB);
  });
  it('rien d\'envoyé : pas de meilleur jour', () => {
    expect(bestDay(dailyGains([], null, range))).toBeNull();
  });
});

describe('compare', () => {
  it('part des membres dépassés, médiane, moyenne', () => {
    const c = compare(50, [10, 20, 30, 40, 60, 70, 80, 90])!;
    expect(c.beatsPercent).toBe(50);
    expect(c.median).toBe(50);
    expect(c.members).toBe(8);
    expect(compare(100, [1, 2, 3])!.beatsPercent).toBe(100);
    expect(compare(0, [1, 2, 3])!.beatsPercent).toBe(0);
  });
  it('personne d\'autre : rien à comparer', () => {
    expect(compare(5, [])).toBeNull();
  });
});

describe('summarizeWatching', () => {
  const row = (o: Partial<Parameters<typeof summarizeWatching>[0][0]>) => ({ torrentId: 't', fileIndex: 0, positionSeconds: 1800, durationSeconds: 2700, name: 'Film.2020', season: null, episode: null, metaSource: null, metaExternalId: null, coverImage: null, ...o });
  it('regroupe les épisodes par série et sépare les films', () => {
    const r = summarizeWatching([
      row({ torrentId: 'a', name: 'Youth.S01E01.MULTI', season: '01', episode: '01', metaSource: 'tmdb', metaExternalId: '9' }),
      row({ torrentId: 'b', name: 'Youth.S01E02.MULTI', season: '01', episode: '02', metaSource: 'tmdb', metaExternalId: '9' }),
      row({ torrentId: 'b', fileIndex: 1, name: 'Youth.S01E02.MULTI', season: '01', episode: '02', metaSource: 'tmdb', metaExternalId: '9' }),
      row({ torrentId: 'c', name: 'Mon.Film.2021', positionSeconds: 5400, durationSeconds: 5400 }),
      row({ torrentId: 'd', name: 'Coup.dœil', positionSeconds: 30 }),
    ]);
    expect(r.seriesCount).toBe(1);
    expect(r.series[0]).toMatchObject({ title: 'Youth', episodes: 2 });
    expect(r.otherCount).toBe(1);
    expect(r.other[0].title).toBe('Mon.Film.2021');
    expect(r.totalSeconds).toBe(1800 * 3 + 5400);
  });
});
