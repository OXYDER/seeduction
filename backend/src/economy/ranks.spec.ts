import { RanksService } from './ranks.service';

const weeksAgo = (weeks: number) => new Date(Date.now() - weeks * 7 * 86400_000);
const gb = (n: number) => BigInt(Math.round(n * 1e9));

describe('RanksService.classFor', () => {
  const ranks = new RanksService(null as any, null as any);

  it('un compte tout neuf est « Nouveau »', () => {
    expect(ranks.classFor({ createdAt: new Date(), uploaded: 0n, downloaded: 0n })).toBe('NOUVEAU');
  });

  it('passe « Membre » après une semaine', () => {
    expect(ranks.classFor({ createdAt: weeksAgo(2), uploaded: 0n, downloaded: 0n })).toBe('MEMBRE');
  });

  it('devient « Power User » avec 4 semaines, 50 Go envoyés et un bon ratio', () => {
    expect(ranks.classFor({ createdAt: weeksAgo(5), uploaded: gb(60), downloaded: gb(30) })).toBe('POWER_USER');
  });

  it('devient « Vétéran » avec 26 semaines, 2 To envoyés et un ratio de 2 ou plus', () => {
    expect(ranks.classFor({ createdAt: weeksAgo(30), uploaded: gb(3000), downloaded: gb(1000) })).toBe('VETERAN');
  });

  it('un mauvais ratio empêche de monter en rang', () => {
    expect(ranks.classFor({ createdAt: weeksAgo(30), uploaded: gb(3000), downloaded: gb(10000) })).toBe('NOUVEAU');
  });
});
