import { cleanCommand, cleanDevice, cleanPlaying, dayKey, summarizeWatch, type WatchRow } from './vod-live';

describe('vod-live', () => {
  it('refuse un appareil sans identifiant valable et borne le reste', () => {
    expect(cleanDevice({ deviceKey: 'x' })).toBeNull();
    expect(cleanDevice(null)).toBeNull();
    const d = cleanDevice({ deviceKey: 'abcd-1234-efgh', name: '  Salon\u0000  ', kind: 'tv', appVersion: '1.7.0' })!;
    expect(d).toEqual({ deviceKey: 'abcd-1234-efgh', name: 'Salon', kind: 'tv', appVersion: '1.7.0' });
    expect(cleanDevice({ deviceKey: 'abcd-1234-efgh', kind: 'frigo' })!.kind).toBe('phone');
    expect(cleanDevice({ deviceKey: 'abcd-1234-efgh', kind: 'tv' })!.name).toBe('Télévision');
  });

  it('nettoie ce qui joue : rien sans torrent, couverture seulement relative ou https', () => {
    expect(cleanPlaying(null)).toBeNull();
    expect(cleanPlaying({ title: 'x' })).toBeNull();
    const p = cleanPlaying({ torrentId: 't1', title: 'Film', position: 12.9, duration: -4, paused: true, cover: 'javascript:alert(1)' })!;
    expect(p).toMatchObject({ torrentId: 't1', title: 'Film', position: 12, duration: 0, paused: true, cover: null });
    expect(cleanPlaying({ torrentId: 't1', cover: '/api/covers/a.jpg' })!.cover).toBe('/api/covers/a.jpg');
  });

  it('accepte seulement les commandes connues, avec leurs valeurs bornées', () => {
    expect(cleanCommand({ type: 'format' }, 'c')).toBeNull();
    expect(cleanCommand({ type: 'start' }, 'c')).toBeNull();
    expect(cleanCommand({ type: 'start', torrentId: 't1', fileIndex: 3, title: 'T' }, 'c')).toEqual({ id: 'c', type: 'start', torrentId: 't1', fileIndex: 3, title: 'T' });
    expect(cleanCommand({ type: 'seekBy', value: -99999 }, 'c')).toEqual({ id: 'c', type: 'seekBy', value: -3600 });
    expect(cleanCommand({ type: 'seekBy', value: 'abc' }, 'c')).toBeNull();
    expect(cleanCommand({ type: 'seek', value: 90 }, 'c')).toEqual({ id: 'c', type: 'seek', value: 90 });
    expect(cleanCommand({ type: 'pause' }, 'c')).toEqual({ id: 'c', type: 'pause' });
  });

  it('résume le temps regardé', () => {
    const now = new Date('2026-11-24T15:00:00Z');
    const today = dayKey(now);
    const yesterday = dayKey(new Date(now.getTime() - 86_400_000));
    const old = dayKey(new Date(now.getTime() - 40 * 86_400_000));
    const row = (o: Partial<WatchRow>): WatchRow => ({ torrentId: 't', deviceId: 'd1', day: today, seconds: 600, title: 'A', cover: null, kind: 'film', genres: ['Action'], ...o });
    const s = summarizeWatch([row({}), row({ day: yesterday, seconds: 300, deviceId: 'd2' }), row({ day: old, seconds: 1000, title: 'B', kind: 'serie', genres: ['Drame'] })], today, now);
    expect(s.seconds).toEqual({ all: 1900, week: 900, month: 900 });
    expect(s.titles).toBe(2);
    expect(s.days).toHaveLength(30);
    expect(s.days[29]).toEqual({ day: today, seconds: 600 });
    expect(s.topTitles[0].title).toBe('B');
    expect(s.genres[0]).toEqual({ genre: 'Drame', seconds: 1000 });
    expect(s.devices.find((d) => d.deviceId === 'd2')!.seconds).toBe(300);
    expect(s.kinds).toEqual({ film: 900, serie: 1000 });
  });
});
