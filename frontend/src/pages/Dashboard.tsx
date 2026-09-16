import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [top, setTop] = useState<any[]>([]);

  useEffect(() => {
    api.get('/stats/global').then((r) => setStats(r.data));
    api.get('/stats/top-torrents?limit=5').then((r) => setTop(r.data));
  }, []);

  return (
    <div className="grid">
      <h1>Tableau de bord</h1>
      {stats && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <StatCard label="Membres" value={stats.totalUsers} />
          <StatCard label="Torrents" value={stats.totalTorrents} />
          <StatCard label="Seeders actifs" value={stats.totalSeeders} />
          <StatCard label="Leechers actifs" value={stats.totalLeechers} />
        </div>
      )}
      <div className="panel">
        <h3>Torrents les plus seedés</h3>
        <table>
          <thead><tr><th>Nom</th><th>Seeders</th><th>Leechers</th></tr></thead>
          <tbody>
            {top.map((t) => (
              <tr key={t.id}>
                <td><Link to={`/torrents/${t.id}`}>{t.name}</Link></td>
                <td>{t.seeders}</td>
                <td>{t.leechers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel">
      <div className="muted">{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
