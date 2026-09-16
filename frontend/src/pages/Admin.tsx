import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function Admin() {
  const [stats, setStats] = useState<any>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annPinned, setAnnPinned] = useState(false);

  function refresh() {
    api.get('/admin/stats').then((r) => setStats(r.data));
    api.get('/admin/torrents/pending').then((r) => setPending(r.data));
    api.get('/admin/reports').then((r) => setReports(r.data));
    api.get('/announcements', { params: { limit: 20 } }).then((r) => setAnnouncements(r.data));
  }

  useEffect(() => { refresh(); }, []);

  async function approve(id: string) { await api.post(`/admin/torrents/${id}/approve`); refresh(); }
  async function reject(id: string) { await api.post(`/admin/torrents/${id}/reject`); refresh(); }
  async function resolveReport(id: string, status: 'RESOLVED' | 'DISMISSED') {
    await api.post(`/admin/reports/${id}/resolve`, { status }); refresh();
  }
  async function publishAnnouncement() {
    if (!annTitle.trim() || !annContent.trim()) return;
    await api.post('/announcements', { title: annTitle, content: annContent, pinned: annPinned });
    setAnnTitle(''); setAnnContent(''); setAnnPinned(false);
    refresh();
  }
  async function deleteAnnouncement(id: string) { await api.delete(`/announcements/${id}`); refresh(); }

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
        <h3>Annonces</h3>
        <div className="grid" style={{ gap: 8 }}>
          <input placeholder="Titre" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} />
          <textarea placeholder="Contenu" value={annContent} onChange={(e) => setAnnContent(e.target.value)} rows={3} />
          <label className="row muted" style={{ gap: 6 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={annPinned} onChange={(e) => setAnnPinned(e.target.checked)} />
            Épingler
          </label>
          <button style={{ alignSelf: 'flex-start' }} onClick={publishAnnouncement}>Publier</button>
        </div>
        <table style={{ marginTop: 16 }}>
          <tbody>
            {announcements.map((a) => (
              <tr key={a.id}>
                <td>{a.pinned ? '🔥 ' : ''}{a.title}</td>
                <td className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="danger" onClick={() => deleteAnnouncement(a.id)}>Supprimer</button>
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
