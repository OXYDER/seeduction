import { analyzeFailures, newStaffIps, type FailedLogin } from './suspicious';

const f = (ip: string | null, username: string, at = 0): FailedLogin => ({ ip, username, at });
const many = (n: number, mk: (i: number) => FailedLogin) => Array.from({ length: n }, (_, i) => mk(i));

describe('suspicious : échecs de connexion', () => {
  it('rien à signaler pour quelques fautes de frappe', () => {
    expect(analyzeFailures([f('1.1.1.1', 'alice'), f('1.1.1.1', 'alice'), f('2.2.2.2', 'bob')])).toEqual([]);
  });
  it('force brute : beaucoup d\'essais depuis une adresse', () => {
    const r = analyzeFailures(many(20, () => f('9.9.9.9', 'alice')));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: 'ip-burst', subject: '9.9.9.9', count: 20, severity: 'warn' });
  });
  it('force brute massive : gravité haute', () => {
    expect(analyzeFailures(many(60, () => f('9.9.9.9', 'alice')))[0].severity).toBe('high');
  });
  it('arrosage : beaucoup de comptes différents depuis une adresse (gravité haute, une seule alerte pour l\'adresse)', () => {
    const r = analyzeFailures(many(30, (i) => f('8.8.8.8', `user${i % 6}`)));
    expect(r.filter((x) => x.subject === '8.8.8.8')).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: 'ip-spray', severity: 'high', count: 6 });
  });
  it('compte ciblé : échecs répétés depuis plusieurs adresses', () => {
    const r = analyzeFailures(many(10, (i) => f(`10.0.0.${i % 3}`, 'Alice')));
    expect(r.find((x) => x.kind === 'account-targeted')).toMatchObject({ subject: 'alice', count: 10 });
  });
  it('un compte attaqué depuis une seule adresse n\'est pas « ciblé » (c\'est de la force brute)', () => {
    expect(analyzeFailures(many(10, () => f('7.7.7.7', 'alice'))).some((x) => x.kind === 'account-targeted')).toBe(false);
  });
  it('les adresses inconnues sont regroupées ensemble', () => {
    expect(analyzeFailures(many(16, () => f(null, 'alice')))[0].subject).toBe('inconnue');
  });
});

describe('suspicious : équipe', () => {
  const login = (ip: string | null, userId = 'u1') => ({ userId, username: 'Admin', role: 'ADMIN', ip, at: 1 });
  it('adresse jamais vue : alerte', () => {
    const r = newStaffIps([login('5.5.5.5')], new Map([['u1', new Set(['1.1.1.1'])]]));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: 'staff-new-ip', severity: 'high' });
  });
  it('adresse habituelle : rien', () => {
    expect(newStaffIps([login('1.1.1.1')], new Map([['u1', new Set(['1.1.1.1'])]]))).toEqual([]);
  });
  it('aucun historique : rien à comparer', () => {
    expect(newStaffIps([login('5.5.5.5')], new Map())).toEqual([]);
  });
  it('la même nouvelle adresse n\'est signalée qu\'une fois', () => {
    expect(newStaffIps([login('5.5.5.5'), login('5.5.5.5')], new Map([['u1', new Set(['1.1.1.1'])]]))).toHaveLength(1);
  });
});
