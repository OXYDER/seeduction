import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

interface Entry {
  user: { id: string; username: string; role: string };
  badgeCount: number;
}

interface BadgeDef {
  code: string;
  name: string;
  description: string;
  icon: string;
}

export default function HallOfFame() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [catalog, setCatalog] = useState<BadgeDef[]>([]);

  useEffect(() => {
    api.get('/badges/hall-of-fame').then((r) => setEntries(r.data)).catch(() => {});
    api.get('/badges/catalog').then((r) => setCatalog(r.data)).catch(() => {});
  }, []);

  return (
    <div className="grid">
      <h1>Hall of Fame</h1>
      <div className="split-2">
        <div className="panel">
          <h3>Membres les plus décorés</h3>
          <table>
            <thead><tr><th>#</th><th>Membre</th><th>Badges</th></tr></thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.user.id}>
                  <td>{i + 1}</td>
                  <td><Link to={`/users/${e.user.id}`}>{e.user.username}</Link></td>
                  <td>{e.badgeCount}</td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td className="muted">Aucun badge décerné pour l'instant.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <h3>Catalogue des badges</h3>
          <div className="grid" style={{ gap: 10 }}>
            {catalog.map((b) => (
              <div key={b.code} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 20 }}>{b.icon}</span>
                <div>
                  <div style={{ fontWeight: 700 }}>{b.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{b.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
