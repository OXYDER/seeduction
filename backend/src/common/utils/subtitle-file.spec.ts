import { clampOffset, decodeSubtitle, formatTime, normalizeLang, parseSubtitle, prepareSubtitle, toSrt } from './subtitle-file';

const SRT = (n = 6) => Array.from({ length: n }, (_, i) => `${i + 1}\n00:00:${String(i * 2 + 1).padStart(2, '0')},500 --> 00:00:${String(i * 2 + 2).padStart(2, '0')},000\nRéplique ${i + 1} : é à ç\n`).join('\n');

describe('sous-titres', () => {
  it('lit un .srt et le réécrit proprement', () => {
    const cues = parseSubtitle(SRT());
    expect(cues).toHaveLength(6);
    expect(cues[0]).toEqual({ start: 1500, end: 2000, text: 'Réplique 1 : é à ç' });
    expect(toSrt(cues).startsWith('1\n00:00:01,500 --> 00:00:02,000\nRéplique 1')).toBe(true);
  });
  it('convertit un .vtt (en-tête, points, réglages de position, balises de temps)', () => {
    const vtt = `WEBVTT\n\nNOTE un commentaire\n\n00:01.500 --> 00:02.000 align:start position:0%\n<c.yellow>Bonjour</c> <00:01.800>toi\n\n01:02:03.004 --> 01:02:04.000\nFin\n`;
    const cues = parseSubtitle(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1500, end: 2000, text: 'Bonjour toi' });
    expect(cues[1].start).toBe(3_723_004);
  });
  it('décale les temps, sans jamais descendre sous zéro', () => {
    const cues = parseSubtitle(SRT());
    expect(toSrt(cues, 1000)).toContain('00:00:02,500 --> 00:00:03,000');
    expect(toSrt(cues, -5000)).toContain('00:00:00,000 --> 00:00:00,000');
    expect(formatTime(3_723_004)).toBe('01:02:03,004');
  });
  it('décode UTF-8, UTF-8 avec BOM, UTF-16 et Windows-1252', () => {
    const text = 'Écoute : où ça ?';
    expect(decodeSubtitle(Buffer.from(text, 'utf8'))).toBe(text);
    expect(decodeSubtitle(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]))).toBe(text);
    expect(decodeSubtitle(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]))).toBe(text);
    expect(decodeSubtitle(Buffer.from([0xc9, 0x63, 0x6f, 0x75, 0x74, 0x65, 0x20, 0xe0]))).toBe('Écoute à'); // Latin-1 / Windows-1252
  });
  it('valide un fichier envoyé', () => {
    const ok = prepareSubtitle(Buffer.from(SRT(), 'utf8'));
    expect(ok.ok && ok.cues).toBe(6);
    expect(prepareSubtitle(Buffer.alloc(0))).toEqual({ ok: false, reason: 'Fichier vide' });
    expect((prepareSubtitle(Buffer.from('juste du texte\nsans temps')) as any).reason).toMatch(/Aucune réplique/);
    expect((prepareSubtitle(Buffer.alloc(700 * 1024, 65)) as any).reason).toMatch(/trop gros/);
    expect((prepareSubtitle(Buffer.from([0x4d, 0x5a, 0x00, 0x01, 0x02])) as any).reason).toMatch(/ne ressemble pas/);
  });
  it('normalise les langues et borne le décalage', () => {
    expect(normalizeLang('FR')).toBe('fr');
    expect(normalizeLang('fr-ca')).toBe('fr-CA');
    expect(normalizeLang('en_US')).toBe('en');
    expect(normalizeLang('klingon')).toBeNull();
    expect(clampOffset(99_999_999)).toBe(600_000);
    expect(clampOffset('abc')).toBe(0);
    expect(clampOffset(-1500.4)).toBe(-1500);
  });
});
