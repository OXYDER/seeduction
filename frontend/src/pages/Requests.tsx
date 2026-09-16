import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

export default function Requests() {
  const [requests, setRequests] = useState<any[]>([]);
  const [form, setForm] = useState({ title: '', description: '', bounty: 0 });
  const user = useAuthStore((s) => s.user);

  function refresh() {
    api.get('/requests').then((r) => setRequests(r.data));
  }
  useEffect(() => { refresh(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/requests', form);
    setForm({ title: '', description: '', bounty: 0 });
    refresh();
  }

  return (
    <div className="grid">
      <h1>Requests</h1>
      <div className="panel">
        <table>
          <thead><tr><th>Titre</th><th>Demandé par</th><th>Bounty</th></tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.title}<div className="muted">{r.description}</div></td>
                <td className="muted">{r.requestedBy?.username}</td>
                <td>{r.bounty} pts</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {user && (
        <div className="panel" style={{ maxWidth: 420 }}>
          <h3>Nouvelle demande</h3>
          <form onSubmit={submit} className="grid">
            <input placeholder="Titre" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <textarea placeholder="Description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <input type="number" placeholder="Bounty (points)" value={form.bounty} onChange={(e) => setForm({ ...form, bounty: Number(e.target.value) })} />
            <button type="submit">Publier la demande</button>
          </form>
        </div>
      )}
    </div>
  );
}
