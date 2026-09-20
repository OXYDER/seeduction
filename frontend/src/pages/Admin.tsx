import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

const BASE_TABS = ['Vue d\'ensemble', 'Annonces', 'Catégories torrents', 'Torrents', 'Forum', 'Templates'] as const;
type Tab = typeof BASE_TABS[number] | 'Monitoring';

export default function Admin() {
  const role = useAuthStore((s) => s.user?.role);
  const [tab, setTab] = useState<Tab>('Vue d\'ensemble');
  // Le monitoring expose des détails d'infrastructure : réservé ADMIN/OWNER (les modérateurs voient le reste).
  const TABS: Tab[] = role === 'ADMIN' || role === 'OWNER' ? [...BASE_TABS, 'Monitoring'] : [...BASE_TABS];

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
      {tab === 'Templates' && <TemplatesAdmin />}
      {tab === 'Monitoring' && <MonitoringAdmin />}
    </div>
  );
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d > 0 ? `${d} j` : null, h > 0 || d > 0 ? `${h} h` : null, `${m} min`].filter(Boolean).join(' ');
}

function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: 'ok' | 'bad' }) {
  const color = tone === 'ok' ? 'var(--success)' : tone === 'bad' ? 'var(--danger)' : undefined;
  return (
    <div className="panel">
      <div className="muted">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function MonitoringAdmin() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    function load() {
      api.get('/admin/monitoring')
        .then((r) => { if (!cancelled) { setData(r.data); setError(''); } })
        .catch((e) => { if (!cancelled) setError(e.response?.data?.message ?? 'Impossible de récupérer les métriques'); });
    }
    load();
    const interval = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (error) return <p className="muted">{error}</p>;
  if (!data) return <p className="muted">Chargement...</p>;

  const { process: proc, database, counts, series } = data;
  const lastHour = series.reduce(
    (acc: any, p: any) => ({ requests: acc.requests + p.requests, errors: acc.errors + p.errors, announces: acc.announces + p.announces }),
    { requests: 0, errors: 0, announces: 0 },
  );

  return (
    <div className="grid">
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatTile label="Base de données" value={database.ok ? `OK (${database.latencyMs} ms)` : 'INJOIGNABLE'} tone={database.ok ? 'ok' : 'bad'} />
        <StatTile label="Uptime backend" value={formatUptime(proc.uptimeSeconds)} />
        <StatTile label="Mémoire (RSS)" value={`${proc.rssMB} Mo`} />
        <StatTile label="Heap utilisé" value={`${proc.heapUsedMB} / ${proc.heapTotalMB} Mo`} />
        <StatTile label="Node" value={proc.nodeVersion} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatTile label="Membres" value={counts.users} />
        <StatTile label="Torrents approuvés" value={counts.approvedTorrents} />
        <StatTile label="En attente de modération" value={counts.pendingTorrents} />
        <StatTile label="Seeders / Leechers" value={`${counts.seeders} / ${counts.leechers}`} />
        <StatTile label="Reports ouverts" value={counts.openReports} tone={counts.openReports > 0 ? 'bad' : undefined} />
        <StatTile label="Messages chat (24 h)" value={counts.chatMessages24h} />
      </div>

      <div className="panel">
        <h3>Trafic — dernière heure</h3>
        <p className="muted" style={{ fontSize: 12 }}>
          {lastHour.requests} requêtes · {lastHour.announces} announces BitTorrent ·{' '}
          <span style={{ color: lastHour.errors > 0 ? 'var(--danger)' : undefined }}>{lastHour.errors} erreurs 5xx</span>
          {' '}— compteurs en mémoire, remis à zéro à chaque redémarrage du backend. Rafraîchi toutes les 10 s.
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={series}>
            <XAxis dataKey="time" stroke="#8fa896" fontSize={11} interval={9} />
            <YAxis stroke="#8fa896" fontSize={11} allowDecimals={false} />
            <Tooltip contentStyle={{ background: '#0c1912', border: '1px solid #1f3d2a' }} />
            <Legend />
            <Bar dataKey="requests" name="Requêtes" fill="#e0b84a" />
            <Bar dataKey="announces" name="Announces" fill="#4caf50" />
            <Bar dataKey="errors" name="Erreurs 5xx" fill="#e05a5a" />
          </BarChart>
        </ResponsiveContainer>
      </div>
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
  return (
    <CategoryManager
      endpoint="/categories"
      title="Catégories & sous-catégories de torrents"
      renderCount={(c) => ` (${c._count?.torrents ?? 0} torrents)`}
    />
  );
}

/**
 * CRUD complet (créer, éditer nom + parent, supprimer) pour une hiérarchie
 * à deux niveaux de catégories — partagé entre torrents et forum, qui ont
 * exactement la même forme (findMany top-level + `children` imbriqués).
 */
function CategoryManager({ endpoint, title, renderCount }: { endpoint: string; title: string; renderCount?: (item: any) => string }) {
  const [categories, setCategories] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editParentId, setEditParentId] = useState('');
  const [editError, setEditError] = useState('');

  function refresh() { api.get(endpoint).then((r) => setCategories(r.data)); }
  useEffect(() => { refresh(); }, [endpoint]);

  async function create() {
    if (!name.trim()) return;
    await api.post(endpoint, { name, parentId: parentId || undefined });
    setName(''); setParentId('');
    refresh();
  }

  function startEdit(item: any) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditParentId(item.parentId ?? '');
    setEditError('');
  }

  async function saveEdit(id: string) {
    setEditError('');
    try {
      await api.patch(`${endpoint}/${id}`, { name: editName, parentId: editParentId || null });
      setEditingId(null);
      refresh();
    } catch (err: any) {
      setEditError(err.response?.data?.message ?? 'Erreur de mise à jour');
    }
  }

  async function remove(id: string) {
    setError('');
    try {
      await api.delete(`${endpoint}/${id}`);
      refresh();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Erreur de suppression');
    }
  }

  function renderRow(item: any, isSub: boolean) {
    const isEditing = editingId === item.id;
    return (
      <div key={item.id} className="row" style={{ justifyContent: 'space-between', marginLeft: isSub ? 24 : 0, marginTop: isSub ? 6 : 0, flexWrap: 'wrap' }}>
        {isEditing ? (
          <>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: 180 }} />
            <select value={editParentId} onChange={(e) => setEditParentId(e.target.value)}>
              <option value="">— Catégorie principale —</option>
              {categories.filter((c) => c.id !== item.id).map((c) => (
                <option key={c.id} value={c.id}>Sous-catégorie de : {c.name}</option>
              ))}
            </select>
            <div className="row">
              <button onClick={() => saveEdit(item.id)}>Enregistrer</button>
              <button className="secondary" onClick={() => setEditingId(null)}>Annuler</button>
            </div>
          </>
        ) : (
          <>
            <span>{isSub ? '↳ ' : ''}<strong>{item.name}</strong>{renderCount && <span className="muted">{renderCount(item)}</span>}</span>
            <div className="row">
              <button className="secondary" onClick={() => startEdit(item)}>Éditer</button>
              <button className="danger" onClick={() => remove(item.id)}>Supprimer</button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="panel">
      <h3>{title}</h3>
      <div className="row" style={{ marginBottom: 16 }}>
        <input placeholder="Nom de la catégorie" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">— Catégorie principale —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>Sous-catégorie de : {c.name}</option>)}
        </select>
        <button onClick={create}>Ajouter</button>
      </div>
      {error && <div className="muted" style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}
      {editError && <div className="muted" style={{ color: 'var(--danger)', marginBottom: 8 }}>{editError}</div>}
      {categories.map((c) => (
        <div key={c.id} style={{ marginBottom: 12 }}>
          {renderRow(c, false)}
          {c.children?.map((sub: any) => renderRow(sub, true))}
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
  return (
    <CategoryManager
      endpoint="/forum/categories"
      title="Catégories & sous-catégories de forum"
      renderCount={(c) => ` (${c.topics?.length ?? 0} sujets)`}
    />
  );
}

const TEMPLATE_KINDS = ['FILM', 'SERIE', 'MUSIQUE', 'JEU', 'LOGICIEL', 'LIVRE', 'DOCUMENT', 'ARCHIVE', 'PERSONNALISE'];

function TemplatesAdmin() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('FILM');
  const [content, setContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  function refresh() { api.get('/templates').then((r) => setTemplates(r.data.filter((t: any) => t.isGlobal))); }
  useEffect(() => { refresh(); }, []);

  async function create() {
    if (!name.trim() || !content.trim()) return;
    await api.post('/templates', { name, kind, content, global: true });
    setName(''); setContent('');
    refresh();
  }
  async function saveEdit(id: string) {
    await api.patch(`/templates/${id}`, { content: editContent });
    setEditingId(null);
    refresh();
  }
  async function remove(id: string) {
    if (!confirm('Supprimer ce template ?')) return;
    await api.delete(`/templates/${id}`);
    refresh();
  }

  return (
    <div className="grid">
      <div className="panel">
        <h3>Nouveau template global</h3>
        <div className="grid" style={{ gap: 8 }}>
          <div className="row">
            <input placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {TEMPLATE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <textarea placeholder="Contenu BBCode avec {variables}" rows={6} value={content} onChange={(e) => setContent(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />
          <button style={{ alignSelf: 'flex-start' }} onClick={create}>Créer</button>
        </div>
      </div>

      {templates.map((t) => (
        <div key={t.id} className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{t.name} <span className="muted">({t.kind})</span></strong>
            <div className="row">
              {editingId === t.id ? (
                <>
                  <button onClick={() => saveEdit(t.id)}>Enregistrer</button>
                  <button className="secondary" onClick={() => setEditingId(null)}>Annuler</button>
                </>
              ) : (
                <>
                  <button className="secondary" onClick={() => { setEditingId(t.id); setEditContent(t.content); }}>Éditer</button>
                  <button className="danger" onClick={() => remove(t.id)}>Supprimer</button>
                </>
              )}
            </div>
          </div>
          {editingId === t.id ? (
            <textarea rows={6} value={editContent} onChange={(e) => setEditContent(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 8, width: '100%' }} />
          ) : (
            <pre className="muted" style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 12 }}>{t.content}</pre>
          )}
        </div>
      ))}
    </div>
  );
}
