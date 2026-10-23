import { hnrAbandoned } from './economy';

const H = 3600_000;
const now = new Date('2026-10-22T12:00:00Z');
const ago = (h: number) => new Date(now.getTime() - h * H);

describe('hit & run : abandon réel ou simple trou ?', () => {
  it('il seede en ce moment : jamais un abandon', () => {
    expect(hnrAbandoned({ seedingNow: true, lastSeedAt: ago(50), completedAt: ago(60) }, now)).toBe(false);
  });

  it('annonce en retard (ligne de pair purgée, dernier signe de partage récent) : pas un abandon', () => {
    expect(hnrAbandoned({ seedingNow: false, lastSeedAt: ago(1), completedAt: ago(60) }, now)).toBe(false);
    expect(hnrAbandoned({ seedingNow: false, lastSeedAt: ago(2.9), completedAt: ago(60) }, now)).toBe(false);
  });

  it('plus aucun signe de partage depuis 3 h ou plus : abandon', () => {
    expect(hnrAbandoned({ seedingNow: false, lastSeedAt: ago(3), completedAt: ago(60) }, now)).toBe(true);
    expect(hnrAbandoned({ seedingNow: false, lastSeedAt: ago(30), completedAt: ago(60) }, now)).toBe(true);
  });

  it('n\'a jamais seedé : on part de la fin du téléchargement', () => {
    expect(hnrAbandoned({ seedingNow: false, lastSeedAt: null, completedAt: ago(49) }, now)).toBe(true);
  });

  it('le délai est réglable', () => {
    expect(hnrAbandoned({ seedingNow: false, lastSeedAt: ago(5), completedAt: ago(60) }, now, 6)).toBe(false);
    expect(hnrAbandoned({ seedingNow: false, lastSeedAt: ago(7), completedAt: ago(60) }, now, 6)).toBe(true);
  });
});
