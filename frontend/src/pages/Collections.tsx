import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Recommended from '../components/Recommended';

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
  covers: string[];
  _count: { items: number; collaborators: number };
}

/** Carte d'une collection : mosaïque de pochettes, titre, visibilité, description et compteurs. */
function CollectionCard({ c }: { c: CollectionSummary }) {
  return (
    <Link to={`/collections/${c.id}`} className="collection-card">
      <div className="collection-mosaic" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (c.covers[i]
          ? <img key={i} src={c.covers[i]} alt="" loading="lazy" />
          : <span key={i} className="collection-mosaic-empty">{i === 0 && c.covers.length === 0 ? '📚' : ''}</span>))}
      </div>
      <div className="collection-card-body">
        <div className="collection-card-title">
          <strong>{c.name}</strong>
          <span className="badge new">{VISIBILITY_LABEL[c.visibility]}</span>
        </div>
        {c.description && <p className="muted collection-card-desc">{c.description}</p>}
        <div className="muted" style={{ fontSize: 12 }}>
          Par {c.owner.username} · {c._count.items} torrent{c._count.items > 1 ? 's' : ''}
          {c.visibility === 'COLLABORATIVE' && c._count.collaborators > 0 && ` · ${c._count.collaborators} collaborateur(s)`}
        </div>
      </div>
    </Link>
  );
}

export default function Collections() {
  const [mine, setMine] = useState<CollectionSummary[] | null>(null);
  const [publicCols, setPublicCols] = useState<CollectionSummary[] | null>(null);
  const [form, setForm] = useState({ name: '', description: '', visibility: 'PRIVATE' });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function refresh() {
    api.get('/collections/mine').then((r) => setMine(r.data)).catch(() => setMine([]));
    api.get('/collections/public').then((r) => setPublicCols(r.data)).catch(() => setPublicCols([]));
  }
  useEffect(() => { refresh(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true); setError('');
    try {
      await api.post('/collections', form);
      setForm({ name: '', description: '', visibility: 'PRIVATE' });
      setShowForm(false);
      refresh();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Création impossible');
    } finally { setBusy(false); }
  }

  const others = (publicCols ?? []).filter((c) => !(mine ?? []).some((m) => m.id === c.id));

  return (
    <div className="grid" style={{ gap: 26 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>📚 Collections</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Des listes de torrents que tu crées et partages : une saga, une sélection, la soirée ciné de samedi...
          </p>
        </div>
        <button type="button" onClick={() => setShowForm((v) => !v)}>{showForm ? '✕ Fermer' : '➕ Nouvelle collection'}</button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="panel ornate collection-form">
          <div className="panel-title"><span className="title-icon">📚</span>Nouvelle collection</div>
          <div className="collection-form-grid">
            <input placeholder="Nom de la collection" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} autoFocus />
            <select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
              <option value="PRIVATE">🔒 Privée — visible par toi seul</option>
              <option value="PUBLIC">🌐 Publique — visible par tous, éditable par toi seul</option>
              <option value="COLLABORATIVE">🤝 Collaborative — visible par tous, éditable par tes invités</option>
            </select>
            <textarea className="collection-form-desc" placeholder="Description (optionnelle)" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}
          <div className="row">
            <button type="submit" disabled={busy}>Créer la collection</button>
            <button type="button" className="secondary" onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </form>
      )}

      <section>
        <h2 className="collection-section-title">Mes collections {mine && <span className="collection-count">{mine.length}</span>}</h2>
        {mine === null && <p className="muted">Chargement...</p>}
        {mine?.length === 0 && (
          <div className="panel collection-empty">
            <span style={{ fontSize: 34 }}>📚</span>
            <div>
              <strong>Tu n'as pas encore de collection.</strong>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                Crée-en une, puis ajoute-y des torrents depuis leur page avec « 📚 Collection ».
              </p>
            </div>
            <button type="button" onClick={() => setShowForm(true)}>➕ Créer ma première collection</button>
          </div>
        )}
        {mine && mine.length > 0 && <div className="collection-grid">{mine.map((c) => <CollectionCard key={c.id} c={c} />)}</div>}
      </section>

      <section>
        <h2 className="collection-section-title">Collections publiques {publicCols && <span className="collection-count">{others.length}</span>}</h2>
        {publicCols === null && <p className="muted">Chargement...</p>}
        {publicCols && others.length === 0 && <p className="muted">Aucune collection publique pour l'instant.</p>}
        {others.length > 0 && <div className="collection-grid">{others.map((c) => <CollectionCard key={c.id} c={c} />)}</div>}
      </section>

      <Recommended title="✨ À ajouter à tes collections" subtitle="Selon ton historique" />
    </div>
  );
}
