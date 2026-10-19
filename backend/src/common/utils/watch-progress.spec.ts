import { isFinished, isResumable, nextEpisodes, numOf, numVariants, pickRelease, seriesTitleOf } from './watch-progress';

describe('continuer à regarder', () => {
  it('reconnaît un épisode terminé ou à reprendre', () => {
    expect(isFinished({ positionSeconds: 2570, durationSeconds: 2600 })).toBe(true); // 30 s de la fin
    expect(isFinished({ positionSeconds: 2400, durationSeconds: 2600 })).toBe(true); // 92 %
    expect(isFinished({ positionSeconds: 1000, durationSeconds: 2600 })).toBe(false);
    expect(isFinished({ positionSeconds: 5000, durationSeconds: null })).toBe(false);
    expect(isResumable({ positionSeconds: 100, durationSeconds: 2600 })).toBe(false); // à peine commencé
    expect(isResumable({ positionSeconds: 1000, durationSeconds: 2600 })).toBe(true);
    expect(isResumable({ positionSeconds: 2590, durationSeconds: 2600 })).toBe(false); // fini
  });
  it('lit les numéros de saison et d\'épisode', () => {
    expect(numOf('05')).toBe(5);
    expect(numOf('S02')).toBe(2);
    expect(numOf(null)).toBeNull();
    expect(numOf('')).toBeNull();
    expect(numVariants(5)).toEqual(['5', '05']);
    expect(numVariants(12)).toEqual(['12', '12']);
  });
  it('propose l\'épisode suivant puis le début de la saison suivante', () => {
    expect(nextEpisodes(1, 5)).toEqual([{ season: 1, episode: 6 }, { season: 2, episode: 1 }]);
  });
  it('extrait le titre de la série', () => {
    expect(seriesTitleOf('Youth.S01E05.MULTI.AD.2160p.WEB.AC3.5.1.H265-MTLQC')).toBe('Youth');
    expect(seriesTitleOf('Le.Gros.Laboratoire.S07E05.FRENCH.1080p-SiC')).toBe('Le Gros Laboratoire');
    expect(seriesTitleOf('Un film sans épisode 2024')).toBe('Un film sans épisode 2024');
  });
  it('choisit la release la plus proche de ce que le membre regardait', () => {
    const a = { id: 'a', resolution: '1080p', language: 'MULTI.VFF', seeders: 1 };
    const b = { id: 'b', resolution: '2160p', language: 'MULTI.VFF', seeders: 9 };
    const c = { id: 'c', resolution: '1080p', language: 'VFQ', seeders: 0 };
    expect(pickRelease([a, b, c], { resolution: '1080p', language: 'MULTI.VFF' })?.id).toBe('a');
    expect(pickRelease([b, c], { resolution: '2160p' })?.id).toBe('b');
    expect(pickRelease([], {})).toBeNull();
  });
});
