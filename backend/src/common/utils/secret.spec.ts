import { DEV_SECRET, jwtSecret, secretWeakness } from './secret';

describe('Secret des sessions', () => {
  const saved = process.env.JWT_SECRET;
  afterEach(() => { if (saved === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = saved; });

  it('sans variable d\'environnement, le secret de développement est utilisé et signalé comme dangereux', () => {
    delete process.env.JWT_SECRET;
    expect(jwtSecret()).toBe(DEV_SECRET);
    expect(secretWeakness()).toMatch(/n'est pas défini/);
  });

  it('un secret d\'exemple ou trop court est signalé', () => {
    expect(secretWeakness('change-me-generate-a-long-random-string')).toMatch(/valeur d'exemple/);
    expect(secretWeakness(DEV_SECRET)).toMatch(/valeur d'exemple/);
    expect(secretWeakness('CHANGEME')).toMatch(/valeur d'exemple/);
    expect(secretWeakness('court')).toMatch(/trop court/);
  });

  it('un vrai secret long est accepté et c\'est celui qui est utilisé', () => {
    process.env.JWT_SECRET = 'f3a9c1d27b8e4a60915cdd02e7b34f18a6c5d9e0';
    expect(secretWeakness()).toBeNull();
    expect(jwtSecret()).toBe('f3a9c1d27b8e4a60915cdd02e7b34f18a6c5d9e0');
  });
});

describe('configWeaknesses', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { configWeaknesses } = require('./secret');
  it('signale le mot de passe de base par défaut et le CORS ouvert', () => {
    const r = configWeaknesses({ DATABASE_URL: 'postgresql://tracker:changeme@postgres:5432/tracker?schema=public' });
    expect(r).toHaveLength(2);
    expect(r[0]).toMatch(/base de données/);
  });
  it('rien à signaler quand tout est personnalisé', () => {
    expect(configWeaknesses({ DATABASE_URL: 'postgresql://tracker:Xk9-long-secret@postgres:5432/tracker', CORS_ORIGIN: 'https://seeduction.org' })).toEqual([]);
  });
});
