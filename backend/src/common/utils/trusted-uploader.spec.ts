import { DEFAULT_TRUSTED_CONFIG as C, normalizeTrustedConfig, shouldDemote, shouldPromote, UploaderStats } from './trusted-uploader';

const good: UploaderStats = { accountDays: 120, approvedTotal: 40, window: { approvedClean: 18, reviewed: 19 }, keep: { faults: 0, reports: 0 }, daysSinceLastUpload: 3, recentSanction: false };

describe('promotion automatique en Uploadeur', () => {
  it('un membre assidu et sans faute est promu', () => {
    expect(shouldPromote(good, C).action).toBe('promote');
  });
  it('trop récent, trop peu de torrents ou trop de corrections : pas de promotion, avec les raisons', () => {
    expect(shouldPromote({ ...good, accountDays: 10 }, C).reasons.join()).toMatch(/moins de 30 jours/);
    expect(shouldPromote({ ...good, approvedTotal: 5 }, C).action).toBe('none');
    const v = shouldPromote({ ...good, window: { approvedClean: 10, reviewed: 20 } }, C);
    expect(v.action).toBe('none');
    expect(v.reasons.join()).toMatch(/50 %/);
  });
  it('un signalement, une correction récente ou une sanction bloquent la promotion', () => {
    expect(shouldPromote({ ...good, keep: { faults: 0, reports: 1 } }, C).action).toBe('none');
    expect(shouldPromote({ ...good, keep: { faults: 1, reports: 0 } }, C).action).toBe('none');
    expect(shouldPromote({ ...good, recentSanction: true }, C).action).toBe('none');
  });
  it('désactivée : rien ne se passe', () => {
    expect(shouldPromote(good, { ...C, enabled: false }).action).toBe('none');
    expect(shouldDemote({ ...good, daysSinceLastUpload: 500 }, { ...C, enabled: false }).action).toBe('none');
  });
});

describe('rétrogradation automatique', () => {
  it('un Uploadeur actif et sans faute garde son rang', () => {
    expect(shouldDemote(good, C).action).toBe('none');
  });
  it('inactif depuis trop longtemps (ou jamais d\'envoi) : rang retiré', () => {
    expect(shouldDemote({ ...good, daysSinceLastUpload: 61 }, C).action).toBe('demote');
    expect(shouldDemote({ ...good, daysSinceLastUpload: 60 }, C).action).toBe('none');
    expect(shouldDemote({ ...good, daysSinceLastUpload: null }, C).action).toBe('demote');
  });
  it('trop de fautes ou de signalements : rang retiré, les petites fautes sont tolérées', () => {
    expect(shouldDemote({ ...good, keep: { faults: 2, reports: 0 } }, C).action).toBe('none');
    expect(shouldDemote({ ...good, keep: { faults: 3, reports: 0 } }, C).action).toBe('demote');
    expect(shouldDemote({ ...good, keep: { faults: 0, reports: 4 } }, C).reasons.join()).toMatch(/signalements/);
  });
  it('une sanction récente retire le rang', () => {
    expect(shouldDemote({ ...good, recentSanction: true }, C).action).toBe('demote');
  });
});

describe('normalizeTrustedConfig', () => {
  it('valeurs par défaut quand rien n\'est enregistré', () => {
    expect(normalizeTrustedConfig(null)).toEqual(C);
  });
  it('ramène les valeurs absurdes à des bornes raisonnables', () => {
    const n = normalizeTrustedConfig({ minApproved: -5, minCleanRate: 5, windowDays: 'abc', enabled: false });
    expect(n.minApproved).toBe(1);
    expect(n.minCleanRate).toBe(1);
    expect(n.windowDays).toBe(C.windowDays);
    expect(n.enabled).toBe(false);
  });
});
