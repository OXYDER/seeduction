import { rankProgress } from './economy';

describe('progression vers le rang suivant', () => {
  const weeksAgo = (w: number) => new Date(Date.now() - w * 7 * 86400_000);
  it('la condition la plus en retard donne le pourcentage', () => {
    const r = rankProgress({ memberClass: 'POWER_USER', createdAt: weeksAgo(6), uploaded: BigInt(250e9), downloaded: BigInt(200e9) }); // vise Élite : 12 sem., 500 Go, ratio 1,5
    expect(r.next).toBe('ELITE');
    expect(r.pct).toBe(50); // 6/12 semaines, 250/500 Go, ratio 1,25/1,5
    expect(r.parts.find((p) => p.key === 'ratio')!.ok).toBe(false);
  });
  it('au rang le plus haut : rien à viser', () => {
    expect(rankProgress({ memberClass: 'VETERAN', createdAt: weeksAgo(60), uploaded: BigInt(5000e9), downloaded: 1n })).toMatchObject({ next: null, pct: 100 });
  });
  it('un nouveau vise Membre', () => {
    expect(rankProgress({ memberClass: 'NOUVEAU', createdAt: weeksAgo(0.5), uploaded: 0n, downloaded: 0n }).next).toBe('MEMBRE');
  });
});
