import { DEFAULT_UPLOAD_CREDIT, GB, creditBytes, normalizeUploadCredit, roomToday } from './upload-credit';

describe('Crédit d\'envoi', () => {
  it('crédite 25 % de la taille', () => {
    expect(creditBytes(8n * BigInt(GB), DEFAULT_UPLOAD_CREDIT)).toBe(2n * BigInt(GB));
    expect(creditBytes(1_000_000_000, DEFAULT_UPLOAD_CREDIT)).toBe(250_000_000n);
  });

  it('plafonne par torrent', () => {
    expect(creditBytes(500n * BigInt(GB), DEFAULT_UPLOAD_CREDIT)).toBe(25n * BigInt(GB));
  });

  it('ne crédite rien pour 0 % ou une taille nulle', () => {
    expect(creditBytes(10n * BigInt(GB), { ...DEFAULT_UPLOAD_CREDIT, percent: 0 })).toBe(0n);
    expect(creditBytes(0, DEFAULT_UPLOAD_CREDIT)).toBe(0n);
  });

  it('calcule la marge du jour', () => {
    expect(roomToday(DEFAULT_UPLOAD_CREDIT, 30n * BigInt(GB))).toBe(70n * BigInt(GB));
    expect(roomToday(DEFAULT_UPLOAD_CREDIT, 150n * BigInt(GB))).toBe(0n);
    expect(roomToday({ ...DEFAULT_UPLOAD_CREDIT, dailyMaxGb: 0 }, 999n * BigInt(GB))).toBeNull();
  });

  it('garde les anciennes valeurs quand une valeur est invalide', () => {
    expect(normalizeUploadCredit({ percent: 400, maxPerTorrentGb: 'x', enabled: 'oui' })).toEqual(DEFAULT_UPLOAD_CREDIT);
    const c = normalizeUploadCredit({ percent: 10, enabled: false, startedAt: '2026-10-15T00:00:00Z' });
    expect(c.percent).toBe(10);
    expect(c.enabled).toBe(false);
    expect(c.startedAt).toBe('2026-10-15T00:00:00.000Z');
  });
});
