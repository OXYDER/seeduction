import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client';
import { formatBytes, formatNumber } from '../lib/format';
import TorrentLink from '../components/TorrentLink';
import UserLink from '../components/UserLink';
import { CLASS_LABEL } from '../lib/memberClass';

const COLORS = ['#e0b84a', '#4caf50', '#7aa0ff', '#c084fc', '#f472b6', '#2dd4bf', '#ef6c4a', '#9fb8a0'];
const tooltipStyle = { background: '#0c1912', border: '1px solid #1f3d2a' };

/** Statistiques de la communauté : activité des 30 derniers jours, répartition, torrents à reseeder. */
export default function Stats() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/stats/overview').then((r) => setData(r.data)).catch(() => setError('Statistiques indisponibles'));
  }, []);

  if (error) return <p className="muted">{error}</p>;
  if (!data) return <p className="muted">Chargement...</p>;

  const g = data.global;
  const x = data.extra;
  const tile = (label: string, value: string) => (
    <div className="panel"><div className="muted">{label}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div></div>
  );
  const short = (d: string) => d.slice(5);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>📊 Statistiques</h1>
        <Link to="/roadmap" className="secondary" style={{ padding: '6px 14px', borderRadius: 8 }}>🗺️ Roadmap et journal des modifications</Link>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        {tile('Membres', formatNumber(g.totalUsers))}
        {tile('Torrents', formatNumber(g.totalTorrents))}
        {tile('Seeders', formatNumber(g.totalSeeders))}
        {tile('Leechers', formatNumber(g.totalLeechers))}
        {tile('Téléchargements complétés', formatNumber(g.totalCompleted))}
        {tile('Volume du catalogue', formatBytes(g.totalSize))}
        {tile('Trafic total', formatBytes(g.totalTraffic))}
        {tile('Torrents sans seeder', formatNumber(data.deadCount))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <div className="panel">
          <h3>Nouveaux torrents (30 jours)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.torrentsPerDay.map((d: any) => ({ ...d, date: short(d.date) }))}>
              <CartesianGrid stroke="#1f3d2a" vertical={false} />
              <XAxis dataKey="date" stroke="#8fa896" fontSize={11} />
              <YAxis stroke="#8fa896" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Torrents" fill="#e0b84a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <h3>Nouveaux membres (30 jours)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.membersPerDay.map((d: any) => ({ ...d, date: short(d.date) }))}>
              <CartesianGrid stroke="#1f3d2a" vertical={false} />
              <XAxis dataKey="date" stroke="#8fa896" fontSize={11} />
              <YAxis stroke="#8fa896" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Membres" fill="#4caf50" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <h3>Volume échangé cumulé (30 jours)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.trafficPerDay.map((d: any) => ({ date: short(d.date), upload: +(d.upload / 1e12).toFixed(3), download: +(d.download / 1e12).toFixed(3) }))}>
              <CartesianGrid stroke="#1f3d2a" vertical={false} />
              <XAxis dataKey="date" stroke="#8fa896" fontSize={11} />
              <YAxis stroke="#8fa896" fontSize={11} unit=" To" />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="upload" name="Upload (To)" stroke="#4caf50" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="download" name="Download (To)" stroke="#e05a5a" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <h3>Répartition par catégorie</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.categories} dataKey="count" nameKey="name" outerRadius={80} label={(e: any) => e.name}>
                {data.categories.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <div className="panel">
          <h3>🏆 Les plus téléchargés</h3>
          <table>
            <tbody>
              {data.topCompleted.map((t: any) => (
                <tr key={t.id}>
                  <td><TorrentLink torrent={t} /></td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{t.completedCount} ✓ · {t.seeders} S</td>
                </tr>
              ))}
              {data.topCompleted.length === 0 && <tr><td className="muted">Rien pour l'instant.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <h3>🔁 À reseeder</h3>
          <p className="muted">Torrents complétés par des membres mais sans aucun seeder actuellement : si tu les as encore, remets-les en seed (et gagne des points bonus).</p>
          <table>
            <tbody>
              {data.dead.map((t: any) => (
                <tr key={t.id}>
                  <td><TorrentLink torrent={t} /></td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{t.completedCount} ✓</td>
                </tr>
              ))}
              {data.dead.length === 0 && <tr><td style={{ color: 'var(--success)' }}>✓ Tous les torrents ont des seeders.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {x && (
        <>
          <h2 style={{ margin: '8px 0 0' }}>Activité de la communauté</h2>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            {tile('Nouveaux membres (7 j)', formatNumber(x.counts.newMembersWeek))}
            {tile('Nouveaux torrents (7 j)', formatNumber(x.counts.uploadsWeek))}
            {tile('Nouveaux torrents (30 j)', formatNumber(x.counts.uploadsMonth))}
            {tile('Pairs actifs (45 min)', formatNumber(x.counts.activePeers))}
            {tile('Commentaires', formatNumber(x.counts.comments))}
            {tile('Messages du chat', formatNumber(x.counts.messages))}
            {tile('Sujets / messages du forum', `${formatNumber(x.counts.forumTopics)} / ${formatNumber(x.counts.forumPosts)}`)}
            {tile('Collections', formatNumber(x.counts.collections))}
            {tile('Favoris', formatNumber(x.counts.favorites))}
            {tile('Amitiés', formatNumber(x.counts.friendships))}
            {tile('Demandes ouvertes / comblées', `${formatNumber(x.counts.requestsOpen)} / ${formatNumber(x.counts.requestsFilled)}`)}
          </div>

          <h2 style={{ margin: '8px 0 0' }}>Économie</h2>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            {tile('Points bonus en circulation', formatNumber(x.economy.bonusInCirculation))}
            {tile('Ratio moyen des membres', x.economy.averageRatio != null ? Number(x.economy.averageRatio).toFixed(2) : '—')}
            {tile('Hit & run non régularisés', formatNumber(x.counts.hnrOpen))}
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
            <div className="panel">
              <h3>Téléchargements complétés (30 jours)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={x.snatchesPerDay.map((d: any) => ({ ...d, date: short(d.date) }))}>
                  <CartesianGrid stroke="#1f3d2a" vertical={false} />
                  <XAxis dataKey="date" stroke="#8fa896" fontSize={11} />
                  <YAxis stroke="#8fa896" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="Complétés" fill="#7aa0ff" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="panel">
              <h3>Commentaires (30 jours)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={x.commentsPerDay.map((d: any) => ({ ...d, date: short(d.date) }))}>
                  <CartesianGrid stroke="#1f3d2a" vertical={false} />
                  <XAxis dataKey="date" stroke="#8fa896" fontSize={11} />
                  <YAxis stroke="#8fa896" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="Commentaires" fill="#c084fc" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {[['Résolutions', x.byResolution], ['Langues', x.byLanguage], ['Rangs des membres', x.memberClasses.map((c: any) => ({ ...c, name: CLASS_LABEL[c.name] ?? c.name }))]].map(([title, list]: any) => (
              <div className="panel" key={title}>
                <h3>{title}</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={list} dataKey="count" nameKey="name" outerRadius={75} label={(e: any) => e.name}>
                      {list.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <div className="panel">
              <h3>⬆️ Plus gros uploaders (torrents)</h3>
              <table><tbody>
                {x.topUploaders.map((u: any) => <tr key={u.user.id}><td><UserLink user={u.user} /></td><td className="muted" style={{ textAlign: 'right' }}>{u.count} torrent{u.count > 1 ? 's' : ''}</td></tr>)}
                {x.topUploaders.length === 0 && <tr><td className="muted">Rien pour l'instant.</td></tr>}
              </tbody></table>
            </div>
            <div className="panel">
              <h3>🌱 Qui seede le plus (en ce moment)</h3>
              <table><tbody>
                {x.topSeeders.map((u: any) => <tr key={u.user.id}><td><UserLink user={u.user} /></td><td className="muted" style={{ textAlign: 'right' }}>{u.count} torrent{u.count > 1 ? 's' : ''}</td></tr>)}
                {x.topSeeders.length === 0 && <tr><td className="muted">Personne ne seede en ce moment.</td></tr>}
              </tbody></table>
            </div>
            <div className="panel">
              <h3>💬 Les plus commentés</h3>
              <table><tbody>
                {x.mostCommented.map((c: any) => <tr key={c.torrent.id}><td><TorrentLink torrent={c.torrent} /></td><td className="muted" style={{ whiteSpace: 'nowrap' }}>{c.count} 💬</td></tr>)}
                {x.mostCommented.length === 0 && <tr><td className="muted">Aucun commentaire.</td></tr>}
              </tbody></table>
            </div>
            <div className="panel">
              <h3>📦 Les plus gros torrents</h3>
              <table><tbody>
                {x.biggest.map((t: any) => <tr key={t.id}><td><TorrentLink torrent={t} /></td><td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatBytes(t.size)}</td></tr>)}
              </tbody></table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
