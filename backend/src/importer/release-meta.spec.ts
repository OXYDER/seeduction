import { detectReleaseMeta } from './release-meta';
import { languageAtoms, normalizeLanguage, storedValuesFor } from '../common/utils/language';

const MEDIAINFO = (audio: string[], text: string[] = [], titles: Record<number, string> = {}) =>
  'General\nFormat : Matroska\n\nVideo\nWidth : 1 920 pixels\nHeight : 800 pixels\n\n' +
  audio.map((l, i) => `Audio #${i + 1}\nLanguage : ${l}\n${titles[i] ? `Title : ${titles[i]}\n` : ''}`).join('\n') +
  text.map((l, i) => `\nText #${i + 1}\nLanguage : ${l}\n`).join('');

const lang = (name: string, nfo = '') => detectReleaseMeta(name, nfo).language;

describe('langue d\'une release selon la règle de Seeduction', () => {
  it('une seule piste française : VOF, TRUEFRENCH, VFF, VFI, VFB, VFQ', () => {
    expect(lang('The.Bear.S04.VOF.1080p.WEB.EAC3.5.1.H264-TFA')).toBe('VOF');
    expect(lang('The.Incredibles.2004.TRUEFRENCH.1080p.BluRay.DTS.HD.MA.5.1.x264-LOST')).toBe('TRUEFRENCH');
    expect(lang('Lego.Batman.Le.Film.2017.VFF.2160p.BluRay.4KLight.HDR10.AC3.5.1.x265-QTZ')).toBe('VFF');
    expect(lang('The.Mandalorian.S01.VFI.2160p.WEB.HDR10.AC3.5.1.H265-FW')).toBe('VFI');
    expect(lang('Twisters.2024.VFB.2160p.WEB.HDR.EAC3.5.1.H265-FW')).toBe('VFB');
    expect(lang('Twisters.2024.VFQ.2160p.WEB.HDR.EAC3.5.1.H265-FW')).toBe('VFQ');
    expect(lang('STAT.S05E05.VFQ.AD.1080p.WEB.AAC.2.0.H264-BIFROST')).toBe('VFQ');
  });

  it('plusieurs langues avec une piste française : MULTI + précision', () => {
    expect(lang('The.Bear.S04.MULTI.VOF.1080p.WEB.EAC3.5.1.H264-TFA')).toBe('MULTI.VOF');
    expect(lang('The.Incredibles.2004.MULTI.TRUEFRENCH.1080p.BluRay.DTS.HD.MA.5.1.x264-LOST')).toBe('MULTI.TRUEFRENCH');
    expect(lang('Lego.Batman.Le.Film.2017.MULTI.VFF.2160p.BluRay.4KLight.HDR10.AC3.5.1.x265-QTZ')).toBe('MULTI.VFF');
    expect(lang('The.Mandalorian.S01.MULTI.VFI.2160p.WEB.HDR10.AC3.5.1.H265-FW')).toBe('MULTI.VFI');
    expect(lang('Twisters.2024.MULTI.VFQ.2160p.WEB.HDR.EAC3.5.1.H265-FW')).toBe('MULTI.VFQ');
    expect(lang('Bullhead.2011.MULTi.VFi.1080i.BluRay.REMUX.AVC.DTS-HD.MA.5.1-HDForever')).toBe('MULTI.VFI');
  });

  it('VFF + VFQ : MULTI.VF2', () => {
    expect(lang('Severance.S01.MULTI.VF2.1080p.WEB.EAC3.5.1.H264-FW')).toBe('MULTI.VF2');
    expect(lang('Spider-Man.Brand.New.Day.2026.MULTi.VF2.1080p.AMZN.WEB.x265.DDP5.1-P4TRi0T')).toBe('MULTI.VF2');
    expect(lang('Film.2025.MULTI.VFF.VFQ.1080p.WEB.H264-GRP')).toBe('MULTI.VF2');
    expect(lang('Film.2025.MULTi.1080p.WEB.H264-GRP', MEDIAINFO(['French (FR)', 'French (CA)', 'English']))).toBe('MULTI.VF2');
  });

  it('aucune piste française : VOSTFR (sous-titres FR), MUET', () => {
    expect(lang('Good.Boy.2022.FANSUB.VOSTFR.1080p.BluRay.AVC.DTS-HDMA.5.1-ARTHECL0WN')).toBe('VOSTFR');
    expect(lang('The.Bear.S04.MUET.1080p.WEB.EAC3.5.1.H264-TF')).toBe('MUET');
    expect(lang('The.Bear.S04.MUET.VOSTFR.1080p.WEB.EAC3.5.1.H264-TF')).toBe('MUET.VOSTFR');
    expect(lang('Film.2025.1080p.WEB.H264-GRP', MEDIAINFO(['English'], ['French']))).toBe('VOSTFR');
  });

  it('le MediaInfo précise un nom vague (FRENCH / MULTi)', () => {
    expect(lang('Stat.S05E05.FRENCH.AD.1080p.WEB.AAC.2.0.H264-MTLQC', MEDIAINFO(['French (CA)']))).toBe('VFQ');
    expect(lang('Colony.2026.MULTi.1080p.WEB.H264-SUPPLY', MEDIAINFO(['French (CA)', 'English']))).toBe('MULTI.VFQ');
    expect(lang('Colony.2026.MULTi.1080p.WEB.H264-SUPPLY', MEDIAINFO(['English', 'French (BE)']))).toBe('MULTI.VFB');
    expect(lang('Film.2025.1080p.WEB.H264-GRP', MEDIAINFO(['French'], [], { 0: 'VFQ 5.1' }))).toBe('VFQ');
    expect(lang('Film.2025.1080p.WEB.H264-GRP', MEDIAINFO(['French']))).toBe('VFF');
  });

  it('le nom dit VFQ seul mais le fichier a d\'autres langues : MULTI.VFQ', () => {
    expect(lang('Film.2025.VFQ.1080p.WEB.H264-GRP', MEDIAINFO(['French (CA)', 'English']))).toBe('MULTI.VFQ');
  });

  it('un nom vague sans MediaInfo reste sans langue', () => {
    expect(lang('Film.2025.1080p.WEB.H264-GRP')).toBeUndefined();
    expect(lang('Colony.2026.MULTi.1080p.WEB.H264-SUPPLY')).toBeUndefined();
    expect(lang('Alertes.S06E17.FRENCH.AD.1080p.WEB.AAC.2.0.H264-MTLQC')).toBeUndefined();
  });

  it('résolution, source, codec, année, épisode', () => {
    const m = detectReleaseMeta('Stranger.Things.Tales.from.85.S02.MULTI.VF2.2160p.NF.WEB-DL.H265.HYBRiD.DV.HDR.DDP5.1.Atmos-P4TRi0T');
    expect(m).toMatchObject({ resolution: '4K/2160p', source: 'WEB-DL', codec: 'x265/HEVC', hdr: true, audio: 'Atmos', season: '2', episode: 'Saison complète', language: 'MULTI.VF2' });
    const e = detectReleaseMeta('Brothers.2026.S01E04.MULTi.VFQ.1080p.WEB.H264-SUPPLY');
    expect(e).toMatchObject({ year: 2026, season: '1', episode: '4', resolution: '1080p', source: 'WEB-DL', codec: 'x264', language: 'MULTI.VFQ' });
  });
});

describe('étiquettes de langue : normalisation et filtres', () => {
  it('normalise les saisies libres', () => {
    expect(normalizeLanguage('multi vfq')).toBe('MULTI.VFQ');
    expect(normalizeLanguage('Multi-VFQ')).toBe('MULTI.VFQ');
    expect(normalizeLanguage('vf2')).toBe('MULTI.VF2');
    expect(normalizeLanguage('MULTI VFF VFQ')).toBe('MULTI.VF2');
    expect(normalizeLanguage('  ')).toBeUndefined();
  });

  it('un filtre VFQ retrouve VFQ, MULTI.VFQ et MULTI.VF2 (pas MULTI.VFF)', () => {
    const v = storedValuesFor('VFQ')!;
    expect(v).toEqual(expect.arrayContaining(['VFQ', 'MULTI.VFQ', 'MULTI.VF2']));
    expect(v).not.toContain('MULTI.VFF');
    expect(storedValuesFor('VFF')).toEqual(expect.arrayContaining(['VFF', 'MULTI.VFF', 'MULTI.VF2']));
  });

  it('un filtre MULTI retrouve toutes les étiquettes MULTI, y compris l\'ancienne valeur', () => {
    const v = storedValuesFor('MULTI')!;
    expect(v).toEqual(expect.arrayContaining(['MULTI', 'MULTI.VFQ', 'MULTI.VF2', 'MULTI.VOF']));
    expect(v).not.toContain('VFQ');
  });

  it('VOSTFR retrouve MUET.VOSTFR ; atome inconnu = null', () => {
    expect(storedValuesFor('VOSTFR')).toEqual(expect.arrayContaining(['VOSTFR', 'MUET.VOSTFR']));
    expect(storedValuesFor('KLINGON')).toBeNull();
  });

  it('atomes d\'une étiquette', () => {
    expect(languageAtoms('MULTI.VF2').sort()).toEqual(['MULTI', 'VF2', 'VFF', 'VFQ']);
    expect(languageAtoms('MUET.VOSTFR').sort()).toEqual(['MUET', 'VOSTFR']);
  });
});
