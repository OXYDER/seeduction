import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { formatBytes, formatNumber } from '../../lib/format';
import { Bars, Board, ChartCard, Section, Tile, gridStyle, torrentRows } from './StatsBits';

const days = (n: number) => (n >= 365 ? `${(n / 365).toFixed(1).replace('.', ',')} an(s)` : `${formatNumber(n)} j`);

/** Classements des torrents : moins téléchargés, plus petits, plus difficiles à obtenir, plus appréciés, plus anciens... */
export default function StatsTorrents({ topCompleted, mostCommented, deadCount }: { topCompleted: any[]; mostCommented: any[]; deadCount: number }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/stats/torrents').then((r) => setData(r.data)).catch(() => setError('Classements indisponibles')); }, []);
  if (error) return <p className="muted">{error}</p>;
  if (!data) return <p className="muted">Calcul des classements…</p>;
  const b = data.boards;
  const h = data.health;
  const dl = (v: number) => `${formatNumber(v)} ✓`;

  return (
    <div className="grid" style={{ gap: 18 }}>
      <Section title="Santé du réseau">
        <div className="grid" style={gridStyle(170)}>
          <Tile label="Torrents vivants" value={formatNumber(h.alive)} />
          <Tile label="Torrents sans seeder" value={`${formatNumber(deadCount)}`} hint={<Link to="/dead">Redonner vie →</Link>} tone={deadCount ? 'warn' : 'good'} />
          <Tile label="Bien seedés (3 seeders ou plus)" value={`${h.healthyPct} %`} tone={h.healthyPct >= 70 ? 'good' : h.healthyPct < 40 ? 'bad' : 'warn'} />
          <Tile label="Seeders par torrent (moyenne)" value={String(h.avgSeeders).replace('.', ',')} />
          <Tile label="Seeders pour 1 leecher" value={h.seedLeechRatio === null ? '—' : String(h.seedLeechRatio).replace('.', ',')} tone={h.seedLeechRatio !== null && h.seedLeechRatio < 1 ? 'bad' : undefined} />
          <Tile label="Torrents jamais téléchargés" value={formatNumber(data.neverDownloaded)} hint="Plus de 7 jours en ligne, 0 téléchargement" />
          <Tile label="Âge moyen du catalogue" value={days(h.avgAgeDays)} />
        </div>
      </Section>

      <Section title="Les plus populaires">
        <div className="grid" style={gridStyle(340)}>
          <Board icon="⬇️" title="Plus téléchargés" rows={torrentRows(topCompleted.map((t) => ({ torrent: t, value: t.completedCount })), dl)} />
          <Board icon="🔥" title="Plus demandés en ce moment" hint="Le plus de leechers connectés." rows={torrentRows(b.mostLeeched, (v) => `${v} leecher${v > 1 ? 's' : ''}`)} />
          <Board icon="🌱" title="Mieux seedés" rows={torrentRows(b.mostSeeded, (v) => `${v} seeder${v > 1 ? 's' : ''}`)} />
          <Board icon="⭐" title="Mieux notés" hint="Au moins 3 notes." rows={torrentRows(b.bestRated, (v, x) => `${String(v).replace('.', ',')} / 5`, (x) => <>({x.extra.votes} notes)</>)} empty="Pas encore assez de notes." />
          <Board icon="👍" title="Plus remerciés" rows={torrentRows(b.mostThanked, (v) => `${v} merci${v > 1 ? 's' : ''}`)} />
          <Board icon="💖" title="Plus en favoris" rows={torrentRows(b.mostFavorited, (v) => `${v} ⭐`)} />
          <Board icon="💬" title="Plus commentés" rows={torrentRows(mostCommented.map((c) => ({ torrent: c.torrent, value: c.count })), (v) => `${v} 💬`)} />
        </div>
      </Section>

      <Section title="Les moins populaires" hint="Des torrents à mettre en avant ou à relancer.">
        <div className="grid" style={gridStyle(340)}>
          <Board medals={false} icon="🕸️" title="Moins téléchargés" hint="Au moins 7 jours en ligne." rows={torrentRows(b.leastDownloaded, dl, (x) => <>(en ligne depuis {days(x.extra.days)})</>)} />
          <Board medals={false} icon="🧍" title="Un seul seeder" hint="Vivants, mais fragiles : s'il s'arrête, ils meurent. Les plus téléchargés d'abord." rows={torrentRows(b.fragile, dl)} empty="Aucun torrent n'a un seul seeder." />
          <Board medals={false} icon="🐢" title="Les plus difficiles à obtenir" hint="Le plus de leechers pour un seul seeder. Le site ne mesure pas les vitesses : c'est le meilleur indicateur d'une attente longue." rows={torrentRows(b.hardest, (v) => `${String(v).replace('.', ',')} leechers / seeder`, (x) => <>({x.extra.leechers} ⬇ · {x.extra.seeders} ⬆)</>)} empty="Aucun torrent n'a de leecher en attente." />
        </div>
      </Section>

      <Section title="Taille et ancienneté">
        <div className="grid" style={gridStyle(340)}>
          <Board icon="🪶" title="Plus petits" rows={torrentRows(b.smallest, formatBytes)} />
          <Board icon="📦" title="Plus gros" rows={torrentRows(b.biggest, formatBytes)} />
          <Board icon="🏺" title="Plus anciens encore vivants" rows={torrentRows(b.oldestAlive, days)} />
          <Board medals={false} icon="☠️" title="Morts depuis le plus longtemps" hint="À ressusciter en priorité." rows={torrentRows(b.longestDead, (v) => `depuis ${days(v)}`)} empty="Aucun torrent mort. 🎉" />
        </div>
      </Section>

      <Section title="Répartitions">
        <div className="grid" style={gridStyle(380)}>
          <ChartCard title="Torrents par taille"><Bars data={data.sizeBuckets} label="Torrents" colors /></ChartCard>
          <ChartCard title="Torrents par nombre de seeders"><Bars data={data.seederBuckets} label="Torrents" colors /></ChartCard>
        </div>
        <div className="panel" style={{ overflowX: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>Par catégorie</h3>
          <table>
            <thead><tr><th>Catégorie</th><th>Torrents</th><th>Volume</th><th>Taille moyenne</th><th>Téléchargements</th><th>Seeders</th><th>Leechers</th></tr></thead>
            <tbody>
              {data.categories.map((c: any) => (
                <tr key={c.slug}>
                  <td>{c.name}</td>
                  <td>{formatNumber(c.torrents)}</td><td>{formatBytes(c.size)}</td><td>{formatBytes(c.avg)}</td>
                  <td>{formatNumber(c.completed)}</td><td>{formatNumber(c.seeders)}</td><td>{formatNumber(c.leechers)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <p className="muted">Classements mis à jour toutes les 5 minutes.</p>
    </div>
  );
}
