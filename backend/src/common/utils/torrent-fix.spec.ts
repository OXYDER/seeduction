import { diffFixChanges, fixProblem, sanitizeFixChanges } from './torrent-fix';

describe('sanitizeFixChanges', () => {
  it('garde les champs permis, rogne le texte et ignore le reste', () => {
    const c = sanitizeFixChanges({ resolution: '  1080p ', source: 'WEB-DL', secret: 'x', uploaderId: 'pirate', season: '  02 ', year: '2019' });
    expect(c).toEqual({ resolution: '1080p', source: 'WEB-DL', season: '02', year: 2019 });
  });
  it('refuse une année absurde et une langue inconnue', () => {
    expect(() => sanitizeFixChanges({ year: 1700 })).toThrow(/Année/);
    expect(() => sanitizeFixChanges({ year: 'abc' })).toThrow(/Année/);
    expect(() => sanitizeFixChanges({ language: 'klingon-de-la-lune' })).toThrow(/Langue/);
  });
  it('normalise la langue et ignore les valeurs vides', () => {
    expect(sanitizeFixChanges({ language: 'multi vfq', codec: '   ', audio: null })).toEqual({ language: 'MULTI.VFQ' });
    expect(sanitizeFixChanges(null)).toEqual({});
    expect(sanitizeFixChanges([1, 2])).toEqual({});
  });
});

describe('diffFixChanges', () => {
  it('ne garde que ce qui change vraiment (sans tenir compte de la casse)', () => {
    const d = diffFixChanges({ resolution: '1080p', source: 'web-dl', season: null }, { resolution: '1080P', source: 'BluRay', season: '01' });
    expect(Object.keys(d)).toEqual(['source', 'season']);
    expect(d.source).toEqual({ from: 'web-dl', to: 'BluRay' });
    expect(d.season.from).toBeNull();
  });
});

describe('fixProblem', () => {
  it('exige une explication', () => {
    expect(fixProblem({ language: 'fr' }, 'oups')).toMatch(/Explique/);
    expect(fixProblem({ language: 'fr' }, 'La piste audio est bien en français')).toBeNull();
  });
  it('sans correction précise, une description plus longue est demandée', () => {
    expect(fixProblem({}, 'Quelque chose cloche ici')).toMatch(/louche/);
    expect(fixProblem({}, 'Le nom ne correspond pas du tout au contenu du fichier')).toBeNull();
  });
});
