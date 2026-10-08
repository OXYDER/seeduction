import { audioOf } from './audio-codec';
import { detectReleaseMeta } from './release-meta';

describe('codec audio', () => {
  it('lu dans le nom de la release', () => {
    expect(audioOf('Les.Enfants.de.la.Tele.S17E03.FRENCH.AD.1080p.WEB.AAC.2.0.H264-MTLQC')).toBe('AAC');
    expect(audioOf('Occupation.Double.Bali.S01.FRENCH.1080p.WEB.AC3.5.1.H264-MTLQC')).toBe('AC3');
    expect(audioOf('Lanterns.S01.MULTi.VFF.AD.2160p.WEB.AC3.5.1.H265-MTLQC')).toBe('AC3');
    expect(audioOf('Wolrdbreaker.2025.Cust.Repack.MULTi.VFi.1080p.mHD.x264.E-AC3.5.1-XSHD')).toBe('E-AC3');
    expect(audioOf('Fall.2.Deadpoint.2026.MULTi.1080p.WEB.x265.DDP5.1-P4TRiOT')).toBe('E-AC3');
    expect(audioOf('Bullhead.2011.MULTi.VFi.1080i.BluRay.REMUX.AVC.DTS-HD.MA.5.1-HDForever')).toBe('DTS');
    expect(audioOf('Film.2025.2160p.UHD.BluRay.REMUX.TrueHD.Atmos.7.1')).toBe('Atmos');
    expect(audioOf('Film.2025.1080p.BluRay.TrueHD.5.1')).toBe('TrueHD');
    expect(audioOf('Album.2020.FLAC-GRP')).toBe('FLAC');
    expect(audioOf('Film.2025.1080p.WEB.Opus.5.1')).toBe('Opus');
  });

  it('aucun codec dans le nom : lu dans les pistes audio du MediaInfo (anglais ou français)', () => {
    const mi = (fmt: string) => `General\nFormat : Matroska\n\nVideo\nFormat : HEVC\n\nAudio #1\nFormat : ${fmt}\nLanguage : French\n`;
    expect(audioOf('Quelque.Chose.2025.1080p.WEB-GRP', mi('E-AC-3'))).toBe('E-AC3');
    expect(audioOf('Quelque.Chose.2025.1080p.WEB-GRP', mi('AC-3'))).toBe('AC3');
    expect(audioOf('Quelque.Chose.2025.1080p.WEB-GRP', mi('AAC LC'))).toBe('AAC');
    expect(audioOf('Quelque.Chose.2025.1080p.WEB-GRP', mi('MLP FBA'))).toBe('TrueHD');
    expect(audioOf('Quelque.Chose.2025.1080p.WEB-GRP', 'Général\nFormat : Matroska\n\nVidéo\nFormat : AVC\n\nAudio #1\nFormat : DTS\n')).toBe('DTS');
    // le format de la section vidéo n'est jamais pris pour de l'audio
    expect(audioOf('Quelque.Chose.2025.1080p.WEB-GRP', 'Video\nFormat : HEVC\n')).toBeUndefined();
    expect(audioOf('Quelque.Chose.2025.1080p.WEB-GRP')).toBeUndefined();
  });

  it("l'import enregistre le codec audio (nom ou MediaInfo)", () => {
    expect(detectReleaseMeta('Serie.S01E01.FRENCH.1080p.WEB.AC3.5.1.H264-GRP').audio).toBe('AC3');
    expect(detectReleaseMeta('Film.2025.1080p.WEB-GRP', 'Audio\nFormat : E-AC-3\n').audio).toBe('E-AC3');
  });
});
