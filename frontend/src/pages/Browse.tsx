import { useEffect, useMemo, useRef, useState } from 'react';
import UserLink from '../components/UserLink';
import CategoryTag from '../components/CategoryTag';
import SearchBox from '../components/SearchBox';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes as formatSize } from '../lib/format';
import { CATEGORY_STYLE } from '../components/Layout';
import { timeAgo } from '../lib/time';
import { useAuthStore } from '../store/auth';
import { useTheme } from '../lib/theme';
import { useFavorites } from '../lib/favorites';
import { FavoriteStar, HealthDot } from '../components/TorrentBits';
import { parseNaturalQuery, ORIGINS, RESOLUTIONS, LANGUAGES, SOURCES, CODECS, AUDIO_FORMATS, CONTAINERS } from '../lib/searchParser';
import WatchOnlineButton from '../components/WatchOnlineButton';
import { resolveContentKind } from '../lib/categoryKind';

const VIDEO_KINDS = new Set(['FILM', 'SERIE', 'XXX', 'DOCUMENT']);

async function downloadTorrent(id: string, name: string) {
  const res = await api.get(`/torrents/${id}/download`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.torrent`;
  a.click();
  window.URL.revokeObjectURL(url);
}

const SORTS = [
  { value: 'date', label: 'Date' },
  { value: 'nom', label: 'Nom' },
  { value: 'taille', label: 'Taille' },
  { value: 'seeders', label: 'Seeders' },
  { value: 'leechers', label: 'Leechers' },
  { value: 'popularite', label: 'Popularité' },
  { value: 'activite', label: 'Activité' },
];

// Colonnes triables : titre affiché -> champ de tri côté serveur.
const COLUMNS: { label: string; sort: string }[] = [
  { label: 'Catégorie', sort: 'categorie' },
  { label: 'Nom', sort: 'nom' },
  { label: 'Ajouté', sort: 'date' },
  { label: 'Taille', sort: 'taille' },
  { label: 'S', sort: 'seeders' },
  { label: 'L', sort: 'leechers' },
  { label: 'Uploader', sort: 'uploader' },
];

// Sens par défaut au premier clic (comme côté serveur) : texte A→Z, chiffres du plus grand au plus petit.
const DEFAULT_DIR: Record<string, 'asc' | 'desc'> = {
  date: 'desc', nom: 'asc', taille: 'desc', seeders: 'desc', leechers: 'desc', popularite: 'desc', activite: 'desc', categorie: 'asc', uploader: 'asc',
};

interface Tip { t: any; x: number; y: number }

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const rawSearch = params.get('search') ?? '';
  const categoryId = params.get('categoryId') ?? '';
  const uploaderId = params.get('uploaderId') ?? '';
  const page = parseInt(params.get('page') ?? '1', 10);
  const sort = params.get('sort') ?? 'date';
  const order: 'asc' | 'desc' = params.get('order') === 'asc' ? 'asc' : params.get('order') === 'desc' ? 'desc' : (DEFAULT_DIR[sort] ?? 'desc');

  // Recherche en langage naturel : "Dune 2024 4K HDR VOSTFR" devient
  // automatiquement { name: "Dune", year: 2024, resolution: "4K/2160p",
  // hdr: true, language: "VOSTFR" }. Un filtre déjà réglé explicitement
  // dans le panneau (paramètre d'URL présent) garde toujours la priorité.
  const parsed = useMemo(() => parseNaturalQuery(rawSearch), [rawSearch]);
  const year = params.get('year') ?? (parsed.year ? String(parsed.year) : '');
  const resolution = params.get('resolution') ?? parsed.resolution ?? '';
  const language = params.get('language') ?? parsed.language ?? '';
  const source = params.get('source') ?? parsed.source ?? '';
  const codec = params.get('codec') ?? parsed.codec ?? '';
  const audio = params.get('audio') ?? parsed.audio ?? '';
  const containerFormat = params.get('containerFormat') ?? parsed.containerFormat ?? '';
  const origin = params.get('origin') ?? '';
  const genre = params.get('genre') ?? '';
  const hdr = params.get('hdr') === 'true' || (!!parsed.hdr && params.get('hdr') !== 'false');
  const minSizeGo = params.get('minSize') ?? '';
  const maxSizeGo = params.get('maxSize') ?? '';
  const minSeeders = params.get('minSeeders') ?? '';
  const state = params.get('state') === 'dead' ? 'dead' : params.get('state') === 'noseeders' ? 'noseeders' : '';

  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<any[]>([]);
  const favorites = useFavorites();
  const theme = useTheme();
  const authUser = useAuthStore((s) => s.user);
  const currentUserId = authUser?.id;
  const isStaff = ['MODERATOR', 'ADMIN', 'OWNER'].includes(authUser?.role ?? '');
  const [view, setViewState] = useState<'list' | 'grid'>(() => {
    // Thème Prestige : la grille d'affiches est la vue par défaut (façon plateforme de streaming), sauf choix contraire mémorisé.
    try {
      const saved = localStorage.getItem('browseView');
      if (saved === 'grid' || saved === 'list') return saved;
    } catch { /* stockage indisponible */ }
    return document.documentElement.getAttribute('data-theme') === 'prestige' ? 'grid' : 'list';
  });
  function setView(v: 'list' | 'grid') {
    setViewState(v);
    try { localStorage.setItem('browseView', v); } catch { /* stockage indisponible : le choix vaut pour cette visite */ }
  }
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const tipTimer = useRef<number | undefined>(undefined);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/torrents', {
      params: {
        search: parsed.name, categoryId, uploaderId, page, pageSize: 25, sort, order,
        year: year || undefined, resolution: resolution || undefined, language: language || undefined,
        source: source || undefined, codec: codec || undefined, audio: audio || undefined,
        containerFormat: containerFormat || undefined, origin: origin || undefined, genre: genre || undefined, hdr: hdr || undefined,
        minSize: minSizeGo ? Number(minSizeGo) * 1e9 : undefined,
        maxSize: maxSizeGo ? Number(maxSizeGo) * 1e9 : undefined,
        minSeeders: minSeeders || undefined,
        state: state || undefined,
      },
    }).then((r) => {
      setItems(r.data.items);
      setTotal(r.data.total);
    });
  }, [parsed.name, categoryId, uploaderId, page, sort, order, year, resolution, language, source, codec, audio, containerFormat, origin, genre, hdr, minSizeGo, maxSizeGo, minSeeders, state]);

  // Valeurs de filtres réellement disponibles pour la liste affichée (avec nombre de torrents).
  const [facets, setFacets] = useState<Record<string, { value: string; count: number }[]>>({});
  useEffect(() => {
    api.get('/torrents/facets', {
      params: {
        search: parsed.name, categoryId, uploaderId,
        year: year || undefined, resolution: resolution || undefined, language: language || undefined,
        source: source || undefined, codec: codec || undefined, audio: audio || undefined,
        containerFormat: containerFormat || undefined, origin: origin || undefined, genre: genre || undefined, hdr: hdr || undefined,
        minSize: minSizeGo ? Number(minSizeGo) * 1e9 : undefined,
        maxSize: maxSizeGo ? Number(maxSizeGo) * 1e9 : undefined,
        minSeeders: minSeeders || undefined,
        state: state || undefined,
      },
    }).then((r) => setFacets(r.data)).catch(() => {});
  }, [parsed.name, categoryId, uploaderId, year, resolution, language, source, codec, audio, containerFormat, origin, genre, hdr, minSizeGo, maxSizeGo, minSeeders, state]);


  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data));
  }, []);

  useEffect(() => {
    if (!showSort) return;
    const close = (e: MouseEvent) => {
      if (!sortMenuRef.current?.contains(e.target as Node)) setShowSort(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showSort]);

  // Retrouve la catégorie active (parente ou sous-catégorie) pour afficher
  // ses sous-catégories comme filtres supplémentaires.
  const activeParent = categories.find((c) => c.id === categoryId)
    ?? categories.find((c) => c.children?.some((sub: any) => sub.id === categoryId));

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('page');
    setParams(next);
  }

  function goToPage(p: number) {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    setParams(next);
  }

  function resetFilters() {
    const next = new URLSearchParams();
    if (rawSearch) next.set('search', rawSearch);
    if (categoryId) next.set('categoryId', categoryId);
    if (params.get('sort')) next.set('sort', params.get('sort')!);
    if (params.get('order')) next.set('order', params.get('order')!);
    setParams(next);
  }

  function setSort(field: string, dir?: 'asc' | 'desc') {
    const next = new URLSearchParams(params);
    next.set('sort', field);
    next.set('order', dir ?? DEFAULT_DIR[field] ?? 'desc');
    next.delete('page');
    setParams(next);
  }

  // Cliquer sur un titre de colonne : tri par cette colonne, puis inverse le sens à chaque clic.
  function clickColumn(field: string) {
    setSort(field, sort === field ? (order === 'asc' ? 'desc' : 'asc') : undefined);
  }

  function showTip(t: any, e: React.MouseEvent) {
    window.clearTimeout(tipTimer.current);
    const { clientX, clientY } = e;
    tipTimer.current = window.setTimeout(() => setTip({ t, x: clientX, y: clientY }), 250);
  }
  function moveTip(e: React.MouseEvent) {
    const { clientX, clientY } = e;
    setTip((prev) => (prev ? { ...prev, x: clientX, y: clientY } : prev));
  }
  function hideTip() {
    window.clearTimeout(tipTimer.current);
    setTip(null);
  }

  const activeFilters = ([
    year && { key: 'year', label: `Année ${year}` },
    resolution && { key: 'resolution', label: resolution },
    language && { key: 'language', label: language },
    source && { key: 'source', label: source },
    codec && { key: 'codec', label: codec },
    audio && { key: 'audio', label: audio },
    containerFormat && { key: 'containerFormat', label: containerFormat },
    origin && { key: 'origin', label: `Origine : ${origin}` },
    hdr && { key: 'hdr', label: 'HDR' },
    minSizeGo && { key: 'minSize', label: `≥ ${minSizeGo} Go` },
    maxSizeGo && { key: 'maxSize', label: `≤ ${maxSizeGo} Go` },
    minSeeders && { key: 'minSeeders', label: `≥ ${minSeeders} seeders` },
    state && { key: 'state', label: state === 'dead' ? '☠️ Torrents morts' : '🔁 Sans seeder' },
  ] as (false | '' | { key: string; label: string })[]).filter(Boolean) as { key: string; label: string }[];
  const hasAdvancedFilters = activeFilters.length > 0;
  const currentSortLabel = SORTS.find((s) => s.value === sort)?.label ?? 'Date';

  // Infobulle : reste dans l'écran près des bords.
  const tipStyle = tip
    ? {
        left: Math.max(8, Math.min(tip.x + 18, window.innerWidth - 384)),
        top: Math.max(8, Math.min(tip.y + 18, window.innerHeight - 200)),
      }
    : undefined;

  const field = (label: string, control: React.ReactNode) => (
    <div>
      <div className="muted" style={{ marginBottom: 4 }}>{label}</div>
      {control}
    </div>
  );
  const full = { width: '100%' };

  return (
    <div className="grid">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h1>{uploaderId ? (uploaderId === currentUserId ? 'Mes uploads' : 'Torrents de ce membre') : 'Parcourir'}</h1>
        <div className="list-toolbar">
          <div style={{ width: 320, maxWidth: '100%' }}>
            <SearchBox
              placeholder="Rechercher... (ex: Dune 2024 4K HDR VOSTFR)"
              value={rawSearch}
              onChange={(v) => updateParam('search', v)}
              scopes={['torrents', 'categories']}
              inputStyle={{ width: '100%' }}
            />
          </div>
          <div className="view-toggle">
            <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} title="Vue liste">☰</button>
            <button type="button" className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')} title="Vue affiches">▦</button>
          </div>
          <button
            type="button"
            className={`icon-btn${state === 'dead' ? ' active' : ''}`}
            onClick={() => updateParam('state', state === 'dead' ? '' : 'dead')}
            title="Torrents retirés des listes après une longue période sans seeder"
          >
            <span>☠️</span> Morts
          </button>
          <button type="button" className={`icon-btn${showFilters ? ' active' : ''}`} onClick={() => setShowFilters((v) => !v)} title="Filtres">
            <span>🔎</span> Filtres {hasAdvancedFilters && <span className="count">{activeFilters.length}</span>}
          </button>
          <div style={{ position: 'relative' }} ref={sortMenuRef}>
            <button type="button" className={`icon-btn${showSort ? ' active' : ''}`} onClick={() => setShowSort((v) => !v)} title="Trier">
              <span>⇅</span> {currentSortLabel} {order === 'asc' ? '▲' : '▼'}
            </button>
            {showSort && (
              <div className="sort-menu">
                {SORTS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className={sort === s.value ? 'on' : ''}
                    onClick={() => { clickColumn(s.value); setShowSort(false); }}
                  >
                    <span>{s.label}</span>
                    {sort === s.value && <span>{order === 'asc' ? '▲ croissant' : '▼ décroissant'}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {theme === 'prestige' && categories.length > 0 && !uploaderId && (
        <nav className="tabs" aria-label="Catégories">
          <button type="button" className={!categoryId ? 'on' : ''} onClick={() => updateParam('categoryId', '')}>Tout</button>
          {categories.map((c) => {
            const isActive = categoryId === c.id || !!c.children?.some((sub: any) => sub.id === categoryId);
            return <button key={c.id} type="button" className={isActive ? 'on' : ''} onClick={() => updateParam('categoryId', c.id)}>{c.name}</button>;
          })}
        </nav>
      )}

      <div className="facet-rows">
        {([
          ['resolution', 'Qualité', resolution, RESOLUTIONS, (v: string) => (v === '4K/2160p' ? '4K UHD' : v === '480p' ? 'SD' : v)],
          ['source', 'Source', source, SOURCES, (v: string) => v],
          ['origin', 'Origine', origin, ORIGINS, (v: string) => v],
          ['language', 'Langue', language, LANGUAGES, (v: string) => v],
          ['codec', 'Codec', codec, CODECS, (v: string) => v],
          ['audio', 'Audio', audio, AUDIO_FORMATS, (v: string) => v],
          ['genre', 'Genre', genre, [] as string[], (v: string) => v],
        ] as [string, string, string, string[], (v: string) => string][]).map(([key, label, current, order, show]) => {
          const available = facets[key] ?? [];
          const rank = (v: string) => { const i = order.findIndex((o) => o.toLowerCase() === v.toLowerCase()); return i === -1 ? 999 : i; };
          const values = [...available].sort((x, y) => rank(x.value) - rank(y.value) || y.count - x.count);
          if (current && !values.some((v) => v.value.toLowerCase() === current.toLowerCase())) values.unshift({ value: current, count: 0 });
          const showHdr = key === 'resolution' && ((facets.hdr?.length ?? 0) > 0 || hdr);
          if (values.length === 0 && !showHdr) return null;
          return (
            <div className="facet-row" key={key}>
              <span className="facet-label">{label}</span>
              <button type="button" className={!current ? 'on' : ''} onClick={() => updateParam(key, '')}>Toutes</button>
              {values.map((v) => (
                <button key={v.value} type="button" className={current.toLowerCase() === v.value.toLowerCase() ? 'on' : ''} onClick={() => updateParam(key, current.toLowerCase() === v.value.toLowerCase() ? '' : v.value)}>
                  {show(v.value)} <span style={{ opacity: 0.6, fontSize: 11 }}>{v.count}</span>
                </button>
              ))}
              {showHdr && (
                <button type="button" className={hdr ? 'on' : ''} onClick={() => updateParam('hdr', hdr ? 'false' : 'true')}>
                  HDR <span style={{ opacity: 0.6, fontSize: 11 }}>{facets.hdr?.[0]?.count ?? ''}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {uploaderId && (
        <button className="secondary" style={{ alignSelf: 'flex-start' }} onClick={() => updateParam('uploaderId', '')}>
          ← Voir tous les torrents
        </button>
      )}
      {activeParent && activeParent.children?.length > 0 && (
        <div className="category-chips" style={{ marginTop: 0 }}>
          <a
            onClick={() => updateParam('categoryId', activeParent.id)}
            style={{ cursor: 'pointer', borderColor: categoryId === activeParent.id ? 'var(--gold)' : undefined }}
          >
            Tout {activeParent.name}
          </a>
          {activeParent.children.map((sub: any) => (
            <a
              key={sub.id}
              onClick={() => updateParam('categoryId', sub.id)}
              style={{ cursor: 'pointer', borderColor: categoryId === sub.id ? 'var(--gold)' : undefined }}
            >
              {sub.name}
            </a>
          ))}
        </div>
      )}

      {showFilters && (
        <div className="panel ornate">
          <div className="filter-grid">
            {field('Année', <input type="number" placeholder="2024" value={year} onChange={(e) => updateParam('year', e.target.value)} style={full} />)}
            {field('Résolution', (
              <select value={resolution} onChange={(e) => updateParam('resolution', e.target.value)} style={full}>
                <option value="">Toutes</option>
                {RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            ))}
            {field('Langue', (
              <select value={language} onChange={(e) => updateParam('language', e.target.value)} style={full}>
                <option value="">Toutes</option>
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            ))}
            {field('Source', (
              <select value={source} onChange={(e) => updateParam('source', e.target.value)} style={full}>
                <option value="">Toutes</option>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            ))}
            {field('Codec', (
              <select value={codec} onChange={(e) => updateParam('codec', e.target.value)} style={full}>
                <option value="">Tous</option>
                {CODECS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ))}
            {field('Audio', (
              <select value={audio} onChange={(e) => updateParam('audio', e.target.value)} style={full}>
                <option value="">Tous</option>
                {AUDIO_FORMATS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            ))}
            {field('Format', (
              <select value={containerFormat} onChange={(e) => updateParam('containerFormat', e.target.value)} style={full}>
                <option value="">Tous</option>
                {CONTAINERS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ))}
            {field('Origine', (
              <select value={origin} onChange={(e) => updateParam('origin', e.target.value)} style={full}>
                <option value="">Toutes</option>
                {ORIGINS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
            {field('Taille min (Go)', <input type="number" value={minSizeGo} onChange={(e) => updateParam('minSize', e.target.value)} style={full} />)}
            {field('Taille max (Go)', <input type="number" value={maxSizeGo} onChange={(e) => updateParam('maxSize', e.target.value)} style={full} />)}
            {field('État', (
              <select value={state} onChange={(e) => updateParam('state', e.target.value)} style={full}>
                <option value="">Torrents actifs</option>
                <option value="noseeders">🔁 Sans seeder (à reseeder)</option>
                <option value="dead">☠️ Morts (retirés des listes)</option>
              </select>
            ))}
            {field('Seeders minimum', <input type="number" value={minSeeders} onChange={(e) => updateParam('minSeeders', e.target.value)} style={full} />)}
            <label className="row muted" style={{ gap: 6, paddingBottom: 8 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={hdr} onChange={(e) => updateParam('hdr', e.target.checked ? 'true' : 'false')} />
              HDR uniquement
            </label>
          </div>
        </div>
      )}

      {hasAdvancedFilters && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {activeFilters.map((f) => (
            <span key={f.key} className="filter-chip" onClick={() => updateParam(f.key, '')} title="Retirer ce filtre">{f.label} ✕</span>
          ))}
          <button type="button" className="secondary" style={{ padding: '2px 10px', fontSize: 12 }} onClick={resetFilters}>Tout réinitialiser</button>
        </div>
      )}

      <div className="panel">
        <div className="muted" style={{ marginBottom: 8 }}>{total} résultat(s)</div>
        {view === 'grid' ? (
          <div className="poster-grid">
            {items.map((t) => {
              const catStyle = t.category?.slug ? CATEGORY_STYLE[t.category.slug] : undefined;
              return (
                <Link
                  key={t.id}
                  to={`/torrents/${t.id}`}
                  className="poster-card"
                  onMouseEnter={(e) => showTip(t, e)}
                  onMouseMove={moveTip}
                  onMouseLeave={hideTip}
                >
                  {t.coverImage
                    ? <img className="poster" src={t.coverImage} alt="" loading="lazy" />
                    : <div className="poster-fallback">{catStyle?.icon ?? '📦'}</div>}
                  <div className="poster-badges">
                    <CategoryTag category={t.category} />
                    {t.freeleech && <span className="badge freeleech">FL</span>}
                    {t.doubleUpload && <span className="badge double">2x</span>}
                    {t.resolution && <span className="badge new">{t.resolution}</span>}
                  </div>
                  {favorites.enabled && (
                    <div className="poster-fav">
                      <FavoriteStar active={favorites.ids.has(t.id)} onToggle={() => favorites.toggle(t.id)} />
                    </div>
                  )}
                  <div className="poster-body">
                    <div className="poster-title">{t.name}</div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center' }}>
                      <HealthDot seeders={t.seeders} />
                      <span style={{ color: 'var(--success)' }}>{t.seeders}</span>&nbsp;/&nbsp;<span style={{ color: 'var(--danger)' }}>{t.leechers}</span>
                      <span style={{ marginLeft: 'auto' }}>{formatSize(t.size)}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
            {items.length === 0 && <div className="muted">Aucun résultat.</div>}
          </div>
        ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.sort}
                    className={`sortable${sort === c.sort ? ' sorted' : ''}`}
                    onClick={() => clickColumn(c.sort)}
                    title={`Trier par ${c.label.toLowerCase()}`}
                    // Toutes les colonnes sauf "Nom" se réduisent à leur contenu (largeur 1% + pas de retour à la
                    // ligne) : le tableau étant en table-layout auto, "Nom" absorbe alors tout l'espace restant et
                    // ses titres remontent juste à côté de la catégorie, au lieu d'être poussés loin à droite.
                    style={c.sort === 'nom' ? undefined : { width: '1%', whiteSpace: 'nowrap' }}
                  >
                    {c.label}<span className="sort-arrow">{sort === c.sort ? (order === 'asc' ? '▲' : '▼') : '⇅'}</span>
                  </th>
                ))}
                <th style={{ width: '1%', whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => {
                const catStyle = t.category?.slug ? CATEGORY_STYLE[t.category.slug] : undefined;
                return (
                <tr key={t.id}>
                  <td className="cat-cell" style={{ whiteSpace: 'nowrap' }}>
                    {t.category?.imageUrl
                      ? <img src={t.category.imageUrl} alt={t.category.name} title={t.category.name} style={{ height: 22, maxWidth: 80, objectFit: 'contain' }} />
                      : <CategoryTag category={t.category} />}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      {favorites.enabled && <FavoriteStar active={favorites.ids.has(t.id)} onToggle={() => favorites.toggle(t.id)} />}
                      {t.coverImage ? (
                        <img src={t.coverImage} alt="" style={{ width: 32, height: 44, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                      ) : (
                        <span className="category-swatch" style={{ background: `${(catStyle?.color ?? '#e0b84a')}26` }}>
                          {catStyle?.icon ?? '📦'}
                        </span>
                      )}
                      <span>
                        {isStaff && <Link to={`/torrents/${t.id}?edit=1`} title="Modifier / supprimer (staff)" style={{ marginRight: 6 }}>✏️</Link>}
                        <Link to={`/torrents/${t.id}`} onMouseEnter={(e) => showTip(t, e)} onMouseMove={moveTip} onMouseLeave={hideTip}>{t.name}</Link>{' '}
                        {t.freeleech && <span className="badge freeleech">FL</span>}{' '}
                        {t.doubleUpload && <span className="badge double">2x</span>}{' '}
                        {t.resolution && <span className="badge new">{t.resolution}</span>}{' '}
                        {t.hdr && <span className="badge double">HDR</span>}
                        {t.status === 'DEAD' && <span className="badge" style={{ background: 'rgba(224,90,90,0.2)', color: 'var(--danger)' }}>☠️ Mort</span>}
                        {(t.year || t.language || t.source) && (
                          <div className="muted" style={{ fontSize: 11 }}>
                            {[t.year, t.origin, t.language, t.source, t.codec].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{timeAgo(t.createdAt)}</td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatSize(t.size)}</td>
                  <td style={{ color: 'var(--success)', whiteSpace: 'nowrap' }}><HealthDot seeders={t.seeders} />{t.seeders}</td>
                  <td style={{ color: 'var(--danger)' }}>{t.leechers}</td>
                  <td className="muted">{t.anonymousUpload ? 'Anonyme' : <UserLink user={t.uploader} />}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div className="row" style={{ gap: 4 }}>
                      {VIDEO_KINDS.has(resolveContentKind(t.category, t.category?.parent) ?? '') && (
                        <WatchOnlineButton compact torrentId={t.id} fileList={t.fileList} />
                      )}
                      <button
                        type="button"
                        className="icon-btn"
                        title="Télécharger le .torrent"
                        onClick={() => downloadTorrent(t.id, t.name)}
                      >
                        ⬇
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={COLUMNS.length + 1} className="muted">Aucun résultat.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        )}
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
          <span className="muted">Page {page} / {Math.max(1, Math.ceil(total / 25))}</span>
          <div className="row">
            <button className="secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>← Préc.</button>
            <button className="secondary" disabled={page * 25 >= total} onClick={() => goToPage(page + 1)}>Suiv. →</button>
          </div>
        </div>
      </div>

      {tip && (
        <div className="torrent-tip" style={tipStyle}>
          {tip.t.coverImage && <img src={tip.t.coverImage} alt="" />}
          <div style={{ minWidth: 0 }}>
            <div className="tip-title">{tip.t.name}</div>
            <div className="tip-meta">
              {[tip.t.category?.name, tip.t.year, tip.t.resolution, tip.t.language, formatSize(tip.t.size)].filter(Boolean).join(' · ')}
            </div>
            <div className="tip-meta">
              <span style={{ color: 'var(--success)' }}>▲ {tip.t.seeders}</span> · <span style={{ color: 'var(--danger)' }}>▼ {tip.t.leechers}</span> · {timeAgo(tip.t.createdAt)}
            </div>
            <div className="tip-synopsis">
              {tip.t.synopsis ?? <span className="muted">Pas de synopsis pour ce torrent.</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
