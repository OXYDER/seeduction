import {
  bundleName, formatBytes, generatePassphrase, isDue, isoWeekKey, isSafeBundleName, localParts, maskGitUrl, normalizeBackupConfig, parseBundleName, parseDatabaseUrl,
  selectKeep, signDownload, verifyDownload, DEFAULT_BACKUP,
} from './backup-utils';

const d = (s: string) => new Date(s);

describe('noms de paquets', () => {
  it('aller-retour du nom', () => {
    const name = bundleName(d('2026-10-12T03:30:05Z'), { encrypted: true });
    expect(name).toBe('seeduction-backup-20261012-033005.tar.enc');
    const p = parseBundleName(name)!;
    expect(p.date.toISOString()).toBe('2026-10-12T03:30:05.000Z');
    expect(p.encrypted).toBe(true);
    expect(p.predeploy).toBe(false);
    expect(parseBundleName(bundleName(d('2026-10-12T03:30:05Z'), { encrypted: false, predeploy: true }))).toMatchObject({ encrypted: false, predeploy: true });
  });
  it('refuse ce qui n\'est pas un paquet (protège la lecture et la suppression)', () => {
    expect(parseBundleName('../../etc/passwd')).toBeNull();
    expect(parseBundleName('status.json')).toBeNull();
    expect(isSafeBundleName('seeduction-backup-20261012-033005.tar.enc')).toBe(true);
    expect(isSafeBundleName('seeduction-backup-20261012-033005.tar.enc/../x')).toBe(false);
    expect(isSafeBundleName('../seeduction-backup-20261012-033005.tar.enc')).toBe(false);
  });
});

describe('rétention', () => {
  const mk = (days: number, hour = 3) => { const t = d('2026-10-12T00:00:00Z'); t.setUTCDate(t.getUTCDate() - days); t.setUTCHours(hour); return { name: bundleName(t), date: t }; };
  const cfg = { keepDaily: 7, keepWeekly: 4, keepMonthly: 6 };

  it('garde tout ce qui est récent, élague le reste', () => {
    const all = Array.from({ length: 200 }, (_, i) => mk(i));
    const keep = selectKeep(all, cfg);
    expect(keep.size).toBeGreaterThanOrEqual(7);
    expect(keep.size).toBeLessThanOrEqual(7 + 4 + 6);
    for (let i = 0; i < 7; i++) expect(keep.has(all[i].name)).toBe(true);
    expect(keep.has(all[199].name)).toBe(false);
  });

  it('un seul paquet par jour : le plus récent', () => {
    const early = mk(10, 1), late = mk(10, 20);
    const keep = selectKeep([mk(0), mk(1), mk(2), early, late], { ...cfg, keepDaily: 15 });
    expect(keep.has(late.name)).toBe(true);
    expect(keep.has(early.name)).toBe(false); // le plus ancien du jour, hors des 3 derniers
  });

  it('ne supprime jamais les trois derniers, même avec des réglages minimaux', () => {
    const all = [mk(0), mk(30), mk(60), mk(90)];
    const keep = selectKeep(all, { keepDaily: 1, keepWeekly: 0, keepMonthly: 0 });
    expect(keep.has(all[0].name) && keep.has(all[1].name) && keep.has(all[2].name)).toBe(true);
  });

  it('garde un par semaine et un par mois au-delà de la période quotidienne', () => {
    const all = Array.from({ length: 120 }, (_, i) => mk(i));
    const keep = selectKeep(all, cfg);
    const old = all.slice(30).filter((b) => keep.has(b.name));
    expect(old.length).toBeGreaterThan(0);
    expect(old.length).toBeLessThanOrEqual(10);
  });

  it('numéro de semaine ISO', () => {
    expect(isoWeekKey(d('2026-01-01T12:00:00Z'))).toBe('2026-W01');
    expect(isoWeekKey(d('2026-12-31T12:00:00Z'))).toBe('2026-W53');
  });
});

describe('planification', () => {
  const cfg = { enabled: true, time: '03:30', timezone: 'America/Toronto' };
  // 2026-10-12 : le Québec est en heure d'été (UTC-4) ; 03:30 locale = 07:30 UTC.
  it('pas avant l\'heure réglée', () => {
    expect(isDue(d('2026-10-12T07:00:00Z'), null, cfg)).toBe(false);
    expect(isDue(d('2026-10-12T07:30:00Z'), null, cfg)).toBe(true);
  });
  it('une fois par jour', () => {
    const last = d('2026-10-12T07:31:00Z');
    expect(isDue(d('2026-10-12T15:00:00Z'), last, cfg)).toBe(false);
    expect(isDue(d('2026-10-13T07:29:00Z'), last, cfg)).toBe(false);
    expect(isDue(d('2026-10-13T07:30:00Z'), last, cfg)).toBe(true);
  });
  it('rattrapage : serveur éteint à l\'heure prévue', () => {
    expect(isDue(d('2026-10-13T20:00:00Z'), d('2026-10-12T07:31:00Z'), cfg)).toBe(true);
  });
  it('sauvegarde manuelle faite après l\'heure du jour : rien de plus aujourd\'hui', () => {
    expect(isDue(d('2026-10-12T18:00:00Z'), d('2026-10-12T17:00:00Z'), cfg)).toBe(false);
  });
  it('désactivée : jamais', () => {
    expect(isDue(d('2026-10-12T18:00:00Z'), null, { ...cfg, enabled: false })).toBe(false);
  });
  it('le fuseau compte (changement d\'heure compris)', () => {
    expect(localParts(d('2026-10-12T07:30:00Z'), 'America/Toronto')).toEqual({ ymd: '2026-10-12', minutes: 210 });
    expect(localParts(d('2026-12-12T08:30:00Z'), 'America/Toronto')).toEqual({ ymd: '2026-12-12', minutes: 210 });
  });
});

describe('phrase de récupération et liens', () => {
  it('format lisible et aléatoire', () => {
    const p = generatePassphrase();
    expect(p).toMatch(/^([A-HJ-NP-Z2-9]{5}-){5}[A-HJ-NP-Z2-9]{5}$/);
    expect(generatePassphrase()).not.toBe(p);
  });
  it('liens signés : valables, falsifiés ou expirés', () => {
    const now = 1_000_000;
    const exp = now + 120_000;
    const sig = signDownload('seeduction-backup-20261012-033005.tar.enc', exp, 'secret');
    expect(verifyDownload('seeduction-backup-20261012-033005.tar.enc', exp, sig, 'secret', now)).toBe(true);
    expect(verifyDownload('seeduction-backup-20261011-033005.tar.enc', exp, sig, 'secret', now)).toBe(false);
    expect(verifyDownload('seeduction-backup-20261012-033005.tar.enc', exp, sig, 'autre', now)).toBe(false);
    expect(verifyDownload('seeduction-backup-20261012-033005.tar.enc', exp, sig, 'secret', exp + 1)).toBe(false);
    expect(verifyDownload('seeduction-backup-20261012-033005.tar.enc', exp, 'zz', 'secret', now)).toBe(false);
    expect(verifyDownload('seeduction-backup-20261012-033005.tar.enc', exp, sig.slice(0, 10), 'secret', now)).toBe(false);
  });
});

describe('réglages et utilitaires', () => {
  it('valeurs par défaut et bornes', () => {
    expect(normalizeBackupConfig(null)).toEqual(DEFAULT_BACKUP);
    const c = normalizeBackupConfig({ time: '25:99', timezone: 'Mars/Phobos', keepDaily: 0, keepMonthly: 9999, offsiteDir: '  /usb  ' });
    expect(c.time).toBe('03:30');
    expect(c.timezone).toBe('America/Toronto');
    expect(c.keepDaily).toBe(1);
    expect(c.keepMonthly).toBe(60);
    expect(c.offsiteDir).toBe('/usb');
  });
  it('masque les identifiants d\'une adresse git', () => {
    expect(maskGitUrl('https://user:ghp_abc@github.com/x/y.git')).toBe('https://github.com/x/y.git');
    expect(maskGitUrl('git@github.com:x/y.git')).toBe('git@github.com:x/y.git');
  });
  it('décode l\'URL de la base', () => {
    expect(parseDatabaseUrl('postgresql://tracker:p%40ss@postgres:5432/tracker?schema=public')).toEqual({ host: 'postgres', port: '5432', user: 'tracker', password: 'p@ss', database: 'tracker' });
    expect(parseDatabaseUrl('pas une url')).toBeNull();
  });
  it('formate les tailles', () => {
    expect(formatBytes(0)).toBe('0 o');
    expect(formatBytes(1536)).toBe('1.5 Ko');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 Go');
  });
});
