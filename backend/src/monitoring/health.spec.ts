import { AlertState, Check, HealthInput, evaluate, overall, planAlerts } from './health';
import { JobMonitor } from '../common/utils/job-monitor';

const base = (over: Partial<HealthInput> = {}): HealthInput => {
  const jobMonitor = new JobMonitor();
  return { db: { ok: true, latencyMs: 12 }, secretWeakness: null, jobs: jobMonitor.snapshot(), jobMonitor, nhl: { lastOkAt: Date.now() - 60_000, lastErrorAt: null, lastError: null }, rssMB: 300, errors5xxLast10min: 0, smtpConfigured: true, ...over };
};
const by = (checks: Check[], id: string) => checks.find((c) => c.id === id)!;

describe('Santé du site : contrôles', () => {
  it('un site en bonne santé n\'a que des contrôles « ok »', () => {
    const checks = evaluate(base());
    expect(overall(checks)).toBe('ok');
    expect(checks.map((c) => c.id)).toEqual(expect.arrayContaining(['database', 'secret', 'nhl', 'memory', 'errors', 'smtp']));
  });

  it('une base injoignable ou lente est signalée', () => {
    expect(by(evaluate(base({ db: { ok: false, latencyMs: null } })), 'database').level).toBe('error');
    expect(by(evaluate(base({ db: { ok: true, latencyMs: 2500 } })), 'database').level).toBe('warn');
  });

  it('un secret faible est une erreur de sécurité avec la marche à suivre', () => {
    const c = by(evaluate(base({ secretWeakness: 'JWT_SECRET n\'est pas défini' })), 'secret');
    expect(c.level).toBe('error');
    expect(c.detail).toMatch(/JWT_SECRET long et aléatoire/);
    expect(c.detail).toMatch(/ressaisir/);
  });

  it('une tâche en échec remonte avec son message', () => {
    const jm = new JobMonitor();
    jm.run('picks.tick', 60_000); jm.fail('picks.tick', new Error('connexion refusée'));
    const c = by(evaluate(base({ jobMonitor: jm, jobs: jm.snapshot() })), 'job:picks.tick');
    expect(c.level).toBe('error');
    expect(c.detail).toMatch(/connexion refusée/);
    expect(c.label).toMatch(/Pronostics LNH/);
  });

  it('la LNH injoignable est un avertissement qui disparaît quand elle répond de nouveau', () => {
    const now = Date.now();
    expect(by(evaluate(base({ nhl: { lastOkAt: now - 3_600_000, lastErrorAt: now - 60_000, lastError: 'HTTP 503' }, now })), 'nhl').level).toBe('warn');
    expect(by(evaluate(base({ nhl: { lastOkAt: now - 1000, lastErrorAt: now - 60_000, lastError: 'HTTP 503' }, now })), 'nhl').level).toBe('ok');
    expect(by(evaluate(base({ nhl: { lastOkAt: now - 90 * 60_000, lastErrorAt: now - 80 * 60_000, lastError: 'vieux' }, now })), 'nhl').level).toBe('ok'); // trop ancien pour alerter
  });

  it('les erreurs 5xx et la mémoire ont des seuils', () => {
    expect(by(evaluate(base({ errors5xxLast10min: 4 })), 'errors').level).toBe('ok');
    expect(by(evaluate(base({ errors5xxLast10min: 5 })), 'errors').level).toBe('warn');
    expect(by(evaluate(base({ errors5xxLast10min: 25 })), 'errors').level).toBe('error');
    expect(by(evaluate(base({ rssMB: 1800 })), 'memory').level).toBe('warn');
  });

  it('SMTP absent est signalé', () => {
    expect(by(evaluate(base({ smtpConfigured: false })), 'smtp').level).toBe('warn');
  });
});

describe('Santé du site : alertes', () => {
  const bad = (id: string, level: 'warn' | 'error' = 'error'): Check => ({ id, label: id, level, detail: 'x' });
  const ok = (id: string): Check => ({ id, label: id, level: 'ok', detail: '' });
  const H = 3_600_000;

  it('un nouveau problème est signalé une fois', () => {
    const r1 = planAlerts([bad('a'), ok('b')], new Map(), 1000);
    expect(r1.raise.map((c) => c.id)).toEqual(['a']);
    const r2 = planAlerts([bad('a'), ok('b')], r1.next, 2000);
    expect(r2.raise).toHaveLength(0); // pas de rappel tout de suite
  });

  it('un problème qui dure est rappelé après 12 heures', () => {
    const r1 = planAlerts([bad('a')], new Map(), 0);
    expect(planAlerts([bad('a')], r1.next, 11 * H).raise).toHaveLength(0);
    expect(planAlerts([bad('a')], r1.next, 12 * H).raise.map((c) => c.id)).toEqual(['a']);
  });

  it('un message de rétablissement part quand le problème disparaît, une seule fois', () => {
    const r1 = planAlerts([bad('a')], new Map(), 0);
    const r2 = planAlerts([ok('a')], r1.next, 1000);
    expect(r2.resolve.map((x) => x.id)).toEqual(['a']);
    expect(planAlerts([ok('a')], r2.next, 2000).resolve).toHaveLength(0);
  });

  it('un avertissement qui devient une erreur est signalé tout de suite', () => {
    const r1 = planAlerts([bad('a', 'warn')], new Map(), 0);
    const r2 = planAlerts([bad('a', 'error')], r1.next, 1000);
    expect(r2.raise.map((c) => c.level)).toEqual(['error']);
  });

  it('un contrôle qui n\'existe plus est considéré comme rétabli', () => {
    const prev = new Map<string, AlertState>([['gone', { at: 0, level: 'error' }]]);
    expect(planAlerts([ok('x')], prev, 1000).resolve.map((r) => r.id)).toEqual(['gone']);
  });
});

describe('Santé du site : double authentification des administrateurs', () => {
  it('signale les administrateurs sans 2FA (en orange) avec leurs noms', () => {
    const c = by(evaluate(base({ staffWithout2fa: ['alice', 'bob'] })), 'staff2fa');
    expect(c.level).toBe('warn');
    expect(c.detail).toMatch(/2 administrateurs/);
    expect(c.detail).toMatch(/alice, bob/);
  });
  it('tout va bien quand tous l\'ont activée', () => {
    expect(by(evaluate(base({ staffWithout2fa: [] })), 'staff2fa').level).toBe('ok');
  });
});
