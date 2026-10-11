import { buildPackBBCode, frenchDate, sortChronologically } from './pack-description';

const film = (titre: string, extra: any = {}) => ({ titre, ...extra });

describe('description d\'un pack de films', () => {
  it('ordre chronologique de sortie, sans date en dernier', () => {
    const sorted = sortChronologically([
      film('Troisième', { releaseDate: '2015-06-10' }), film('Sans date', {}), film('Premier', { releaseDate: '2001-12-19' }),
      film('Année seule', { année: '2010' }), film('Deuxième', { releaseDate: '2003-05-01' }),
    ]);
    expect(sorted.map((f) => f.titre)).toEqual(['Premier', 'Deuxième', 'Année seule', 'Troisième', 'Sans date']);
  });

  it('dates en français', () => {
    expect(frenchDate('2012-05-04')).toBe('4 mai 2012');
    expect(frenchDate('2012-12-01')).toBe('1er décembre 2012');
    expect(frenchDate('2012-05')).toBe('mai 2012');
    expect(frenchDate('2012')).toBe('2012');
    expect(frenchDate('n’importe quoi')).toBe('');
    expect(frenchDate(null)).toBe('');
  });

  it('un bloc par film dans l\'ordre, sommaire numéroté, infos du torrent une seule fois', () => {
    const out = buildPackBBCode(
      [film('Le Retour', { année: '2012', releaseDate: '2012-05-04', description: 'Suite.', réalisateur: 'B' }), film('Le Début', { année: '2005', releaseDate: '2005-03-02', affiche: '/api/covers/a.webp', genre: 'Action', description: 'Début.' })],
      { taille: '12 Go', langue: 'MULTI.VFF', vidéo: 'x265', fichiers: '- a.mkv\n- b.mkv', nb_fichiers: '2' },
    );
    expect(out).toContain('Pack de 2 films');
    expect(out.indexOf('1. Le Début (2005)')).toBeLessThan(out.indexOf('2. Le Retour (2012)'));
    expect(out).toContain('[img]/api/covers/a.webp[/img]');
    expect(out).toContain('Sortie :[/color] 2 mars 2005');
    expect(out.match(/Taille :/g)).toHaveLength(1);
    expect(out.match(/Langue :/g)).toHaveLength(1);
    expect(out).toContain('Contenu');
    expect(out).toContain('- a.mkv');
    expect(out.indexOf('Synopsis')).toBeLessThan(out.indexOf('Le torrent'));
  });

  it('champs vides omis, pas de ligne vide en trop, un seul film au singulier', () => {
    const out = buildPackBBCode([film('Seul')], {});
    expect(out).toContain('Pack de 1 film');
    expect(out).not.toContain('Pack de 1 films');
    expect(out).not.toContain(' :[/color] \n');
    expect(out).not.toMatch(/\n{3,}/);
    expect(out).not.toContain('Le torrent');
  });

  it('ignore les entrées sans titre', () => {
    expect(buildPackBBCode([film(''), film('Ok')] as any, {})).toContain('Pack de 1 film');
  });
});
