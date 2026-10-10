import { parseAdultName, pickPorndbMatch, PorndbHit } from './porndb-match';

const scene = (id: string, site: string, date: string, performers: string[], title = 'T'): PorndbHit => ({ id: `scene:${id}`, kind: 'scene', title, date, site, performers });
const movie = (id: string, title: string, date: string): PorndbHit => ({ id: `movie:${id}`, kind: 'movie', title, date, performers: [] });

describe('ThePornDB : lecture du nom d\'une release adulte', () => {
  it('reconnaît une scène (site, date, interprètes)', () => {
    expect(parseAdultName('Brazzers.Exxtra.24.01.15.Jane.Doe.XXX.1080p.MP4-GRP')).toMatchObject({ kind: 'scene', site: 'Brazzers Exxtra', date: '2024-01-15', rest: 'Jane Doe' });
    expect(parseAdultName('Studio.2023.11.02.Some.Title.XXX.720p.MP4-GRP')).toMatchObject({ kind: 'scene', site: 'Studio', date: '2023-11-02' });
  });
  it('reconnaît un film (titre et année)', () => {
    expect(parseAdultName('Mon.Film.Adulte.2023.XXX.1080p.WEB-GRP')).toMatchObject({ kind: 'movie', title: 'Mon Film Adulte', year: 2023 });
    expect(parseAdultName('Titre.Sans.Annee.XXX.1080p.WEB-GRP')).toMatchObject({ kind: 'movie', title: 'Titre Sans Annee' });
  });
  it('refuse une fausse date', () => {
    expect(parseAdultName('Studio.99.13.45.Truc.XXX.1080p-GRP').kind).toBe('movie');
  });
});

describe('ThePornDB : rattachement automatique seulement si le résultat est clair', () => {
  const name = 'Brazzers.Exxtra.24.01.15.Jane.Doe.XXX.1080p.MP4-GRP';

  it('scène : même jour, même site, un seul candidat', () => {
    const hit = scene('1', 'Brazzers Exxtra', '2024-01-15', ['Jane Doe', 'John Smith']);
    expect(pickPorndbMatch(name, [hit, scene('2', 'Brazzers Exxtra', '2024-01-14', ['Jane Doe']), scene('3', 'Autre Site', '2024-01-15', ['Jane Doe'])])).toBe(hit);
  });
  it('scène : le site du nom peut être écrit sans espace', () => {
    const hit = scene('1', 'BrazzersExxtra', '2024-01-15', ['Jane Doe']);
    expect(pickPorndbMatch(name, [hit])).toBe(hit);
  });
  it('scène : deux scènes le même jour sur le même site, départagées par les interprètes du nom', () => {
    const a = scene('1', 'Brazzers Exxtra', '2024-01-15', ['Jane Doe']);
    const b = scene('2', 'Brazzers Exxtra', '2024-01-15', ['Autre Actrice']);
    expect(pickPorndbMatch(name, [b, a])).toBe(a);
  });
  it('scène : ambiguïté (rien ne départage) ou interprète absent de la fiche = pas de rattachement', () => {
    expect(pickPorndbMatch(name, [scene('1', 'Brazzers Exxtra', '2024-01-15', ['X Y']), scene('2', 'Brazzers Exxtra', '2024-01-15', ['Z W'])])).toBeNull();
    expect(pickPorndbMatch(name, [scene('1', 'Brazzers Exxtra', '2024-01-15', ['Quelqu Une Dautre'])])).toBeNull();
    expect(pickPorndbMatch(name, [])).toBeNull();
  });
  it('film : titre exact et année à un an près, un seul candidat', () => {
    const n = 'Mon.Film.Adulte.2023.XXX.1080p.WEB-GRP';
    const hit = movie('1', 'Mon Film Adulte', '2023-05-01');
    expect(pickPorndbMatch(n, [hit, movie('2', 'Mon Film Adulte 2', '2023-05-01')])).toBe(hit);
    expect(pickPorndbMatch(n, [movie('3', 'Mon Film Adulte', '2023-12-31')])?.id).toBe('movie:3');
    expect(pickPorndbMatch(n, [movie('4', 'Mon Film Adulte', '2015-01-01')])).toBeNull(); // autre année
    expect(pickPorndbMatch(n, [movie('1', 'Mon Film Adulte', '2023-05-01'), movie('5', 'Mon Film Adulte', '2023-06-01')])).toBeNull(); // deux candidats
  });
  it('un titre qui ne correspond pas exactement n\'est jamais rattaché', () => {
    expect(pickPorndbMatch('Mon.Film.Adulte.2023.XXX.1080p.WEB-GRP', [movie('1', 'Mon Film Adulte Le Retour', '2023-05-01')])).toBeNull();
  });
});

import { collectStudios, parseStudioId } from './porndb-match';

describe('ThePornDB : studios proposés avec les résultats (packs)', () => {
  const site = (id: string, name: string, logo?: string) => ({ uuid: id, name, logo });

  it('propose le studio des films trouvés, le plus fréquent d\'abord', () => {
    const r = collectStudios([], [{ site: site('a', 'Studio A', 'a.png') }, { site: site('b', 'Studio B') }, { site: site('a', 'Studio A') }, { site: site('a', 'Studio A') }]);
    expect(r.map((s) => s.name)).toEqual(['Studio A', 'Studio B']);
    expect(r[0].count).toBe(3);
    expect(r[0].logo).toBe('a.png');
  });

  it('les studios trouvés par la recherche de sites passent avant', () => {
    const r = collectStudios([site('z', 'Studio Z')], [{ site: site('a', 'Studio A') }, { site: site('a', 'Studio A') }]);
    expect(r.map((s) => s.name)).toEqual(['Studio Z', 'Studio A']);
    expect(r[0].direct).toBe(true);
  });

  it('ignore les résultats sans studio ou sans identifiant, et limite la liste', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ site: site(`s${i}`, `S${i}`) }));
    expect(collectStudios([], [{}, { site: { name: 'Sans id' } }, { site: { uuid: 'x' } }])).toEqual([]);
    expect(collectStudios([], many)).toHaveLength(5);
  });

  it('l\'identifiant d\'un studio embarque son nom (la fiche reste créable sans le détail)', () => {
    const [s] = collectStudios([], [{ site: site('u-1', 'Studio & Co') }]);
    expect(s.id.startsWith('studio:u-1:')).toBe(true);
    expect(parseStudioId(s.id)).toEqual({ uuid: 'u-1', name: 'Studio & Co' });
    expect(parseStudioId('studio:u-2')).toEqual({ uuid: 'u-2', name: '' });
    expect(parseStudioId('scene:abc')).toBeNull();
  });
});
