import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { NewsAdmin, FreeleechAdmin } from '../components/AdminNewsFreeleech';

const BASE_TABS = ['Vue d\'ensemble', 'Nouvelles', 'Freeleech', 'Catégories torrents', 'Torrents', 'Forum', 'Templates'] as const;
type Tab = typeof BASE_TABS[number] | 'Monitoring' | 'Journal';

export default function Admin() {
  const role = useAuthStore((s) => s.user?.role);
  const [tab, setTab] = useState<Tab>('Vue d\'ensemble');
  // Le monitoring expose des détails d'infrastructure : réservé ADMIN/OWNER (les modérateurs voient le reste).
  const TABS: Tab[] = role === 'ADMIN' || role === 'OWNER' ? [...BASE_TABS, 'Journal', 'Monitoring'] : [...BASE_TABS];

  return (
    <div className="grid">
      <h1>Administration</h1>
      <div className="row tabs" style={{ flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Vue d\'ensemble' && <Overview />}
      {tab === 'Nouvelles' && <NewsAdmin />}
      {tab === 'Freeleech' && <FreeleechAdmin />}
      {tab === 'Catégories torrents' && <TorrentCategoriesAdmin />}
      {tab === 'Torrents' && <TorrentsAdmin />}
      {tab === 'Forum' && <ForumAdmin />}
      {tab === 'Templates' && <TemplatesAdmin />}
      {tab === 'Journal' && <AuditAdmin />}
      {tab === 'Monitoring' && <MonitoringAdmin />}
    </div>
  );
}

const AUDIT_LABELS: Record<string, string> = {
  TORRENT_EDIT: '✏️ Torrent modifié', TORRENT_DELETE: '🗑️ Torrent supprimé', TORRENT_APPROVE: '✅ Torrent approuvé', TORRENT_REJECT: '⛔ Torrent rejeté',
  USER_EDIT: '👤 Membre modifié', USER_WARN: '⚠️ Avertissement', USER_BAN: '🚫 Bannissement', USER_UNBAN: '✅ Débannissement',
  FORUM_TOPIC_DELETE: '🗑️ Sujet supprimé', FORUM_TOPIC_LOCK: '🔒 Sujet verrouillé', FORUM_TOPIC_UNLOCK: '🔓 Sujet déverrouillé',
  FORUM_TOPIC_STICKY: '📌 Sujet épinglé', FORUM_TOPIC_UNSTICKY: 'Sujet désépinglé', FORUM_TOPIC_MOVE: '➜ Sujet déplacé',
  FREELEECH_EVENT_CREATE: '🗓️ Événement freeleech programmé', FREELEECH_EVENT_EDIT: '🗓️ Événement freeleech modifié', FREELEECH_EVENT_DELETE: '🗓️ Événement freeleech supprimé',
  FORUM_STRUCTURE_CREATE: '🗂️ Forum créé', FORUM_STRUCTURE_DELETE: '🗂️ Forum supprimé', FREELEECH_GLOBAL: '🎉 Freeleech global',
  LOGIN: '🔑 Connexion', LOGIN_FAILED: '❌ Connexion échouée', PASSWORD_CHANGE: '🔐 Mot de passe changé', PASSWORD_RESET: '🔐 Mot de passe réinitialisé',
  TWO_FACTOR_ENABLED: '🛡️ 2FA activée', TWO_FACTOR_DISABLED: '🛡️ 2FA désactivée', RESET_LINK_ISSUED: '🔗 Lien de réinitialisation émis',
};

/** Journal d'audit : qui a fait quoi, quand (administrateurs). */
function AuditAdmin() {
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api.get('/admin/audit', { params: { page, action: filter || undefined } })
      .then((r) => setData(r.data))
      .catch((err) => setError(err.response?.data?.message ?? 'Impossible de charger le journal'));
  }, [page, filter]);

  if (error) return <p className="muted">{error}</p>;
  if (!data) return <p className="muted">Chargement...</p>;

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const summary = (meta: any) => {
    if (!meta) return '';
    const parts: string[] = [];
    if (meta.name) parts.push(`« ${meta.name} »`);
    if (meta.title) parts.push(`« ${meta.title} »`);
    if (meta.target) parts.push(meta.target);
    if (meta.reason) parts.push(`motif : ${meta.reason}`);
    if (meta.changes) parts.push(Object.entries(meta.changes).map(([k, v]: any) => `${k}: ${v.from} → ${v.to}`).join(', '));
    if (meta.hours !== undefined) parts.push(meta.hours ? `${meta.hours} h` : 'arrêt');
    if (meta.username) parts.push(meta.username);
    return parts.join(' · ');
  };

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h3>Journal d'audit ({data.total})</h3>
        <select value={filter} onChange={(e) => { setPage(1); setFilter(e.target.value); }}>
          <option value="">Toutes les actions</option>
          <option value="~TORRENT">Torrents</option>
          <option value="~USER">Membres</option>
          <option value="~FORUM">Forum</option>
          <option value="LOGIN">Connexions</option>
          <option value="LOGIN_FAILED">Connexions échouées</option>
          <option value="~PASSWORD">Mots de passe</option>
          <option value="~TWO_FACTOR">2FA</option>
        </select>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Date</th><th>Qui</th><th>Action</th><th>Détails</th><th>IP</th></tr></thead>
          <tbody>
            {data.items.map((l: any) => (
              <tr key={l.id}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(l.createdAt).toLocaleString('fr-FR')}</td>
                <td>{l.user ? <a href={`/users/${l.user.id}`}>{l.user.username}</a> : <span className="muted">{l.meta?.username ?? '—'}</span>}</td>
                <td>{AUDIT_LABELS[l.action] ?? l.action}</td>
                <td className="muted" style={{ fontSize: 12 }}>{summary(l.meta)}</td>
                <td className="muted">{l.ip ?? ''}</td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td colSpan={5} className="muted">Aucune entrée.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
        <span className="muted">Page {page} / {pages}</span>
        <div className="row">
          <button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Préc.</button>
          <button className="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Suiv. →</button>
        </div>
      </div>
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
                <td>
                  <div>
                    <span className="badge double">{r.targetType}</span>{' '}
                    {r.link ? <a href={r.link} target="_blank" rel="noreferrer">{r.label}</a> : r.label}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>« {r.reason} » — signalé par {r.reporter?.username ?? '?'}</div>
                </td>
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

// Doit correspondre à l'enum Prisma TemplateKind — c'est ce que choisit le
// générateur de description (et sa recherche automatique) selon la catégorie.
const CONTENT_KINDS = [
  { value: '', label: '— Aucun (pas de recherche automatique) —' },
  { value: 'FILM', label: 'Film' },
  { value: 'SERIE', label: 'Série' },
  { value: 'MUSIQUE', label: 'Musique' },
  { value: 'JEU', label: 'Jeu' },
  { value: 'LOGICIEL', label: 'Logiciel' },
  { value: 'LIVRE', label: 'Livre' },
  { value: 'XXX', label: 'XXX' },
  { value: 'DOCUMENT', label: 'Document' },
  { value: 'ARCHIVE', label: 'Archive' },
  { value: 'PERSONNALISE', label: 'Personnalisé' },
];
const CONTENT_KIND_LABEL = Object.fromEntries(CONTENT_KINDS.map((k) => [k.value, k.label]));

function TorrentCategoriesAdmin() {
  return (
    <CategoryManager
      endpoint="/categories"
      title="Catégories & sous-catégories de torrents"
      renderCount={(c) => ` (${c._count?.torrents ?? 0} torrents)`}
      showContentKind
    />
  );
}

/**
 * CRUD complet (créer, éditer nom + parent, supprimer) pour une hiérarchie
 * à deux niveaux de catégories — partagé entre torrents et forum, qui ont
 * exactement la même forme (findMany top-level + `children` imbriqués).
 * `showContentKind` n'a de sens que pour les catégories de torrents : c'est
 * ce que le générateur de description utilise pour savoir quoi rechercher,
 * sans que l'uploader ait à le choisir lui-même.
 */
function CategoryManager({ endpoint, title, renderCount, showContentKind }: { endpoint: string; title: string; renderCount?: (item: any) => string; showContentKind?: boolean }) {
  const [categories, setCategories] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [contentKind, setContentKind] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editParentId, setEditParentId] = useState('');
  const [editContentKind, setEditContentKind] = useState('');
  const [editError, setEditError] = useState('');
  const [editImage, setEditImage] = useState('');
  const [adult, setAdult] = useState(false);
  const [installMsg, setInstallMsg] = useState('');
  const [editAdult, setEditAdult] = useState(false);

  async function uploadImage(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const { data } = await api.post('/covers/upload', form);
      setEditImage(data.url);
    } catch (err: any) {
      setEditError(err.response?.data?.message ?? "Échec du téléversement de l'image");
    }
  }

  function refresh() { api.get(endpoint, { params: showContentKind ? { includeAdult: 1 } : undefined }).then((r) => setCategories(r.data)); }
  useEffect(() => { refresh(); }, [endpoint]);

  async function create() {
    if (!name.trim()) return;
    await api.post(endpoint, { name, parentId: parentId || undefined, contentKind: contentKind || undefined, ...(showContentKind ? { adult } : {}) });
    setName(''); setParentId(''); setContentKind(''); setAdult(false);
    refresh();
  }

  function startEdit(item: any) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditParentId(item.parentId ?? '');
    setEditContentKind(item.contentKind ?? '');
    setEditImage(item.imageUrl ?? '');
    setEditAdult(!!item.adult);
    setEditError('');
  }

  async function saveEdit(id: string) {
    setEditError('');
    try {
      await api.patch(`${endpoint}/${id}`, { name: editName, parentId: editParentId || null, contentKind: editContentKind || null, ...(showContentKind ? { imageUrl: editImage || null, adult: editAdult } : {}) });
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
            {showContentKind && (
              <select value={editContentKind} onChange={(e) => setEditContentKind(e.target.value)}>
                {CONTENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            )}
            {showContentKind && (
              <label className="row muted" style={{ gap: 6 }} title="Masquée pour les membres qui n'ont pas activé le contenu adulte dans leur compte">
                <input type="checkbox" style={{ width: 'auto' }} checked={editAdult} onChange={(e) => setEditAdult(e.target.checked)} /> 🔞 Contenu adulte
              </label>
            )}
            {showContentKind && (
              <div className="row" style={{ gap: 8 }}>
                {editImage && <img src={editImage} alt="" style={{ height: 28, maxWidth: 90, objectFit: 'contain' }} />}
                <label className="secondary" style={{ cursor: 'pointer', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}>
                  🖼️ {editImage ? "Changer l'image" : 'Ajouter une image'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadImage(e.target.files?.[0])} />
                </label>
                {editImage && <button type="button" className="secondary" onClick={() => setEditImage('')}>Retirer</button>}
              </div>
            )}
            <div className="row">
              <button onClick={() => saveEdit(item.id)}>Enregistrer</button>
              <button className="secondary" onClick={() => setEditingId(null)}>Annuler</button>
            </div>
          </>
        ) : (
          <>
            <span>
              {isSub ? '↳ ' : ''}{showContentKind && item.imageUrl && <img src={item.imageUrl} alt="" style={{ height: 20, maxWidth: 60, objectFit: 'contain', verticalAlign: 'middle', marginRight: 6 }} />}<strong>{item.name}</strong>{showContentKind && item.adult && <span className="badge" style={{ marginLeft: 6, background: 'rgba(224,90,90,0.2)', color: 'var(--danger)' }}>🔞 Adulte</span>}{renderCount && <span className="muted">{renderCount(item)}</span>}
              {showContentKind && (
                <span className="muted">
                  {' '}— {item.contentKind ? CONTENT_KIND_LABEL[item.contentKind] ?? item.contentKind : (isSub ? 'hérite de la catégorie principale' : 'aucun type de contenu')}
                </span>
              )}
            </span>
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
      {showContentKind && (
        <div className="panel" style={{ marginBottom: 16, background: 'rgba(255,255,255,0.03)' }}>
          <strong>📥 Catégories recommandées (FR / QC)</strong>
          <p className="muted" style={{ margin: '4px 0 8px' }}>
            Ajoute d'un coup une arborescence complète pour un tracker francophone : Films (HD, 4K, Remux, québécois, français…), Séries, Animes, Jeunesse,
            Spectacles et humour, Sports (hockey, soccer, UFC…), Musique, Jeux, Applications, Livres, Formations, Autres, et XXX (masqué par défaut).
            Seules les catégories absentes sont créées : rien n'est renommé ni supprimé.
          </p>
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm('Ajouter les catégories recommandées manquantes ?')) return;
              setError('');
              try {
                const { data } = await api.post(`${endpoint}/install-recommended`);
                setInstallMsg(`✓ ${data.created} catégorie(s) créée(s), ${data.skipped} déjà présente(s), ${data.movedTorrents ?? 0} torrent(s) reclassé(s)`);
                refresh();
              } catch (err: any) {
                setError(err.response?.data?.message ?? "Installation impossible");
              }
            }}
          >
            Ajouter les catégories recommandées
          </button>
          {' '}
          <button
            type="button"
            className="secondary"
            title="Fusionne les anciennes sous-catégories de qualité / origine / langue dans leur catégorie principale"
            onClick={async () => {
              if (!window.confirm('Fusionner les sous-catégories « qualité / origine / langue » (Films HD, Films québécois, Musique MP3…) dans leur catégorie principale ? Les torrents sont déplacés et leurs filtres (résolution, origine, langue…) sont remplis.')) return;
              setError('');
              try {
                const { data } = await api.post(`${endpoint}/simplify-legacy`);
                setInstallMsg(`✓ ${data.removed} sous-catégorie(s) fusionnée(s), ${data.moved} torrent(s) déplacé(s)`);
                refresh();
              } catch (err: any) {
                setError(err.response?.data?.message ?? 'Opération impossible');
              }
            }}
          >
            🧹 Simplifier : qualité et origine en filtres
          </button>
          {installMsg && <span style={{ color: 'var(--success)', marginLeft: 12 }}>{installMsg}</span>}
        </div>
      )}
      <div className="row" style={{ marginBottom: 16 }}>
        <input placeholder="Nom de la catégorie" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">— Catégorie principale —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>Sous-catégorie de : {c.name}</option>)}
        </select>
        {showContentKind && (
          <label className="row muted" style={{ gap: 6 }} title="Masquée par défaut : chaque membre doit activer le contenu adulte dans son compte">
            <input type="checkbox" style={{ width: 'auto' }} checked={adult} onChange={(e) => setAdult(e.target.checked)} /> 🔞 Contenu adulte
          </label>
        )}
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
    api.get('/categories', { params: { includeAdult: 1 } }).then((r) => {
      const flat = r.data.flatMap((c: any) => (c.children?.length
        ? c.children.map((sub: any) => ({ id: sub.id, name: `${c.name} › ${sub.name}` }))
        : [{ id: c.id, name: c.name }]));
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

/**
 * Forums façon phpBB : une « catégorie » regroupe des forums ; un « forum »
 * contient les sujets et peut lui-même avoir des sous-forums (trois niveaux max).
 */
function ForumAdmin() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [isCategory, setIsCategory] = useState(false);
  const [parentId, setParentId] = useState('');
  const [icon, setIcon] = useState('');
  const [description, setDescription] = useState('');
  const [staffOnly, setStaffOnly] = useState(false);
  const [locked, setLocked] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<any>({});

  function refresh() { api.get('/forum/categories').then((r) => setItems(r.data)); }
  useEffect(() => { refresh(); }, []);

  const fail = (err: any) => setError(err.response?.data?.message ?? 'Erreur');

  // Parents possibles pour un forum : une catégorie, ou un forum qui n'est pas déjà un sous-forum.
  const parentOptions: { id: string; label: string }[] = [];
  for (const c of items) {
    if (c.isCategory) parentOptions.push({ id: c.id, label: `Dans la catégorie : ${c.name}` });
    else parentOptions.push({ id: c.id, label: `Sous-forum de : ${c.name}` });
    for (const f of c.children ?? []) {
      if (c.isCategory && !f.isCategory) parentOptions.push({ id: f.id, label: `Sous-forum de : ${c.name} › ${f.name}` });
    }
  }

  async function create() {
    if (!name.trim()) return;
    setError('');
    try {
      await api.post('/forum/categories', {
        name, isCategory, parentId: isCategory ? undefined : parentId || undefined,
        icon: icon || undefined, description: description || undefined, staffOnly, locked,
      });
      setName(''); setIcon(''); setDescription(''); setParentId(''); setStaffOnly(false); setLocked(false);
      refresh();
    } catch (err) { fail(err); }
  }

  async function saveEdit(item: any) {
    setError('');
    try {
      await api.patch(`/forum/categories/${item.id}`, {
        name: edit.name, icon: edit.icon, description: edit.description, staffOnly: edit.staffOnly, locked: edit.locked,
        ...(item.isCategory ? {} : { parentId: edit.parentId || null }),
      });
      setEditingId(null);
      refresh();
    } catch (err) { fail(err); }
  }

  async function move(id: string, direction: 'up' | 'down') {
    setError('');
    try { await api.post(`/forum/categories/${id}/move`, { direction }); refresh(); } catch (err) { fail(err); }
  }

  async function remove(id: string) {
    setError('');
    try { await api.delete(`/forum/categories/${id}`); refresh(); } catch (err) { fail(err); }
  }

  function row(item: any, depth: number) {
    const editing = editingId === item.id;
    return (
      <div key={item.id} style={{ marginLeft: depth * 24, marginTop: depth ? 6 : 0 }}>
        {editing ? (
          <div className="grid" style={{ gap: 8, padding: 10, border: '1px solid var(--border-gold)', borderRadius: 6 }}>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} style={{ width: 220 }} placeholder="Nom" />
              {!item.isCategory && <input value={edit.icon} onChange={(e) => setEdit({ ...edit, icon: e.target.value })} style={{ width: 70 }} placeholder="Icône" maxLength={4} />}
              {!item.isCategory && (
                <select value={edit.parentId} onChange={(e) => setEdit({ ...edit, parentId: e.target.value })}>
                  <option value="">— Forum de premier niveau —</option>
                  {parentOptions.filter((o) => o.id !== item.id).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              )}
            </div>
            <textarea rows={2} placeholder="Description (affichée sous le nom du forum)" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <label className="row muted" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={edit.staffOnly} onChange={(e) => setEdit({ ...edit, staffOnly: e.target.checked })} /> Réservé au staff</label>
              {!item.isCategory && <label className="row muted" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={edit.locked} onChange={(e) => setEdit({ ...edit, locked: e.target.checked })} /> Verrouillé (pas de nouveaux sujets)</label>}
              <button onClick={() => saveEdit(item)}>Enregistrer</button>
              <button className="secondary" onClick={() => setEditingId(null)}>Annuler</button>
            </div>
          </div>
        ) : (
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span>
              {depth ? '↳ ' : ''}{item.isCategory ? '🗂️' : item.icon || '💬'} <strong>{item.name}</strong>{' '}
              <span className="muted">
                {item.isCategory ? `(catégorie — ${item.children?.length ?? 0} forum(s))` : `(forum — ${item.topics?.length ?? 0} sujet(s))`}
                {item.staffOnly && ' · 🛡️ staff'}{item.locked && ' · 🔒'}
              </span>
            </span>
            <div className="row" style={{ gap: 6 }}>
              <button className="secondary" title="Monter" onClick={() => move(item.id, 'up')}>▲</button>
              <button className="secondary" title="Descendre" onClick={() => move(item.id, 'down')}>▼</button>
              <button
                className="secondary"
                onClick={() => {
                  setEditingId(item.id);
                  setEdit({ name: item.name, icon: item.icon ?? '', description: item.description ?? '', staffOnly: !!item.staffOnly, locked: !!item.locked, parentId: item.parentId ?? '' });
                  setError('');
                }}
              >
                Éditer
              </button>
              <button className="danger" onClick={() => remove(item.id)}>Supprimer</button>
            </div>
          </div>
        )}
        {item.children?.map((child: any) => row(child, depth + 1))}
      </div>
    );
  }

  return (
    <div className="panel">
      <h3>Forums</h3>
      <p className="muted">
        Une <strong>catégorie</strong> est un en-tête qui regroupe des forums (pas de sujets). Un <strong>forum</strong> contient les sujets ;
        il peut être rangé dans une catégorie, rester seul, ou être un <strong>sous-forum</strong> d'un autre forum.
        Utilise ▲ ▼ pour l'ordre d'affichage.
      </p>
      <div className="grid" style={{ gap: 8, marginBottom: 16 }}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <select value={isCategory ? 'category' : 'forum'} onChange={(e) => setIsCategory(e.target.value === 'category')}>
            <option value="forum">💬 Forum</option>
            <option value="category">🗂️ Catégorie</option>
          </select>
          <input placeholder={isCategory ? 'Nom de la catégorie' : 'Nom du forum'} value={name} onChange={(e) => setName(e.target.value)} />
          {!isCategory && <input placeholder="Icône" value={icon} onChange={(e) => setIcon(e.target.value)} style={{ width: 70 }} maxLength={4} />}
          {!isCategory && (
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— Forum de premier niveau —</option>
              {parentOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          )}
        </div>
        <textarea rows={2} placeholder="Description (facultatif)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <label className="row muted" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={staffOnly} onChange={(e) => setStaffOnly(e.target.checked)} /> Réservé au staff</label>
          {!isCategory && <label className="row muted" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={locked} onChange={(e) => setLocked(e.target.checked)} /> Verrouillé</label>}
          <button onClick={create}>Ajouter</button>
        </div>
      </div>
      {error && <div className="muted" style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}
      <div className="grid" style={{ gap: 12 }}>{items.map((c) => row(c, 0))}</div>
    </div>
  );
}

const TEMPLATE_KINDS = ['FILM', 'SERIE', 'MUSIQUE', 'JEU', 'LOGICIEL', 'LIVRE', 'XXX', 'DOCUMENT', 'ARCHIVE', 'PERSONNALISE'];

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
