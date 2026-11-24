import { cleanTitle } from './recommendations.service';

describe('cleanTitle', () => {
  it('transforme un nom de release en titre avec année', () => {
    expect(cleanTitle('Blade.Runner.2049.2017.1080p.WEB-DL.x264-GRP')).toBe('Blade Runner 2049 (2017)');
    expect(cleanTitle('Dune.Part.Two.2024.2160p.UHD.BluRay')).toBe('Dune Part Two (2024)');
  });
  it('coupe au format ou à la saison quand il n\'y a pas d\'année', () => {
    expect(cleanTitle('Severance.S02E04.1080p.WEB')).toBe('Severance');
    expect(cleanTitle('Some_Show_720p_x264')).toBe('Some Show');
  });
  it('garde un nom simple tel quel', () => {
    expect(cleanTitle('Interstellar')).toBe('Interstellar');
  });
});
