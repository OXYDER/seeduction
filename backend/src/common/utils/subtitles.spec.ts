import { subtitleFilesOf, subtitleNames, subtitlesOf } from './subtitles';

const MI = (tracks: string[]) => 'General\nFormat : Matroska\n\nVideo\nFormat : HEVC\n\nAudio #1\nLanguage : French\n\n' + tracks.map((t, i) => `Text #${i + 1}\n${t}\n`).join('\n');

describe('sous-titres d\'une release', () => {
  it('pistes « Text » d\'un MediaInfo, dans l\'ordre, sans doublon', () => {
    expect(subtitlesOf('Film.2025.MULTi.1080p.WEB-GRP', MI(['Language : French', 'Language : English', 'Language : French']))).toEqual(['FR', 'EN']);
  });

  it('forcés et SDH', () => {
    expect(subtitlesOf('x', MI(['Language : French\nForced : Yes', 'Language : French\nTitle : SDH', 'Language : English']))).toEqual(['FR forcés', 'FR SDH', 'EN']);
  });

  it('français canadien et noms de langue en français', () => {
    expect(subtitlesOf('x', MI(['Language : French (CA)']))).toEqual(['FR-CA']);
    expect(subtitlesOf('x', MI(['Language : Anglais', 'Language : Espagnol']))).toEqual(['EN', 'ES']);
  });

  it('une piste audio n\'est jamais prise pour des sous-titres', () => {
    expect(subtitlesOf('x', 'Audio #1\nLanguage : English\n\nAudio #2\nLanguage : French\n')).toEqual([]);
  });

  it('NFO texte : « Sous-titres : Français, Anglais » et variantes', () => {
    expect(subtitlesOf('x', 'Sous-titres : Français, Anglais (SRT)')).toEqual(['FR', 'EN']);
    expect(subtitlesOf('x', 'Subtitles ........: French / Spanish')).toEqual(['FR', 'ES']);
    expect(subtitlesOf('x', 'A: French E-AC-3 5.1 | S: French, English')).toEqual(['FR', 'EN']);
    expect(subtitlesOf('x', '│ Subtitle : French (Canadien) SDH ↔ SRT │')).toEqual(['FR-CA SDH']);
  });

  it('le nom : VOSTFR annonce des sous-titres français, seulement sans autre source', () => {
    expect(subtitlesOf('Film.2025.VOSTFR.1080p.WEB-GRP', '')).toEqual(['FR']);
    expect(subtitlesOf('Film.2025.VOSTFR.1080p.WEB-GRP', MI(['Language : French', 'Language : English']))).toEqual(['FR', 'EN']);
    expect(subtitlesOf('Film.2025.MULTi.1080p.WEB-GRP', '')).toEqual([]);
  });

  it('langues inconnues ignorées, 12 au maximum', () => {
    expect(subtitlesOf('x', MI(['Language : Klingon']))).toEqual([]);
    const many = ['French', 'English', 'Spanish', 'German', 'Italian', 'Portuguese', 'Japanese', 'Korean', 'Chinese', 'Russian', 'Arabic', 'Dutch', 'Polish', 'Turkish'];
    expect(subtitlesOf('x', MI(many.map((l) => `Language : ${l}`)))).toHaveLength(12);
  });

  it('noms lisibles pour l\'affichage', () => {
    expect(subtitleNames(['FR', 'EN', 'FR forcés', 'FR-CA'])).toBe('Français, Anglais, Français forcés, Français (Canada)');
  });
});

describe('sous-titres livrés en fichiers dans le torrent', () => {
  const f = (...paths: string[]) => paths.map((path) => ({ path }));

  it('langue lue dans le nom du fichier', () => {
    expect(subtitleFilesOf(f('Film.2020/Film.2020.1080p.mkv', 'Film.2020/Film.2020.French.srt', 'Film.2020/Film.2020.English.srt'))).toEqual(['FR', 'EN']);
    expect(subtitleFilesOf(f('Film.2020.fre.srt', 'Film.2020.eng.ass'))).toEqual(['FR', 'EN']);
    expect(subtitleFilesOf(f('Film.2020.fr.srt', 'Film.2020.en.srt'))).toEqual(['FR', 'EN']);
  });

  it('dossier Subs, numérotation des releases scène, forcés et SDH', () => {
    expect(subtitleFilesOf(f('Rel/Subs/2_French.srt', 'Rel/Subs/3_English.srt'))).toEqual(['FR', 'EN']);
    expect(subtitleFilesOf(f('Rel/Subs/French/2.srt', 'Rel/Sous-titres/Spanish/1.idx'))).toEqual(['FR', 'ES']);
    expect(subtitleFilesOf(f('Film.fr.forced.srt', 'Film.French.SDH.srt'))).toEqual(['FR forcés', 'FR SDH']);
  });

  it('ignore les fichiers sans langue reconnue et les titres qui ressemblent à une langue', () => {
    expect(subtitleFilesOf(f('Film.2020.srt', 'Subs/3.srt', 'No Country for Old Men.srt', 'Where Is It 2019.srt'))).toEqual([]);
    expect(subtitleFilesOf(f('Film.mkv', 'cover.jpg', 'Film.nfo'))).toEqual([]);
  });

  it("s'ajoute aux sous-titres intégrés, sans doublon", () => {
    expect(subtitlesOf('Film.2025.MULTi.1080p.WEB-GRP', MI(['Language : French']), f('Film.French.srt', 'Film.English.srt'))).toEqual(['FR', 'EN']);
    expect(subtitlesOf('Film.2025.1080p', '', f('Film.2025.1080p.mkv', 'Film.2025.1080p.French.srt'))).toEqual(['FR']);
  });
});
