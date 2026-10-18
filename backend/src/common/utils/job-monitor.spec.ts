import { JobMonitor } from './job-monitor';

describe('Suivi des tâches planifiées', () => {
  it('une tâche qui s\'exécute normalement est « ok »', () => {
    const m = new JobMonitor();
    m.run('a', 60_000);
    const s = m.snapshot()[0];
    expect(s).toMatchObject({ name: 'a', runs: 1, fails: 0, lastRunFailed: false });
    expect(m.statusOf(s).level).toBe('ok');
  });

  it('un échec rend la tâche « error » avec le message, jusqu\'à la prochaine exécution réussie', () => {
    const m = new JobMonitor();
    m.run('a'); m.fail('a', new Error('La LNH ne répond pas'));
    let s = m.snapshot()[0];
    expect(m.statusOf(s)).toMatchObject({ level: 'error', detail: expect.stringContaining('La LNH ne répond pas') });
    m.run('a');
    s = m.snapshot()[0];
    expect(m.statusOf(s).level).toBe('ok');
    expect(s.fails).toBe(1); // l'historique des échecs reste compté
  });

  it('une tâche fréquente qui ne s\'exécute plus est signalée comme bloquée', () => {
    const m = new JobMonitor();
    (m as any).startedAt = Date.now() - 3_600_000;
    m.run('a', 60_000);
    const s = m.snapshot()[0];
    s.lastRunAt = Date.now() - 20 * 60_000; // plus de 5 intervalles
    expect(m.statusOf(s).level).toBe('warn');
    expect(m.statusOf(s).detail).toMatch(/Aucune exécution depuis/);
  });

  it('juste après le démarrage, une tâche pas encore exécutée n\'est pas signalée', () => {
    const m = new JobMonitor();
    m.run('b', 300_000);
    (m as any).state('b').lastRunAt = null;
    expect(m.statusOf(m.snapshot()[0]).level).toBe('ok');
  });

  it('une tâche quotidienne (sans intervalle) n\'est jamais « bloquée »', () => {
    const m = new JobMonitor();
    (m as any).startedAt = Date.now() - 10 * 86_400_000;
    m.run('cron');
    const s = m.snapshot()[0];
    s.lastRunAt = Date.now() - 5 * 86_400_000;
    expect(m.statusOf(s).level).toBe('ok');
  });

  it('tronque les messages d\'erreur très longs', () => {
    const m = new JobMonitor();
    m.fail('x', new Error('é'.repeat(1000)));
    expect(m.snapshot()[0].lastError!.length).toBe(300);
  });
});
