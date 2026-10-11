import { containerOf } from './container-format';

describe('format du fichier vidéo (conteneur)', () => {
  it('extension du plus gros fichier vidéo', () => {
    expect(containerOf([{ path: 'Film/Film.mkv', size: 8e9 }, { path: 'Film/Film.nfo', size: 4e3 }])).toBe('MKV');
    expect(containerOf([{ path: 'Film.2020.mp4', size: 2e9 }])).toBe('MP4');
    expect(containerOf([{ path: 'a.avi', size: 7e8 }])).toBe('AVI');
  });

  it('ignore les échantillons, bandes-annonces et bonus', () => {
    expect(containerOf([{ path: 'Film.mkv', size: 8e9 }, { path: 'Sample/sample.mp4', size: 5e7 }, { path: 'Extras/Making.of.avi', size: 1e9 }])).toBe('MKV');
    expect(containerOf([{ path: 'Film.2020.1080p.mkv', size: 8e9 }, { path: 'Film-trailer.mp4', size: 5e7 }])).toBe('MKV');
  });

  it('une série : le format le plus présent par la taille', () => {
    expect(containerOf([1, 2, 3].map((n) => ({ path: `S01E0${n}.mkv`, size: 1e9 })))).toBe('MKV');
  });

  it('rien de vidéo : null (musique, logiciels, livres)', () => {
    expect(containerOf([{ path: 'a.mp3', size: 5e6 }, { path: 'setup.exe', size: 1e8 }])).toBeNull();
    expect(containerOf([])).toBeNull();
  });
});
