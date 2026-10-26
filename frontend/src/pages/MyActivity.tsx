import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import Loading from '../components/Loading';
import ShareCard from '../components/ShareCard';
import { DEFAULT_FILTERS, SIZE_RANGES, applyFilters, categoryOptions, dateOf, matchesStatus, sortRows, toCsv, type Filters, type MyTorrent, type SortKey, type StatusFilter } from '../lib/myTorrents';

interface Data { totals: { uploadedBytes: number; downloadedBytes: number }; rules: { hnrSeedHours: number }; items: MyTorrent[] }

type View = 'cards' | 'list';
type ColKey = 'category' | 'size' | 'added' | 'completed' | 'received' | 'sent' | 'ratio' | 'seedTime' | 'obligation' | 'announce' | 'progress' | 'state';
interface Prefs { filters: Filters; view: View; pageSize: number; cols: ColKey[] }

const hours = (secs: number) => (secs >= 3600 ? `${Math.round(secs / 360) / 10} h`.replace('.', ',') : `${Math.max(0, Math.round(secs / 60))} min`);
const dateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const dayOnly = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const STATUSES: [StatusFilter, string][] = [['all', 'Tout'], ['seeding', '🌱 En seed'], ['leeching', '⬇️ En téléchargement'], ['completed', '✅ Terminés'], ['todo', '⏳ Obligation à terminer'], ['hnr', '🔴 Hit & run'], ['own', '⬆️ Mes envois']];
const SORTS: [SortKey, string][] = [['date', 'Date (fin du téléchargement, sinon ajout)'], ['added', "Date d'ajout sur le site"], ['name', 'Nom'], ['category', 'Catégorie'], ['size', 'Taille'], ['received', 'Reçu'], ['sent', 'Envoyé'], ['ratio', 'Ratio'], ['seedTime', 'Temps de seed'], ['progress', 'Progression'], ['announce', 'Dernière annonce']];
const COLS: [ColKey, string, SortKey | null][] = [
  ['category', 'Catégorie', 'category'], ['size', 'Taille', 'size'], ['added', 'Ajouté sur le site', 'added'], ['completed', 'Date', 'date'], ['received', 'Reçu ↓', 'received'], ['sent', 'Envoyé ↑', 'sent'],
  ['ratio', 'Ratio', 'ratio'], ['seedTime', 'Seed cumulé', 'seedTime'], ['obligation', 'Obligation de seed', null], ['announce', 'Dernière annonce', 'announce'], ['progress', 'Progression', 'progress'], ['state', 'État', null],
];
const DEFAULT_PREFS: Prefs = { filters: DEFAULT_FILTERS, view: 'cards', pageSize: 50, cols: ['category', 'size', 'completed', 'received', 'sent', 'ratio', 'obligation'] };
const PREF_KEY = 'myTorrentsPrefs';

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null');
    if (p && p.filters) return { ...DEFAULT_PREFS, ...p, filters: { ...DEFAULT_FILTERS, ...p.filters, q: '' } };
  } catch { /* stockage indisponible */ }
  return DEFAULT_PREFS;
}

/** L'état d'un torrent en pastilles (même style que « Mes seeds »). */
function Chips({ r, hnrHours }: { r: MyTorrent; hnrHours: number }) {
  return (
    <>
      {r.seedingNow && <span className="seedpage-chip seeding">🟢 En seed</span>}
      {r.leechingNow && <span className="seedpage-chip dl">⬇️ En téléchargement · {Math.round(r.progress * 100)} %</span>}
      {r.own && <span className="seedpage-chip none">⬆️ Ton envoi{r.status === 'PENDING' ? ' (en attente)' : r.status === 'REJECTED' ? ' (rejeté)' : ''}</span>}
      {!r.own && r.completed && (r.satisfied
        ? <span className="seedpage-chip done">✅ Obligation atteinte{r.hnrResolved ? ' (hit & run régularisé)' : ''}</span>
        : r.hnr ? <span className="seedpage-chip hnr">🔴 Hit & run à régler</span>
        : <span className="seedpage-chip idle">⏳ Encore {hours(Math.max(0, hnrHours * 3600 - r.seedSeconds))} de seed</span>)}
    </>
  );
}

/** Mes torrents : tout ce que le membre seede, télécharge, a terminé ou a envoyé, dans une liste qu'il filtre, trie et affiche comme il veut. */
export default function MyActivity() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [page, setPage] = useState(1);
  const [colsOpen, setColsOpen] = useState(false);
  const f = prefs.filters;

  useEffect(() => {
    const load = () => api.get('/bonus/my-torrents').then((r) => setData(r.data)).catch(() => setError('Impossible de charger tes torrents'));
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 2 * 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...prefs, filters: { ...prefs.filters, q: '' } })); } catch { /* ignoré */ } }, [prefs]);

  const setFilters = (patch: Partial<Filters>) => { setPrefs((p) => ({ ...p, filters: { ...p.filters, ...patch } })); setPage(1); };
  const rows = data?.items ?? [];

  const shown = useMemo(() => sortRows(applyFilters(rows, f), f.sort, f.dir), [rows, f]);
  const cats = useMemo(() => categoryOptions(rows), [rows]);
  const resolutions = useMemo(() => [...new Set(rows.map((r) => r.resolution).filter((x): x is string => !!x))].sort(), [rows]);
  // Les compteurs des pastilles tiennent compte des autres filtres (recherche, catégorie, dates...).
  const base = useMemo(() => applyFilters(rows, f, true), [rows, f]);

  if (!data) return <Loading error={error} />;
  const hnrHours = data.rules.hnrSeedHours;
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(shown.length / prefs.pageSize));
  const cur = Math.min(page, pages);
  const slice = shown.slice((cur - 1) * prefs.pageSize, cur * prefs.pageSize);
  const ratio = data.totals.downloadedBytes > 0 ? (data.totals.uploadedBytes / data.totals.downloadedBytes).toFixed(2) : '∞';
  const sum = (pick: (r: MyTorrent) => number | null) => shown.reduce((n, r) => n + (pick(r) ?? 0), 0);
  const filtered = f.q || f.category || f.resolution || f.size || f.from || f.to || f.status !== 'all';
  const count = (s: StatusFilter) => base.filter((r) => matchesStatus(r, s)).length;
  const tile = (label: string, value: string, sub?: string) => (
    <div className="panel act-tile"><div className="muted">{label}</div><div className="act-tile-value">{value}</div>{sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}</div>
  );

  const sortBy = (k: SortKey) => setFilters({ sort: k, dir: f.sort === k ? (f.dir === 'asc' ? 'desc' : 'asc') : k === 'name' || k === 'category' ? 'asc' : 'desc' });
  const toggleCol = (c: ColKey) => setPrefs((p) => ({ ...p, cols: p.cols.includes(c) ? p.cols.filter((x) => x !== c) : [...p.cols, c] }));
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([toCsv(shown)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `mes-torrents-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const cell = (c: ColKey, r: MyTorrent) => {
    switch (c) {
      case 'category': return <span className="muted">{r.category ? [r.category.parent?.name, r.category.name].filter(Boolean).join(' › ') : '—'}</span>;
      case 'size': return <span className="muted">{formatBytes(r.size)}</span>;
      case 'added': return <span className="muted" title={dateTime(r.addedAt)}>{dayOnly(r.addedAt)}</span>;
      case 'completed': return <span className="muted" title={timeAgo(new Date(dateOf(r)).toISOString())}>{dateTime(new Date(dateOf(r)).toISOString())}</span>;
      case 'received': return r.receivedBytes === null ? <span className="muted">—</span> : <span style={{ color: 'var(--danger)' }}>{formatBytes(r.receivedBytes)}</span>;
      case 'sent': return r.sentBytes === null ? <span className="muted">—</span> : <span style={{ color: 'var(--success)' }}>{formatBytes(r.sentBytes)}</span>;
      case 'ratio': return r.ratio === null ? <span className="muted">—</span> : r.ratio.toFixed(2);
      case 'seedTime': return r.completed && !r.own ? `${hours(r.seedSeconds)} / ${hours(r.requiredSeconds)}` : <span className="muted">—</span>;
      case 'obligation': return r.own ? <span className="muted">Ton envoi</span> : !r.completed ? <span className="muted">—</span>
        : r.satisfied ? <span className="seedpage-chip done">✅ Atteinte</span> : r.hnr ? <span className="seedpage-chip hnr">🔴 Hit & run</span> : <span className="seedpage-chip idle">⏳ {hours(Math.max(0, r.requiredSeconds - r.seedSeconds))}</span>;
      case 'announce': return <span className="muted">{r.lastAnnounceAt ? timeAgo(r.lastAnnounceAt) : '—'}</span>;
      case 'progress': return r.leechingNow ? <span className="seedob-bar" style={{ minWidth: 90 }}><span className="dl" style={{ width: `${Math.round(r.progress * 100)}%` }} /></span> : <span className="muted">{r.completed || r.own ? '100 %' : '—'}</span>;
      case 'state': return <span className="seedpage-chips"><Chips r={r} hnrHours={hnrHours} /></span>;
    }
  };

  const card = (r: MyTorrent) => {
    const added = r.startedAt ? dateTime(r.startedAt) : r.firstDay ? dayOnly(r.firstDay) : null;
    const bar = r.leechingNow ? { pct: r.progress * 100, kind: 'dl' as const }
      : r.own || !r.completed ? undefined
      : { pct: r.satisfied ? 100 : Math.min(100, (r.seedSeconds / Math.max(1, r.requiredSeconds)) * 100), kind: (r.satisfied ? 'done' : r.hnr ? 'hnr' : 'seeding') as 'done' | 'hnr' | 'seeding' };
    return (
      <ShareCard key={r.torrentId} id={r.torrentId} name={r.name} cover={r.coverImage} bar={bar}
        sub={<>
          {r.category && <>{[r.category.parent?.name, r.category.name].filter(Boolean).join(' › ')} · </>}
          {formatBytes(r.size)}
          {r.completedAt ? <> · {added ? <>ajouté {added} · </> : null}terminé {dateTime(r.completedAt)}</> : <> · {r.own ? 'envoyé' : 'ajouté'} {dateTime(r.startedAt ?? r.addedAt)}</>}
          {r.receivedBytes !== null && <> · reçu ↓ {formatBytes(r.receivedBytes)}</>}{r.sentBytes !== null && <> · envoyé ↑ {formatBytes(r.sentBytes)}</>}
          {r.ratio !== null && <> · ratio {r.ratio.toFixed(2)}</>}
          {r.completed && !r.own && <> · seed cumulé {hours(r.seedSeconds)} / {hours(r.requiredSeconds)}</>}
          {r.own && <> · {r.seeders} seeder{r.seeders > 1 ? 's' : ''} · {r.leechers} leecher{r.leechers > 1 ? 's' : ''} · {r.completedCount} complété{r.completedCount > 1 ? 's' : ''}</>}
          {r.lastAnnounceAt && <> · dernière annonce {timeAgo(r.lastAnnounceAt)}</>}
        </>}
        chips={<Chips r={r} hnrHours={hnrHours} />} />
    );
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>📈 Mes torrents</h1>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link to="/seeds" className="secondary" style={{ padding: '6px 12px', borderRadius: 8 }}>🌱 Mes seeds et obligations</Link>
          <Link to="/hit-and-run" className="secondary" style={{ padding: '6px 12px', borderRadius: 8 }}>⚠️ Hit & run</Link>
        </div>
      </div>

      <div className="act-tiles">
        {tile('En seed', String(rows.filter((r) => r.seedingNow).length), formatBytes(rows.filter((r) => r.seedingNow).reduce((n, r) => n + r.size, 0)))}
        {tile('En téléchargement', String(rows.filter((r) => r.leechingNow).length))}
        {tile('Terminés', String(rows.filter((r) => r.completed).length))}
        {tile('Mes envois', String(rows.filter((r) => r.own).length))}
        {tile('Upload total', formatBytes(data.totals.uploadedBytes))}
        {tile('Téléchargé total', formatBytes(data.totals.downloadedBytes), `Ratio ${ratio}`)}
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {STATUSES.map(([k, label]) => <button key={k} type="button" className={`secondary${f.status === k ? ' on' : ''}`} onClick={() => setFilters({ status: k })}>{label} ({count(k)})</button>)}
      </div>

      <div className="panel" style={{ display: 'grid', gap: 10 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={f.q} onChange={(e) => setFilters({ q: e.target.value })} placeholder="🔎 Chercher dans mes torrents (nom, catégorie)" style={{ flex: '1 1 240px' }} />
          <select value={f.category} onChange={(e) => setFilters({ category: e.target.value })} style={{ width: 'auto' }} title="Type de contenu et catégorie">
            <option value="">Toutes les catégories</option>
            {cats.map((g) => (
              <optgroup key={g.id} label={g.name}>
                <option value={g.id}>{g.name} (tout) — {g.count}</option>
                {g.children.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.count}</option>)}
              </optgroup>
            ))}
          </select>
          {resolutions.length > 0 && (
            <select value={f.resolution} onChange={(e) => setFilters({ resolution: e.target.value })} style={{ width: 'auto' }} title="Qualité">
              <option value="">Toutes les qualités</option>
              {resolutions.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          )}
          <select value={f.size} onChange={(e) => setFilters({ size: e.target.value as Filters['size'] })} style={{ width: 'auto' }} title="Taille">
            <option value="">Toutes les tailles</option>
            {Object.entries(SIZE_RANGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="row" style={{ gap: 6, fontSize: 13 }}>Du <input type="date" value={f.from} onChange={(e) => setFilters({ from: e.target.value })} style={{ width: 'auto' }} /></label>
          <label className="row" style={{ gap: 6, fontSize: 13 }}>au <input type="date" value={f.to} onChange={(e) => setFilters({ to: e.target.value })} style={{ width: 'auto' }} /></label>
          {([['7 j', 7], ['30 j', 30], ['90 j', 90], ['1 an', 365]] as [string, number][]).map(([label, d]) => (
            <button key={label} type="button" className="secondary" style={{ padding: '3px 10px' }}
              onClick={() => setFilters({ from: new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10), to: '' })}>{label}</button>
          ))}
          <span style={{ flex: 1 }} />
          <label className="row" style={{ gap: 6, fontSize: 13 }}>Trier par
            <select value={f.sort} onChange={(e) => setFilters({ sort: e.target.value as SortKey })} style={{ width: 'auto' }}>
              {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          <button type="button" className="secondary" style={{ padding: '3px 10px' }} onClick={() => setFilters({ dir: f.dir === 'asc' ? 'desc' : 'asc' })} title="Inverser l'ordre">{f.dir === 'asc' ? '↑ Croissant' : '↓ Décroissant'}</button>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="row" style={{ gap: 4 }}>
            <button type="button" className={`secondary${prefs.view === 'cards' ? ' on' : ''}`} style={{ padding: '3px 10px' }} onClick={() => setPrefs((p) => ({ ...p, view: 'cards' }))}>🗂️ Cartes</button>
            <button type="button" className={`secondary${prefs.view === 'list' ? ' on' : ''}`} style={{ padding: '3px 10px' }} onClick={() => setPrefs((p) => ({ ...p, view: 'list' }))}>☰ Liste</button>
          </div>
          {prefs.view === 'list' && (
            <div style={{ position: 'relative' }}>
              <button type="button" className="secondary" style={{ padding: '3px 10px' }} onClick={() => setColsOpen((v) => !v)}>⚙️ Colonnes</button>
              {colsOpen && (
                <div className="panel" style={{ position: 'absolute', zIndex: 20, top: '110%', left: 0, minWidth: 220, display: 'grid', gap: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                  {COLS.map(([k, label]) => <label key={k} className="row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" style={{ width: 'auto' }} checked={prefs.cols.includes(k)} onChange={() => toggleCol(k)} /> {label}</label>)}
                  <button type="button" className="secondary" style={{ padding: '3px 10px' }} onClick={() => setPrefs((p) => ({ ...p, cols: DEFAULT_PREFS.cols }))}>Colonnes par défaut</button>
                </div>
              )}
            </div>
          )}
          <label className="row" style={{ gap: 6, fontSize: 13 }}>Par page
            <select value={prefs.pageSize} onChange={(e) => { setPrefs((p) => ({ ...p, pageSize: Number(e.target.value) })); setPage(1); }} style={{ width: 'auto' }}>
              {[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span style={{ flex: 1 }} />
          {filtered && <button type="button" className="secondary" style={{ padding: '3px 10px' }} onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: f.sort, dir: f.dir })}>✕ Effacer les filtres</button>}
          <button type="button" className="secondary" style={{ padding: '3px 10px' }} onClick={exportCsv} disabled={shown.length === 0} title="Télécharger la liste affichée (ouvre dans Excel)">⬇️ Exporter en CSV</button>
        </div>
      </div>

      <div className="muted" style={{ fontSize: 13 }}>
        {shown.length} torrent{shown.length > 1 ? 's' : ''}{filtered ? ` sur ${total}` : ''} · taille totale {formatBytes(sum((r) => r.size))} · reçu ↓ {formatBytes(sum((r) => r.receivedBytes))} · envoyé ↑ {formatBytes(sum((r) => r.sentBytes))}
      </div>

      {shown.length === 0 ? (
        <div className="panel"><p className="muted" style={{ margin: 0 }}>
          {total === 0 ? <>Rien pour l'instant : laisse ton client BitTorrent ouvert, ou <Link to="/upload">envoie un torrent →</Link></> : 'Aucun torrent ne correspond à ces filtres.'}
        </p></div>
      ) : prefs.view === 'cards' ? (
        <div className="seedpage-list">{slice.map(card)}</div>
      ) : (
        <div className="panel" style={{ overflowX: 'auto' }}>
          <table className="act-table">
            <thead>
              <tr>
                <th><button type="button" onClick={() => sortBy('name')} style={{ all: 'unset', cursor: 'pointer' }}>Torrent{f.sort === 'name' ? (f.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>
                {COLS.filter(([k]) => prefs.cols.includes(k)).map(([k, label, sk]) => (
                  <th key={k}>{sk ? <button type="button" onClick={() => sortBy(sk)} style={{ all: 'unset', cursor: 'pointer' }}>{label}{f.sort === sk ? (f.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button> : label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((r) => (
                <tr key={r.torrentId}>
                  <td className="act-name"><Link to={`/torrents/${r.torrentId}`} className="row" style={{ gap: 10 }}>{r.coverImage ? <img src={r.coverImage} alt="" className="act-thumb" loading="lazy" /> : <span className="act-thumb plain">🎬</span>}<span>{r.name}</span></Link></td>
                  {COLS.filter(([k]) => prefs.cols.includes(k)).map(([k]) => <td key={k}>{cell(k, r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="row" style={{ gap: 8, justifyContent: 'center', alignItems: 'center' }}>
          <button type="button" className="secondary" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>← Préc.</button>
          <span className="muted">Page {cur} / {pages}</span>
          <button type="button" className="secondary" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>Suiv. →</button>
        </div>
      )}
    </div>
  );
}
