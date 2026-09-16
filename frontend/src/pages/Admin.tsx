import { useEffect, useState } from 'react';
import { api } from '../api/client';

const TABS = ['Vue d\'ensemble', 'Annonces', 'Catégories torrents', 'Torrents', 'Forum'] as const;
type Tab = typeof TABS[number];

export default function Admin() {
  const [tab, setTab] = useState<Tab>('Vue d\'ensemble');

  return (
    <div className="grid">
      <h1>Administration</h1>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t} className={tab === t ? '' : 'secondary'} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Vue d\'ensemble' && <Overview />}
      {tab === 'Annonces' && <AnnouncementsAdmin />}
      {tab === 'Catégories torrents' && <TorrentCategoriesAdmin />}
      {tab === 'Torrents' && <TorrentsAdmin />}
      {tab === 'Forum' && <ForumAdmin />}
    </div>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return <div className="panel"><div className="muted">{label}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div></div>;
}

function Overview() {
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
            {pending.length === 0 && <tr><td className="muted">Aucun torrent en attente.</td></tr>}
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
            {reports.length === 0 && <tr><td className="muted">Aucun report ouvert.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnnouncementsAdmin() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);

  function refresh() { api.get('/announcements', { params: { limit: 20 } }).then((r) => setAnnouncements(r.data)); }
  useEffect(() => { refresh(); }, []);

  async function publish() {
    if (!title.trim() || !content.trim()) return;
    await api.post('/announcements', { title, content, pinned });
    setTitle(''); setContent(''); setPinned(false);
    refresh();
  }
  async function remove(id: string) { await api.delete(`/announcements/${id}`); refresh(); }

  return (
    <div className="panel">
      <h3>Annonces</h3>
      <div className="grid" style={{ gap: 8 }}>
        <input placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea placeholder="Contenu" value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
        <label className="row muted" style={{ gap: 6 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Épingler
        </label>
        <button style={{ alignSelf: 'flex-start' }} onClick={publish}>Publier</button>
      </div>
      <table style={{ marginTop: 16 }}>
        <tbody>
          {announcements.map((a) => (
            <tr key={a.id}>
              <td>{a.pinned ? '🔥 ' : ''}{a.title}</td>
              <td className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="danger" onClick={() => remove(a.id)}>Supprimer</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TorrentCategoriesAdmin() {
  const [categories, setCategories] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState('');

  function refresh() { api.get('/categories').then((r) => setCategories(r.data)); }
  useEffect(() => { refresh(); }, []);

  async function create() {
    if (!name.trim()) return;
    await api.post('/categories', { name, parentId: parentId || undefined });
    setName(''); setParentId('');
    refresh();
  }
  async function rename(id: string, currentName: string) {
    const newName = prompt('Nouveau nom', currentName);
    if (!newName?.trim()) return;
    await api.patch(`/categories/${id}`, { name: newName });
    refresh();
  }
  async function remove(id: string) {
    setError('');
    try {
      await api.delete(`/categories/${id}`);
      refresh();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Erreur de suppression');
    }
  }

  return (
    <div className="panel">
      <h3>Catégories &amp; sous-catégories de torrents</h3>
      <div className="row" style={{ marginBottom: 16 }}>
        <input placeholder="Nom de la catégorie" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">— Catégorie principale —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>Sous-catégorie de : {c.name}</option>)}
        </select>
        <button onClick={create}>Ajouter</button>
      </div>
      {error && <div className="muted" style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}
      {categories.map((c) => (
        <div key={c.id} style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{c.name} <span className="muted">({c._count?.torrents ?? 0} torrents)</span></strong>
            <div className="row">
              <button className="secondary" onClick={() => rename(c.id, c.name)}>Renommer</button>
              <button className="danger" onClick={() => remove(c.id)}>Supprimer</button>
            </div>
          </div>
          {c.children?.map((sub: any) => (
            <div key={sub.id} className="row" style={{ justifyContent: 'space-between', marginLeft: 24, marginTop: 6 }}>
              <span className="muted">↳ {sub.name} ({sub._count?.torrents ?? 0} torrents)</span>
              <div className="row">
                <button className="secondary" onClick={() => rename(sub.id, sub.name)}>Renommer</button>
                <button className="danger" onClick={() => remove(sub.id)}>Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TorrentsAdmin() {
  const [torrents, setTorrents] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  function refresh() {
    api.get('/admin/torrents', { params: { search } }).then((r) => setTorrents(r.data));
    api.get('/categories').then((r) => {
      const flat = r.data.flatMap((c: any) => [
        { id: c.id, name: c.name },
        ...(c.children ?? []).map((sub: any) => ({ id: sub.id, name: `↳ ${sub.name}` })),
      ]);
      setCategories(flat);
    });
  }
  useEffect(() => { refresh(); }, [search]);

  async function update(id: string, data: any) {
    await api.patch(`/admin/torrents/${id}`, data);
    refresh();
  }
  async function remove(id: string) {
    if (!confirm('Supprimer définitivement ce torrent ?')) return;
    await api.delete(`/admin/torrents/${id}`);
    refresh();
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>Tous les torrents ({torrents.length})</h3>
        <input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />
      </div>
      <table>
        <thead><tr><th>Nom</th><th>Catégorie</th><th>Statut</th><th>FL</th><th>2x</th><th></th></tr></thead>
        <tbody>
          {torrents.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>
                <select value={t.categoryId} onChange={(e) => update(t.id, { categoryId: e.target.value })}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </td>
              <td>
                <select value={t.status} onChange={(e) => update(t.id, { status: e.target.value })}>
                  <option value="PENDING">PENDING</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="REJECTED">REJECTED</option>
                  <option value="DEAD">DEAD</option>
                </select>
              </td>
              <td>
                <input type="checkbox" style={{ width: 'auto' }} checked={t.freeleech} onChange={(e) => update(t.id, { freeleech: e.target.checked })} />
              </td>
              <td>
                <input type="checkbox" style={{ width: 'auto' }} checked={t.doubleUpload} onChange={(e) => update(t.id, { doubleUpload: e.target.checked })} />
              </td>
              <td><button className="danger" onClick={() => remove(t.id)}>Supprimer</button></td>
            </tr>
          ))}
          {torrents.length === 0 && <tr><td className="muted">Aucun résultat.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ForumAdmin() {
  const [categories, setCategories] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState('');

  function refresh() { api.get('/forum/categories').then((r) => setCategories(r.data)); }
  useEffect(() => { refresh(); }, []);

  async function create() {
    if (!name.trim()) return;
    await api.post('/forum/categories', { name, parentId: parentId || undefined });
    setName(''); setParentId('');
    refresh();
  }
  async function rename(id: string, currentName: string) {
    const newName = prompt('Nouveau nom', currentName);
    if (!newName?.trim()) return;
    await api.patch(`/forum/categories/${id}`, { name: newName });
    refresh();
  }
  async function remove(id: string) {
    setError('');
    try {
      await api.delete(`/forum/categories/${id}`);
      refresh();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Erreur de suppression');
    }
  }

  return (
    <div className="panel">
      <h3>Catégories &amp; sous-catégories de forum</h3>
      <div className="row" style={{ marginBottom: 16 }}>
        <input placeholder="Nom de la catégorie" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">— Catégorie principale —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>Sous-catégorie de : {c.name}</option>)}
        </select>
        <button onClick={create}>Ajouter</button>
      </div>
      {error && <div className="muted" style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}
      {categories.map((c) => (
        <div key={c.id} style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{c.name}</strong>
            <div className="row">
              <button className="secondary" onClick={() => rename(c.id, c.name)}>Renommer</button>
              <button className="danger" onClick={() => remove(c.id)}>Supprimer</button>
            </div>
          </div>
          {c.children?.map((sub: any) => (
            <div key={sub.id} className="row" style={{ justifyContent: 'space-between', marginLeft: 24, marginTop: 6 }}>
              <span className="muted">↳ {sub.name}</span>
              <div className="row">
                <button className="secondary" onClick={() => rename(sub.id, sub.name)}>Renommer</button>
                <button className="danger" onClick={() => remove(sub.id)}>Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
