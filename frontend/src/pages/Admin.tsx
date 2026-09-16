import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function Admin() {
  const [stats, setStats] = useState<any>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);

  function refresh() {
    api.get('/admin/stats').then((r) => setStats(r.data));
    api.get('/admin/torrents/pending').then((r) => setPending(r.data));
    api.get('/admin/reports').then((r) => setReports(r.data));
  }

  useEffect(() => { refresh(); }, []);

  async function approve(id: string) { await api.post(`/admin/torrents/${id}/approve`); refresh(); }
  async function reject(id: string) { await api.post(`/admin/torrents/${id}/reject`); refresh(); }
  async function resolveReport(id: string, status: 'RESOLVED' | 'DISMISSED') {
    await api.post(`/admin/reports/${id}/resolve`, { status }); refresh();
  }

  return (
    <div className="grid">
      <h1>Administration</h1>
      {stats && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <Card label="Membres" value={stats.users} />
          <Card label="Torrents" value={stats.torrents} />
          <Card label="Peers actifs" value={stats.activePeers} />
          <Card label="Reports ouverts" value={stats.openReports} />
        </div>
      )}

      <div className="panel">
        <h3>Torrents en attente ({pending.length})</h3>
        <table>
          <tbody>
            {pending.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className="row" style={{ justifyContent: 'flex-end' }}>
                  <button onClick={() => approve(t.id)}>Approuver</button>
                  <button className="danger" onClick={() => reject(t.id)}>Rejeter</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Reports ouverts ({reports.length})</h3>
        <table>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{r.targetType} — {r.reason}</td>
                <td className="row" style={{ justifyContent: 'flex-end' }}>
                  <button onClick={() => resolveReport(r.id, 'RESOLVED')}>Résoudre</button>
                  <button className="secondary" onClick={() => resolveReport(r.id, 'DISMISSED')}>Ignorer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return <div className="panel"><div className="muted">{label}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div></div>;
}
