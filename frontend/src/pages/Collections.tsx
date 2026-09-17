import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

const VISIBILITY_LABEL: Record<string, string> = {
  PRIVATE: '🔒 Privée',
  PUBLIC: '🌐 Publique',
  COLLABORATIVE: '🤝 Collaborative',
};

interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  owner: { username: string };
  _count: { items: number; collaborators: number };
}

export default function Collections() {
  const [mine, setMine] = useState<CollectionSummary[]>([]);
  const [publicCols, setPublicCols] = useState<CollectionSummary[]>([]);
  const [form, setForm] = useState({ name: '', description: '', visibility: 'PRIVATE' });

  function refresh() {
    api.get('/collections/mine').then((r) => setMine(r.data)).catch(() => {});
    api.get('/collections/public').then((r) => setPublicCols(r.data)).catch(() => {});
  }
  useEffect(() => { refresh(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.post('/collections', form);
    setForm({ name: '', description: '', visibility: 'PRIVATE' });
    refresh();
  }

  function renderCard(c: CollectionSummary) {
    return (
      <Link key={c.id} to={`/collections/${c.id}`} className="panel" style={{ display: 'block' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>{c.name}</strong>
          <span className="badge new">{VISIBILITY_LABEL[c.visibility]}</span>
        </div>
        {c.description && <p className="muted" style={{ margin: '6px 0' }}>{c.description}</p>}
        <div className="muted" style={{ fontSize: 12 }}>
          Par {c.owner.username} · {c._count.items} torrent{c._count.items > 1 ? 's' : ''}
          {c.visibility === 'COLLABORATIVE' && c._count.collaborators > 0 && ` · ${c._count.collaborators} collaborateur(s)`}
        </div>
      </Link>
    );
  }

  return (
    <div className="grid">
      <h1>Collections</h1>
      <div className="split-2">
        <div className="grid" style={{ gap: 16 }}>
          <div>
            <h3>Mes collections</h3>
            <div className="grid" style={{ gap: 10 }}>
              {mine.length === 0 && <p className="muted">Tu n'as pas encore de collection.</p>}
              {mine.map(renderCard)}
            </div>
          </div>
          <div>
            <h3>Collections publiques</h3>
            <div className="grid" style={{ gap: 10 }}>
              {publicCols.length === 0 && <p className="muted">Aucune collection publique pour l'instant.</p>}
              {publicCols.filter((c) => !mine.some((m) => m.id === c.id)).map(renderCard)}
            </div>
          </div>
        </div>
        <div className="panel ornate">
          <div className="panel-title"><span className="title-icon">📚</span>Nouvelle collection</div>
          <form onSubmit={submit} className="grid">
            <input placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <textarea placeholder="Description (optionnelle)" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
              <option value="PRIVATE">🔒 Privée — visible par toi seul</option>
              <option value="PUBLIC">🌐 Publique — visible par tous, éditable par toi seul</option>
              <option value="COLLABORATIVE">🤝 Collaborative — visible par tous, éditable par tes invités</option>
            </select>
            <button type="submit">Créer la collection</button>
          </form>
        </div>
      </div>
    </div>
  );
}
