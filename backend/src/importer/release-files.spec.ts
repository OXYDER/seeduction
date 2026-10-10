import { applyMapping, dirScore, flatName, learnMapping } from './release-files';

describe('recherche d\'une release sur le FTP : correspondance des chemins', () => {
  it('apprend le préfixe qui change entre qBittorrent et le FTP', () => {
    // le FTP est « enraciné » plus bas : le préfixe de qBittorrent disparaît
    expect(learnMapping('/home/user/downloads/Films', '/downloads/Films')).toEqual({ q: '/home/user', f: '' });
    // le FTP a des niveaux en plus devant
    expect(learnMapping('/torrents/completed', '/apps/qbit.exemple.co/torrents/completed')).toEqual({ q: '', f: '/apps/qbit.exemple.co' });
    // les deux préfixes diffèrent
    expect(learnMapping('/data/seed/Films', '/mnt/ftp/Films')).toEqual({ q: '/data/seed', f: '/mnt/ftp' });
    // même chemin
    expect(learnMapping('/downloads', '/downloads')).toEqual({ q: '', f: '' });
  });

  it('applique la correspondance apprise à une autre release du même client', () => {
    const m = learnMapping('/home/user/downloads/Films', '/downloads/Films');
    expect(applyMapping(m, '/home/user/downloads/Series/Show')).toBe('/downloads/Series/Show');
    expect(applyMapping(m, '/home/user')).toBe('/');
    expect(applyMapping(m, '/autre/endroit')).toBeNull();
    const n = learnMapping('/torrents/completed', '/apps/qbit.exemple.co/torrents/completed');
    expect(applyMapping(n, '/torrents/completed/Cat')).toBe('/apps/qbit.exemple.co/torrents/completed/Cat');
  });

  it('compare les noms sans accents, casse ni ponctuation', () => {
    expect(flatName('Cœur.de Motard (2025)')).toBe(flatName('Coeur de motard 2025'.replace('Coeur', 'Cœur')));
    expect(flatName('Été.2024')).toBe('ete2024');
  });

  it('explore d\'abord les dossiers du chemin qBittorrent, puis les dossiers classiques, et les dossiers inutiles en dernier', () => {
    const wanted = new Set(['torrents', 'completed']);
    const s = (n: string) => dirScore(n, wanted, 1);
    expect(s('torrents')).toBeGreaterThan(s('downloads'));
    expect(s('downloads')).toBeGreaterThan(s('photos'));
    expect(s('photos')).toBeGreaterThan(s('incomplete'));
    expect(s('photos')).toBeGreaterThan(s('.cache'));
    expect(s('photos')).toBeGreaterThan(s('@eaDir'));
    expect(dirScore('photos', wanted, 1)).toBeGreaterThan(dirScore('photos', wanted, 6));
  });
});
