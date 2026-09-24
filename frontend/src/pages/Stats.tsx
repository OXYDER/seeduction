import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client';
import { formatBytes, formatNumber } from '../lib/format';
import TorrentLink from '../components/TorrentLink';

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
  const tile = (label: string, value: string) => (
    <div className="panel"><div className="muted">{label}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div></div>
  );
  const short = (d: string) => d.slice(5);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1>📊 Statistiques</h1>

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
    </div>
  );
}
