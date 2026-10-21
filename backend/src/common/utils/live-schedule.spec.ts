import { activeAt, occurrencesBetween, normalizeLiveConfig, upcoming, validStreamUrl, zonedToUtc, SlotLike } from './live-schedule';

const TZ = 'America/Toronto';
const slot = (over: Partial<SlotLike> = {}): SlotLike => ({ id: 's1', streamId: 'a', startsAt: new Date('2026-01-06T01:00:00Z'), durationMin: 120, repeat: 'NONE', enabled: true, ...over });

describe('zonedToUtc', () => {
  it('convertit l\'heure locale en hiver et en été', () => {
    expect(zonedToUtc(2026, 1, 6, 20, 0, TZ).toISOString()).toBe('2026-01-07T01:00:00.000Z'); // UTC-5
    expect(zonedToUtc(2026, 7, 7, 20, 0, TZ).toISOString()).toBe('2026-07-08T00:00:00.000Z'); // UTC-4
  });
});

describe('activeAt', () => {
  it('une diffusion unique : active seulement pendant sa période', () => {
    const s = slot();
    expect(activeAt([s], new Date('2026-01-06T00:59:00Z'))).toBeNull();
    expect(activeAt([s], new Date('2026-01-06T01:00:00Z'))?.slot.id).toBe('s1');
    expect(activeAt([s], new Date('2026-01-06T02:59:59Z'))?.slot.id).toBe('s1');
    expect(activeAt([s], new Date('2026-01-06T03:00:00Z'))).toBeNull();
  });

  it('ignore un créneau désactivé', () => {
    expect(activeAt([slot({ enabled: false })], new Date('2026-01-06T01:30:00Z'))).toBeNull();
  });

  it('tous les jours : même heure locale, y compris après le changement d\'heure', () => {
    // 1re occurrence : 20 h locales en hiver (01:00 UTC le lendemain)
    const s = slot({ startsAt: zonedToUtc(2026, 3, 1, 20, 0, TZ), repeat: 'DAILY' });
    expect(activeAt([s], zonedToUtc(2026, 3, 20, 20, 30, TZ))?.slot.id).toBe('s1'); // après le passage à l'heure d'été (8 mars)
    expect(activeAt([s], zonedToUtc(2026, 3, 20, 19, 59, TZ))).toBeNull();
    expect(activeAt([s], zonedToUtc(2026, 3, 20, 22, 0, TZ))).toBeNull();
  });

  it('chaque semaine : seulement le même jour', () => {
    const start = zonedToUtc(2026, 1, 6, 20, 0, TZ); // un mardi
    const s = slot({ startsAt: start, repeat: 'WEEKLY' });
    expect(activeAt([s], zonedToUtc(2026, 1, 13, 20, 30, TZ))).not.toBeNull(); // mardi suivant
    expect(activeAt([s], zonedToUtc(2026, 1, 14, 20, 30, TZ))).toBeNull(); // mercredi
    expect(activeAt([s], zonedToUtc(2025, 12, 30, 20, 30, TZ))).toBeNull(); // avant la première occurrence
  });

  it('une diffusion qui passe minuit reste active le lendemain', () => {
    const s = slot({ startsAt: zonedToUtc(2026, 1, 6, 23, 0, TZ), durationMin: 180, repeat: 'DAILY' });
    expect(activeAt([s], zonedToUtc(2026, 1, 8, 0, 30, TZ))).not.toBeNull();
    expect(activeAt([s], zonedToUtc(2026, 1, 8, 2, 30, TZ))).toBeNull();
  });

  it('la répétition s\'arrête à la date de fin', () => {
    const s = slot({ startsAt: zonedToUtc(2026, 1, 6, 20, 0, TZ), repeat: 'DAILY', repeatUntil: zonedToUtc(2026, 1, 10, 20, 0, TZ) });
    expect(activeAt([s], zonedToUtc(2026, 1, 10, 20, 30, TZ))).not.toBeNull();
    expect(activeAt([s], zonedToUtc(2026, 1, 11, 20, 30, TZ))).toBeNull();
  });

  it('si deux créneaux se chevauchent, le plus récent remplace l\'ancien', () => {
    const a = slot({ id: 'a', streamId: 'A', startsAt: new Date('2026-01-06T01:00:00Z'), durationMin: 180 });
    const b = slot({ id: 'b', streamId: 'B', startsAt: new Date('2026-01-06T02:00:00Z'), durationMin: 60 });
    expect(activeAt([a, b], new Date('2026-01-06T01:30:00Z'))?.slot.id).toBe('a');
    expect(activeAt([a, b], new Date('2026-01-06T02:30:00Z'))?.slot.id).toBe('b');
    expect(activeAt([a, b], new Date('2026-01-06T03:30:00Z'))?.slot.id).toBe('a'); // b est fini à 03:00 ; a dure jusqu'à 04:00 et reprend
  });
});

describe('upcoming', () => {
  it('liste les prochaines occurrences, la plus proche d\'abord', () => {
    const s = slot({ startsAt: zonedToUtc(2026, 1, 6, 20, 0, TZ), repeat: 'DAILY' });
    const list = upcoming([s], zonedToUtc(2026, 1, 8, 12, 0, TZ), 3, 10);
    expect(list.map((o) => o.start.toISOString())).toEqual([
      zonedToUtc(2026, 1, 8, 20, 0, TZ).toISOString(),
      zonedToUtc(2026, 1, 9, 20, 0, TZ).toISOString(),
      zonedToUtc(2026, 1, 10, 20, 0, TZ).toISOString(),
    ]);
  });
  it('respecte la limite', () => {
    const s = slot({ startsAt: zonedToUtc(2026, 1, 6, 20, 0, TZ), repeat: 'DAILY' });
    expect(upcoming([s], new Date('2026-01-07T00:00:00Z'), 30, 5)).toHaveLength(5);
  });
});

describe('occurrencesBetween', () => {
  it('ne renvoie rien pour une durée nulle', () => {
    expect(occurrencesBetween(slot({ durationMin: 0 }), new Date('2026-01-01'), new Date('2026-02-01'))).toEqual([]);
  });
});

describe('normalizeLiveConfig', () => {
  it('garde le secret existant quand le formulaire le laisse vide', () => {
    const prev = { ...normalizeLiveConfig({ secret: 'abc', controlUrl: 'https://r.example.com/controle/' }) };
    const next = normalizeLiveConfig({ secret: '', controlUrl: 'https://r.example.com/controle/', enabled: true }, prev);
    expect(next.secret).toBe('abc');
    expect(next.controlUrl).toBe('https://r.example.com/controle');
    expect(next.enabled).toBe(true);
  });
  it('refuse une adresse qui n\'est pas http(s) et un fuseau inconnu', () => {
    const next = normalizeLiveConfig({ controlUrl: 'javascript:alert(1)', playbackUrl: 'ftp://x', timezone: 'Mars/Olympus' });
    expect(next.controlUrl).toBe('');
    expect(next.playbackUrl).toBe('');
    expect(next.timezone).toBe('America/Toronto');
  });
});

describe('compatibilité navigateur', () => {
  it('convertit le son par défaut, accepte copy et full, refuse le reste', () => {
    expect(normalizeLiveConfig({}).transcode).toBe('audio');
    expect(normalizeLiveConfig({ transcode: 'copy' }).transcode).toBe('copy');
    expect(normalizeLiveConfig({ transcode: 'audio' }).transcode).toBe('audio');
    expect(normalizeLiveConfig({ transcode: 'full' }).transcode).toBe('full');
    expect(normalizeLiveConfig({ transcode: 'rm -rf' }, normalizeLiveConfig({ transcode: 'full' })).transcode).toBe('full');
  });
});

describe('validStreamUrl', () => {
  it('accepte les adresses de flux courantes et refuse le reste', () => {
    expect(validStreamUrl('http://100.64.0.2:9191/proxy/ts/stream/abc')).toBe(true);
    expect(validStreamUrl('rtmp://x/live/key')).toBe(true);
    expect(validStreamUrl('file:///etc/passwd')).toBe(false);
    expect(validStreamUrl('http://x/ a')).toBe(false);
    expect(validStreamUrl('http://x/"; rm -rf')).toBe(false);
    expect(validStreamUrl('')).toBe(false);
  });
});
