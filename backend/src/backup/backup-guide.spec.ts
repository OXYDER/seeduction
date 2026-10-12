import { buildGuide } from './backup-guide';

describe('mode d\'emploi du zip', () => {
  const g = buildGuide({ bundle: 'seeduction-backup-20261012-033005.tar.enc', createdAt: '2026-10-12T07:30:05Z', bytes: 5 * 1024 ** 2, appVersion: '1.0.412', users: 120, torrents: 800 });
  it('couvre les étapes essentielles', () => {
    expect(g).toContain('bash restaurer.sh');
    expect(g).toContain('PHRASE DE RÉCUPÉRATION');
    expect(g).toContain('--installer-docker');
    expect(g).toContain('--verifier');
    expect(g).toContain('9098');
    expect(g).toContain('Synology'.toUpperCase().slice(0, 3) === 'SYN' ? 'SYNOLOGY' : '');
    expect(g).toContain('WINDOWS');
  });
  it('cite le paquet, la version et les chiffres', () => {
    expect(g).toContain('seeduction-backup-20261012-033005.tar.enc');
    expect(g).toContain('1.0.412');
    expect(g).toContain('120 membres');
  });
  it('ne contient jamais de secret', () => {
    expect(g).not.toMatch(/JWT_SECRET=|PASSWORD=|[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}/);
  });
  it('prévient pour un instantané partiel', () => {
    expect(buildGuide({ bundle: 'seeduction-predeploy-20261012-033005.tar.enc', createdAt: '2026-10-12T07:30:05Z', bytes: 1000, partial: true })).toContain('instantané');
  });
});
