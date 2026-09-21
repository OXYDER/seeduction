import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

export default function Requests() {
  const [requests, setRequests] = useState<any[]>([]);
  // ?title=... : lien "faire une demande" depuis la page d'un film/une série (suite ou saison manquante).
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ title: searchParams.get('title') ?? '', description: '', bounty: 0 });
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
      <h1>Demandes</h1>
      <div className="split-2">
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
              {requests.length === 0 && <tr><td className="muted">Aucune demande pour l'instant.</td></tr>}
            </tbody>
          </table>
        </div>
        {user && (
          <div className="panel ornate">
            <div className="panel-title"><span className="title-icon">💬</span>Nouvelle demande</div>
            <form onSubmit={submit} className="grid">
              <input placeholder="Titre" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              <textarea placeholder="Description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <input type="number" placeholder="Bounty (points)" value={form.bounty} onChange={(e) => setForm({ ...form, bounty: Number(e.target.value) })} />
              <button type="submit">Publier la demande</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
