import { audioLanguageNames, otherAudioLanguages, subtitleNames } from './language-names';

const MEDIAINFO = `General
Complete name : Show.S01E01.MULTi.1080p.WEB.x265.mkv

Video
Format : HEVC

Audio #1
Language : French (CA)
Format : E-AC-3

Audio #2
Language : English
Format : E-AC-3

Audio #3
Language : Spanish (Latin America)

Text #1
Language : French
`;

describe('noms de langues', () => {
  it('traduit la variante française de l\'étiquette', () => {
    expect(audioLanguageNames('VFF')).toEqual(['Français (France)']);
    expect(audioLanguageNames('TRUEFRENCH')).toEqual(['Français (France)']);
    expect(audioLanguageNames('VFQ')).toEqual(['Français (Québec)']);
    expect(audioLanguageNames('VFI')).toEqual(['Français (International)']);
    expect(audioLanguageNames('VFB')).toEqual(['Français (Belgique)']);
    expect(audioLanguageNames('MULTI.VF2')).toEqual(['Français (France)', 'Français (Québec)', 'Autres langues']);
  });
  it('lit les autres pistes dans le MediaInfo, sans compter les sous-titres', () => {
    expect(otherAudioLanguages(MEDIAINFO)).toEqual(['Anglais', 'Espagnol (Amérique latine)']);
    expect(audioLanguageNames('MULTI.VFQ', MEDIAINFO)).toEqual(['Français (Québec)', 'Anglais', 'Espagnol (Amérique latine)']);
  });
  it("une release MULTI sans détail finit par « Autres langues », une VO par « Version originale »", () => {
    expect(audioLanguageNames('MULTI.VFF')).toEqual(['Français (France)', 'Autres langues']);
    expect(audioLanguageNames('VO')).toEqual(['Version originale']);
    expect(audioLanguageNames('VO', 'Audio #1\nLanguage : Japanese')).toEqual(['Japonais']);
    expect(audioLanguageNames('MUET')).toEqual(['Muet']);
    expect(audioLanguageNames(null)).toEqual([]);
  });
  it('lit une ligne audio de NFO texte', () => {
    expect(otherAudioLanguages('Audio : French E-AC-3 5.1 / English E-AC-3 5.1 | S: French')).toEqual(['Anglais']);
  });
  it('nomme les sous-titres', () => {
    expect(subtitleNames(['FR', 'EN', 'FR forcés', 'FR'])).toEqual(['Français', 'Anglais', 'Français (forcés)']);
    expect(subtitleNames(null)).toEqual([]);
  });
});
