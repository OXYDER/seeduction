import { DEFAULT_ECONOMY, LedgerRow, SOURCES, byDay, cleanSource, createdFree, dayKey, flagged, houseResult, normalizeEconomy, setSource, sourceMeta, topEarners, totalsBySource } from './ledger';

const h = (iso: string) => new Date(iso);
const row = (userId: string, source: string, hour: string, credit: number, debit = 0, count = 1): LedgerRow & { userId: string } => ({ userId, source, hour: h(hour), credit, debit, count });

describe('Journal des points : sources', () => {
  it('chaque source a un nom lisible et un type connu, sans doublon', () => {
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length);
    for (const s of SOURCES) { expect(s.label.length).toBeGreaterThanOrEqual(3); expect(['free', 'house', 'seed', 'other']).toContain(s.kind); }
    expect(sourceMeta('dice').kind).toBe('house');
    expect(sourceMeta('wheel').kind).toBe('free');
    expect(sourceMeta('inconnue')).toEqual({ id: 'inconnue', label: 'inconnue', kind: 'other' });
  });

  it('les étiquettes invalides sont ramenées à « autre »', () => {
    expect(cleanSource('wheel')).toBe('wheel');
    expect(cleanSource("x'; DROP TABLE")).toBe('autre');
    expect(cleanSource('')).toBe('autre');
    expect(cleanSource('A')).toBe('autre');
  });

  it('setSource passe l\'étiquette nettoyée comme paramètre (jamais collée dans le texte SQL)', () => {
    const calls: any[] = [];
    const db = { $executeRaw: (s: TemplateStringsArray, ...v: any[]) => { calls.push({ sql: s.join('?'), v }); return Promise.resolve(1); } };
    void setSource(db, 'blackjack');
    void setSource(db, "bad'source");
    expect(calls[0].sql).toMatch(/set_config\('app\.pts_source', \?, true\)/);
    expect(calls[0].v).toEqual(['blackjack']);
    expect(calls[1].v).toEqual(['autre']);
  });
});

describe('Journal des points : regroupements', () => {
  const rows = [
    row('u1', 'wheel', '2026-10-17T14:00:00Z', 50), row('u1', 'wheel', '2026-10-17T15:00:00Z', 20), row('u2', 'quiz', '2026-10-17T14:00:00Z', 30),
    row('u1', 'dice', '2026-10-17T14:00:00Z', 100, 60, 4), row('u2', 'dice', '2026-10-17T14:00:00Z', 0, 40, 2), row('u3', 'seed', '2026-10-17T14:00:00Z', 900),
  ];

  it('additionne par source', () => {
    const t = totalsBySource(rows);
    expect(t.get('wheel')).toEqual({ credit: 70, debit: 0, count: 2 });
    expect(t.get('dice')).toEqual({ credit: 100, debit: 100, count: 6 });
  });

  it('points créés par les sources gratuites (sans les jeux ni le partage) et résultat de la maison', () => {
    const t = totalsBySource(rows);
    expect(createdFree(t)).toBe(100); // roue 70 + quiz 30
    expect(houseResult(t)).toBe(0); // dés : 100 crédités, 100 débités
    expect(houseResult(totalsBySource([row('u', 'slots', '2026-10-17T14:00:00Z', 30, 100)]))).toBe(70); // la maison gagne 70
  });

  it('regroupe par jour de Montréal, pas par jour UTC', () => {
    // 02:00 UTC le 18 octobre = 22:00 le 17 à Montréal (heure d'été)
    expect(dayKey(h('2026-10-18T02:00:00Z'))).toBe('2026-10-17');
    expect(dayKey(h('2026-10-18T05:00:00Z'))).toBe('2026-10-18');
    expect(dayKey(h('2026-12-18T04:30:00Z'))).toBe('2026-12-17'); // heure d'hiver : minuit à 05:00 UTC
    const days = byDay([row('u', 'wheel', '2026-10-18T02:00:00Z', 5), row('u', 'wheel', '2026-10-18T14:00:00Z', 7), row('u', 'wheel', '2026-10-16T14:00:00Z', 1)]);
    expect(days.map((d) => d.day)).toEqual(['2026-10-16', '2026-10-17', '2026-10-18']);
    expect(days[1].sources.get('wheel')!.credit).toBe(5);
  });
});

describe('Journal des points : gains inhabituels', () => {
  const rows = [
    row('a', 'wheel', '2026-10-17T14:00:00Z', 800), row('a', 'quiz', '2026-10-17T14:00:00Z', 900), row('a', 'seed', '2026-10-17T14:00:00Z', 50_000),
    row('b', 'wheel', '2026-10-17T14:00:00Z', 200), row('b', 'dice', '2026-10-17T14:00:00Z', 100, 50),
    row('c', 'echange', '2026-10-17T14:00:00Z', 9999),
  ];

  it('classe par gains nets, sans le partage de torrents ni les échanges', () => {
    const t = topEarners(rows);
    expect(t.map((e) => e.userId)).toEqual(['a', 'b']);
    expect(t[0]).toMatchObject({ userId: 'a', net: 1700 });
    expect(t[0].bySource).toEqual({ wheel: 800, quiz: 900 });
    expect(t[1].net).toBe(250); // roue +200, dés +50
  });

  it('un membre qui a perdu plus qu\'il n\'a gagné n\'apparaît pas', () => {
    const t = topEarners([row('z', 'dice', '2026-10-17T14:00:00Z', 10, 400)]);
    expect(t).toEqual([]);
  });

  it('applique le seuil d\'alerte (0 : aucune alerte)', () => {
    const e = [{ userId: 'a', net: 1700, bySource: {} }, { userId: 'b', net: 900, bySource: {} }];
    expect(flagged(e, 1500).map((x) => x.userId)).toEqual(['a']);
    expect(flagged(e, 0)).toEqual([]);
    expect(flagged(e, 900).map((x) => x.userId)).toEqual(['a', 'b']);
  });

  it('réglage du seuil : valeur valide ou ancienne valeur', () => {
    expect(normalizeEconomy({ alertThreshold: 3000 })).toEqual({ alertThreshold: 3000 });
    expect(normalizeEconomy({ alertThreshold: -5 })).toEqual(DEFAULT_ECONOMY);
    expect(normalizeEconomy({ alertThreshold: 'x' }, { alertThreshold: 42 })).toEqual({ alertThreshold: 42 });
    expect(normalizeEconomy({ alertThreshold: 0 })).toEqual({ alertThreshold: 0 });
  });
});
