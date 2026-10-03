import { facetsFromParams } from '../lib/facets';
import { useEffect, useMemo, useRef, useState } from 'react';
import SearchBox from '../components/SearchBox';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { CATEGORY_STYLE } from '../components/Layout';
import { useAuthStore } from '../store/auth';
import { useTheme, applyCategoryAccent } from '../lib/theme';
import { useViewMode } from '../lib/viewMode';
import TorrentView, { ViewSwitcher } from '../components/TorrentView';
import Recommended from '../components/Recommended';
import { parseNaturalQuery, ORIGINS, RESOLUTIONS, LANGUAGES, SOURCES, CODECS, AUDIO_FORMATS, CONTAINERS } from '../lib/searchParser';

const SORTS = [
  { value: 'date', label: 'Date' },
  { value: 'nom', label: 'Nom' },
  { value: 'taille', label: 'Taille' },
  { value: 'seeders', label: 'Seeders' },
  { value: 'leechers', label: 'Leechers' },
  { value: 'popularite', label: 'Popularité' },
  { value: 'activite', label: 'Activité' },
];

// Sens par défaut au premier clic (comme côté serveur) : texte A→Z, chiffres du plus grand au plus petit.
const DEFAULT_DIR: Record<string, 'asc' | 'desc'> = {
  date: 'desc', nom: 'asc', taille: 'desc', seeders: 'desc', leechers: 'desc', popularite: 'desc', activite: 'desc', categorie: 'asc', uploader: 'asc',
};
const PAGE_SIZES = [25, 50, 100];

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const rawSearch = params.get('search') ?? '';
  const categoryId = params.get('categoryId') ?? '';
  const uploaderId = params.get('uploaderId') ?? '';
  const page = parseInt(params.get('page') ?? '1', 10);
  const pageSize = PAGE_SIZES.includes(parseInt(params.get('pageSize') ?? '', 10)) ? parseInt(params.get('pageSize')!, 10) : 25;
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
  const maxSeeders = params.get('maxSeeders') ?? '';
  const state = params.get('state') === 'dead' ? 'dead' : params.get('state') === 'noseeders' ? 'noseeders' : '';
  const period = params.get('period') === 'day' || params.get('period') === 'week' || params.get('period') === 'month' ? params.get('period')! : '';

  // Filtres propres à la catégorie : `f.formatMusique=FLAC|MP3` dans l'adresse (OU entre valeurs, ET entre filtres).
  const attrSel = useMemo(() => facetsFromParams(params), [params]);
  const attrKey = JSON.stringify(attrSel);
  const attrParams = useMemo(() => Object.fromEntries(Object.entries(attrSel).map(([k, v]) => [`f.${k}`, v.join('|')])), [attrKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [openFacets, setOpenFacets] = useState<Set<string>>(new Set());

  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<any[]>([]);
  const theme = useTheme();
  const authUser = useAuthStore((s) => s.user);
  const currentUserId = authUser?.id;
  const [view, setView] = useViewMode('browse');
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [closedCatId, setClosedCatId] = useState<string | null>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/torrents', {
      params: {
        search: parsed.name, categoryId, uploaderId, page, pageSize, sort, order,
        year: year || undefined, resolution: resolution || undefined, language: language || undefined,
        source: source || undefined, codec: codec || undefined, audio: audio || undefined,
        containerFormat: containerFormat || undefined, origin: origin || undefined, genre: genre || undefined, hdr: hdr || undefined,
        minSize: minSizeGo ? Number(minSizeGo) * 1e9 : undefined,
        maxSize: maxSizeGo ? Number(maxSizeGo) * 1e9 : undefined,
        minSeeders: minSeeders || undefined,
        maxSeeders: maxSeeders || undefined,
        state: state || undefined,
        period: period || undefined,
        ...attrParams,
      },
    }).then((r) => {
      setItems(r.data.items);
      setTotal(r.data.total);
    });
  }, [parsed.name, categoryId, uploaderId, page, pageSize, sort, order, year, resolution, language, source, codec, audio, containerFormat, origin, genre, hdr, minSizeGo, maxSizeGo, minSeeders, maxSeeders, state, period, attrKey]);

  // Valeurs de filtres réellement disponibles pour la liste affichée (avec nombre de torrents).
  const [facets, setFacets] = useState<Record<string, any>>({});
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
        maxSeeders: maxSeeders || undefined,
        state: state || undefined,
        period: period || undefined,
        ...attrParams,
      },
    }).then((r) => setFacets(r.data)).catch(() => {});
  }, [parsed.name, categoryId, uploaderId, year, resolution, language, source, codec, audio, containerFormat, origin, genre, hdr, minSizeGo, maxSizeGo, minSeeders, maxSeeders, state, period, attrKey]);


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

  // « L'accent suit la catégorie » (option cochable, voir ThemeSwitcher) : sans effet si elle est désactivée
  // (applyCategoryAccent le revérifie lui-même). Toujours nettoyé en quittant la page.
  useEffect(() => {
    applyCategoryAccent(activeParent?.slug ? CATEGORY_STYLE[activeParent.slug]?.color ?? null : null);
    return () => applyCategoryAccent(null);
  }, [activeParent?.slug]);

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

  function changePageSize(size: number) {
    const next = new URLSearchParams(params);
    next.set('pageSize', String(size));
    next.set('page', '1'); // la page courante n'a plus forcément de sens avec une autre taille de page
    setParams(next);
  }

  function resetFilters() {
    const next = new URLSearchParams();
    if (rawSearch) next.set('search', rawSearch);
    if (categoryId) next.set('categoryId', categoryId);
    if (params.get('sort')) next.set('sort', params.get('sort')!);
    if (params.get('order')) next.set('order', params.get('order')!);
    if (params.get('pageSize')) next.set('pageSize', params.get('pageSize')!);
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
    maxSeeders && { key: 'maxSeeders', label: `≤ ${maxSeeders} seeders` },
    state && { key: 'state', label: state === 'dead' ? '☠️ Torrents morts' : '🔁 Sans seeder' },
    ...Object.entries(attrSel).map(([k, v]) => ({ key: `f.${k}`, label: `${(facets.attrs as any[] | undefined)?.find((f) => f.key === k)?.label ?? k} : ${v.join(', ')}` })),
  ] as (false | '' | { key: string; label: string })[]).filter(Boolean) as { key: string; label: string }[];
  const hasAdvancedFilters = activeFilters.length > 0;
  const currentSortLabel = SORTS.find((s) => s.value === sort)?.label ?? 'Date';


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
          <ViewSwitcher value={view} onChange={setView} />
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
          {categories.map((c: any) => {
            const isActive = categoryId === c.id || !!c.children?.some((sub: any) => sub.id === categoryId);
            const total = (c._count?.torrents ?? 0) + (c.children?.reduce((sum: number, sub: any) => sum + (sub._count?.torrents ?? 0), 0) ?? 0);
            const hasChildren = c.children?.length > 0;
            // Le menu déroulant se montre au survol (CSS) : cliquer un sous-lien ne fait pas bouger la souris, donc
            // il resterait ouvert tant qu'on ne bouge pas ailleurs. `closedCatId` le force fermé juste après un clic,
            // et se réinitialise dès que la souris quitte vraiment cette catégorie (prêt à se rouvrir normalement).
            const forceClosed = closedCatId === c.id;
            return (
              <div key={c.id} className={`cat-tab-wrap${forceClosed ? ' force-closed' : ''}`} onMouseLeave={() => setClosedCatId(null)}>
                <button type="button" className={isActive ? 'on' : ''} onClick={() => { updateParam('categoryId', c.id); setClosedCatId(c.id); }}>
                  {c.name}
                  <span className="cat-tab-count">{total}</span>
                </button>
                {hasChildren && (
                  <div className="cat-tab-dropdown">
                    <button type="button" className={categoryId === c.id ? 'on' : ''} onClick={() => { updateParam('categoryId', c.id); setClosedCatId(c.id); }}>Tout {c.name}</button>
                    {c.children.map((sub: any) => (
                      <button key={sub.id} type="button" className={categoryId === sub.id ? 'on' : ''} onClick={() => { updateParam('categoryId', sub.id); setClosedCatId(c.id); }}>
                        {sub.name} <span className="cat-tab-count">{sub._count?.torrents ?? 0}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      )}

      <div className="facet-rows">
        <div className="facet-row">
          <span className="facet-label">Ajoutés</span>
          <button type="button" className={!period ? 'on' : ''} onClick={() => updateParam('period', '')}>Toujours</button>
          <button type="button" className={period === 'day' ? 'on' : ''} onClick={() => updateParam('period', 'day')}>24 heures</button>
          <button type="button" className={period === 'week' ? 'on' : ''} onClick={() => updateParam('period', 'week')}>Cette semaine</button>
          <button type="button" className={period === 'month' ? 'on' : ''} onClick={() => updateParam('period', 'month')}>Ce mois</button>
        </div>
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

      {Array.isArray(facets.attrs) && facets.attrs.length > 0 && (
        <div className="facet-rows">
          {(facets.attrs as { key: string; label: string; values: { value: string; count: number }[] }[]).map((f) => {
            const selected = attrSel[f.key] ?? [];
            const expanded = openFacets.has(f.key);
            const LIMIT = 14;
            // Les valeurs choisies restent toujours visibles, même si la liste est repliée.
            const shown = expanded || f.values.length <= LIMIT ? f.values : f.values.filter((v, i) => i < LIMIT || selected.includes(v.value));
            const toggle = (value: string) => {
              const next = selected.includes(value) ? selected.filter((x) => x !== value) : [...selected, value];
              updateParam(`f.${f.key}`, next.join('|'));
            };
            return (
              <div className="facet-row" key={f.key}>
                <span className="facet-label">{f.label}</span>
                <button type="button" className={selected.length === 0 ? 'on' : ''} onClick={() => updateParam(`f.${f.key}`, '')}>Toutes</button>
                {shown.map((v) => (
                  <button key={v.value} type="button" className={selected.includes(v.value) ? 'on' : ''} onClick={() => toggle(v.value)}>
                    {v.value} <span style={{ opacity: 0.6, fontSize: 11 }}>{v.count}</span>
                  </button>
                ))}
                {f.values.length > LIMIT && (
                  <button type="button" className="secondary" onClick={() => setOpenFacets((cur) => { const n = new Set(cur); if (n.has(f.key)) n.delete(f.key); else n.add(f.key); return n; })}>
                    {expanded ? 'Moins' : `+ ${f.values.length - shown.length} autres`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

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
            {field('Seeders maximum', <input type="number" value={maxSeeders} onChange={(e) => updateParam('maxSeeders', e.target.value)} style={full} />)}
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
        <TorrentView items={items} view={view} sort={sort} order={order} onSort={clickColumn} />
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
          <span className="muted">Page {page} / {Math.max(1, Math.ceil(total / pageSize))} ({total} résultat{total > 1 ? 's' : ''})</span>
          <div className="row" style={{ gap: 10 }}>
            <label className="muted row" style={{ gap: 6, fontSize: 12.5 }}>
              Par page
              <select value={pageSize} onChange={(e) => changePageSize(Number(e.target.value))} style={{ width: 'auto', padding: '4px 8px', fontSize: 12.5 }}>
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button className="secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>← Préc.</button>
            <button className="secondary" disabled={page * pageSize >= total} onClick={() => goToPage(page + 1)}>Suiv. →</button>
          </div>
        </div>
      </div>

      {items.length === 0 && !uploaderId && <Recommended title="🔎 Rien trouvé ? Tu pourrais aimer" subtitle="Selon ton historique" />}

    </div>
  );
}
