import { memberHourly, rarityBonus, sizeWeight, torrentHourly } from './bonus-rate';

const GB = 1e9;

describe('poids du fichier', () => {
  it('4 Go vaut 1 ; un petit fichier vaut presque rien', () => {
    expect(sizeWeight(4 * GB)).toBeCloseTo(1, 5);
    expect(sizeWeight(1 * GB)).toBeCloseTo(0.294, 2);
    expect(sizeWeight(1e6)).toBeCloseTo(0.059, 2);
    expect(sizeWeight(0)).toBeCloseTo(0.0588, 3);
  });
  it('monte doucement au-delà de 4 Go', () => {
    expect(sizeWeight(25 * GB)).toBeCloseTo(1.26, 2);
    expect(sizeWeight(60 * GB)).toBeCloseTo(1.39, 2);
    expect(sizeWeight(60 * GB)).toBeGreaterThan(sizeWeight(25 * GB));
  });
});

describe('bonus de rareté', () => {
  it('plus un torrent est rare, plus il rapporte', () => {
    expect(rarityBonus(1)).toBe(2);
    expect(rarityBonus(3)).toBe(2);
    expect(rarityBonus(4)).toBe(1.5);
    expect(rarityBonus(10)).toBe(1.5);
    expect(rarityBonus(30)).toBe(1.2);
    expect(rarityBonus(200)).toBe(1);
  });
});

describe('points par heure', () => {
  it('un gros torrent rare rapporte bien plus qu\'un petit torrent très seedé', () => {
    expect(torrentHourly(8 * GB, 2, 1)).toBeCloseTo(2.2, 1);
    expect(torrentHourly(50 * 1e6, 300, 1)).toBeLessThan(0.1);
  });
  it('total d\'un membre : les torrents les plus rentables d\'abord, avec un plafond', () => {
    const list = [{ size: 4 * GB, seeders: 100 }, { size: 4 * GB, seeders: 2 }, { size: 1e6, seeders: 100 }];
    expect(memberHourly(list, 1, 10)).toBeCloseTo(3.06, 1);
    expect(memberHourly(list, 1, 1)).toBe(2);
    expect(memberHourly([], 1, 10)).toBe(0);
  });
});
