import { detectReleaseMeta } from './release-meta';

const MEDIAINFO = (audio: string[], text: string[] = []) =>
  'General\nFormat : Matroska\n\nVideo\nWidth : 1 920 pixels\nHeight : 800 pixels\n\n' +
  audio.map((l, i) => `Audio #${i + 1}\nLanguage : ${l}\n`).join('\n') +
  text.map((l, i) => `\nText #${i + 1}\nLanguage : ${l}\n`).join('');

describe('détection des métadonnées d\'une release (priorité : VFQ)', () => {
  it('VFQ explicite dans le nom', () => {
    expect(detectReleaseMeta('STAT.S05E05.VFQ.AD.1080p.WEB.AAC.2.0.H264-BIFROST').language).toBe('VFQ');
    expect(detectReleaseMeta('Indefendable.S05E18.VFQ.AD.1080p.WEB.AAC.2.0.H264-BIFROST').language).toBe('VFQ');
    expect(detectReleaseMeta('Film.2024.VQ.1080p.WEB-DL.x264-GRP').language).toBe('VFQ');
  });

  it('VF2 (France + Québec) et MULTi.VFQ comptent comme VFQ', () => {
    expect(detectReleaseMeta('Spider-Man.Brand.New.Day.2026.MULTi.VF2.1080p.AMZN.WEB.x265.DDP5.1-P4TRi0T').language).toBe('VFQ');
    expect(detectReleaseMeta('Un.Film.2025.MULTi.VFQ.VFF.1080p.WEB.H264-GRP').language).toBe('VFQ');
  });

  it('les autres langues du nom', () => {
    expect(detectReleaseMeta('Colony.2026.MULTi.1080p.WEB.H264-SUPPLY').language).toBe('MULTI');
    expect(detectReleaseMeta('Chasseurs.d.Heritiers.S02E07.FRENCH.AD.1080p.WEB.AC3.5.1.H265-MTLQC').language).toBe('VF');
    expect(detectReleaseMeta('Good.Boy.2022.FANSUB.VOSTFR.1080p.BluRay.AVC.DTS-HDMA.5.1-ARTHECL0WN').language).toBe('VOSTFR');
    expect(detectReleaseMeta('Bullhead.2011.MULTi.VFi.1080i.BluRay.REMUX.AVC.DTS-HD.MA.5.1-HDForever').language).toBe('MULTI');
    expect(detectReleaseMeta('Film.2020.TRUEFRENCH.1080p.BluRay.x264-GRP').language).toBe('VFF');
  });

  it('VFQ trouvé dans le MediaInfo même si le nom ne le dit pas (piste French (CA))', () => {
    expect(detectReleaseMeta('Stat.S05E05.FRENCH.AD.1080p.WEB.AAC.2.0.H264-MTLQC', MEDIAINFO(['French (CA)'])).language).toBe('VFQ');
    expect(detectReleaseMeta('Colony.2026.MULTi.1080p.WEB.H264-SUPPLY', MEDIAINFO(['French (FR)', 'English', 'French (CA)'])).language).toBe('VFQ');
  });

  it('titre de piste audio mentionnant le Québec', () => {
    const nfo = 'General\nFormat : Matroska\n\nAudio #1\nLanguage : French\nTitle : VFQ 5.1\n';
    expect(detectReleaseMeta('Film.2025.MULTi.1080p.WEB.H264-GRP', nfo).language).toBe('VFQ');
  });

  it('sans VFQ dans le MediaInfo : déduit des pistes', () => {
    expect(detectReleaseMeta('Film.2025.1080p.WEB.H264-GRP', MEDIAINFO(['French'])).language).toBe('VF');
    expect(detectReleaseMeta('Film.2025.1080p.WEB.H264-GRP', MEDIAINFO(['French', 'English'])).language).toBe('MULTI');
    expect(detectReleaseMeta('Film.2025.1080p.WEB.H264-GRP', MEDIAINFO(['English'], ['French'])).language).toBe('VOSTFR');
  });

  it('un nom sans aucune indication de langue reste sans langue', () => {
    expect(detectReleaseMeta('Film.2025.1080p.WEB.H264-GRP').language).toBeUndefined();
  });

  it('résolution, source, codec, année, épisode', () => {
    const m = detectReleaseMeta('Stranger.Things.Tales.from.85.S02.MULTi.VF2.2160p.NF.WEB-DL.H265.HYBRiD.DV.HDR.DDP5.1.Atmos-P4TRi0T');
    expect(m).toMatchObject({ resolution: '4K/2160p', source: 'WEB-DL', codec: 'x265/HEVC', hdr: true, audio: 'Atmos', season: '2', episode: 'Saison complète', language: 'VFQ' });
    const e = detectReleaseMeta('Brothers.2026.S01E04.MULTi.1080p.WEB.H264-SUPPLY');
    expect(e).toMatchObject({ year: 2026, season: '1', episode: '4', resolution: '1080p', source: 'WEB-DL', codec: 'x264' });
    expect(detectReleaseMeta('Bullhead.2011.MULTi.VFi.1080i.BluRay.REMUX.AVC.DTS-HD.MA.5.1-HDForever')).toMatchObject({ source: 'Remux', resolution: '1080p', year: 2011 });
  });

  it('la résolution vient aussi de la taille de l\'image du MediaInfo', () => {
    expect(detectReleaseMeta('Film.2025.MULTi.WEB-GRP', MEDIAINFO([])).resolution).toBe('1080p');
  });
});
