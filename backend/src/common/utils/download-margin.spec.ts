import { downloadMarginBytes } from './download-margin';

const GB = 1e9;

describe('downloadMarginBytes', () => {
  it('upload ÷ ratio minimum, moins ce qui est déjà téléchargé (ratio minimum 0,5 : le double de l\'upload)', () => {
    expect(downloadMarginBytes(100 * GB, 30 * GB, 0.5, 5 * GB)).toBe(170 * GB);
  });
  it('un ratio minimum plus strict réduit la marge (0,8 : l\'exemple d\'un autre site)', () => {
    expect(downloadMarginBytes(145 * GB, 0, 0.8, 0)).toBeCloseTo(181.25 * GB, -3);
  });
  it('le volume de grâce des nouveaux compte tant que l\'upload ne le dépasse pas', () => {
    expect(downloadMarginBytes(0, 2 * GB, 0.5, 5 * GB)).toBe(3 * GB);
    expect(downloadMarginBytes(1 * GB, 0, 0.5, 5 * GB)).toBe(5 * GB);
  });
  it('jamais négative : sous le ratio minimum, plus aucune marge', () => {
    expect(downloadMarginBytes(10 * GB, 100 * GB, 0.5, 5 * GB)).toBe(0);
  });
  it('sans ratio minimum : pas de limite', () => {
    expect(downloadMarginBytes(10 * GB, 100 * GB, 0, 5 * GB)).toBeNull();
  });
});
