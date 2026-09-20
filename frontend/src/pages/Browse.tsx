import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes as formatSize } from '../lib/format';
import { CATEGORY_STYLE } from '../components/Layout';
import { parseNaturalQuery, RESOLUTIONS, LANGUAGES, SOURCES, CODECS, AUDIO_FORMATS, CONTAINERS } from '../lib/searchParser';

const SORTS = [
  { value: 'date', label: 'Date' },
  { value: 'seeders', label: 'Seeders' },
  { value: 'taille', label: 'Taille' },
  { value: 'popularite', label: 'Popularité' },
  { value: 'activite', label: 'Activité' },
];

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const rawSearch = params.get('search') ?? '';
  const categoryId = params.get('categoryId') ?? '';
  const uploaderId = params.get('uploaderId') ?? '';
  const page = parseInt(params.get('page') ?? '1', 10);
  const sort = params.get('sort') ?? 'date';

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
  const hdr = params.get('hdr') === 'true' || (!!parsed.hdr && params.get('hdr') !== 'false');
  const minSizeGo = params.get('minSize') ?? '';
  const maxSizeGo = params.get('maxSize') ?? '';
  const minSeeders = params.get('minSeeders') ?? '';

  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    api.get('/torrents', {
      params: {
        search: parsed.name, categoryId, uploaderId, page, pageSize: 25, sort,
        year: year || undefined, resolution: resolution || undefined, language: language || undefined,
        source: source || undefined, codec: codec || undefined, audio: audio || undefined,
        containerFormat: containerFormat || undefined, hdr: hdr || undefined,
        minSize: minSizeGo ? Number(minSizeGo) * 1e9 : undefined,
        maxSize: maxSizeGo ? Number(maxSizeGo) * 1e9 : undefined,
        minSeeders: minSeeders || undefined,
      },
    }).then((r) => {
      setItems(r.data.items);
      setTotal(r.data.total);
    });
  }, [parsed.name, categoryId, uploaderId, page, sort, year, resolution, language, source, codec, audio, containerFormat, hdr, minSizeGo, maxSizeGo, minSeeders]);

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data));
  }, []);

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
    setParams(next);
  }

  const hasAdvancedFilters = year || resolution || language || source || codec || audio || containerFormat || hdr || minSizeGo || maxSizeGo || minSeeders;

  return (
    <div className="grid">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{uploaderId ? 'Mes uploads' : 'Parcourir'}</h1>
        <input
          placeholder="Rechercher... (ex: Dune 2024 4K HDR VOSTFR)"
          value={rawSearch}
          onChange={(e) => updateParam('search', e.target.value)}
          style={{ width: 320 }}
        />
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

      <div className="split-2">
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="muted">{total} résultat(s)</span>
            <div className="row">
              <span className="muted">Trier par</span>
              <select value={sort} onChange={(e) => updateParam('sort', e.target.value)}>
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <table>
            <thead>
              <tr><th>Nom</th><th>Catégorie</th><th>Taille</th><th>S</th><th>L</th><th>Uploader</th></tr>
            </thead>
            <tbody>
              {items.map((t) => {
                const catStyle = t.category?.slug ? CATEGORY_STYLE[t.category.slug] : undefined;
                return (
                <tr key={t.id}>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      {t.coverImage ? (
                        <img src={t.coverImage} alt="" style={{ width: 32, height: 44, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                      ) : (
                        <span className="category-swatch" style={{ background: `${(catStyle?.color ?? '#e0b84a')}26` }}>
                          {catStyle?.icon ?? '📦'}
                        </span>
                      )}
                      <span>
                        <Link to={`/torrents/${t.id}`}>{t.name}</Link>{' '}
                        {t.freeleech && <span className="badge freeleech">FL</span>}{' '}
                        {t.doubleUpload && <span className="badge double">2x</span>}{' '}
                        {t.resolution && <span className="badge new">{t.resolution}</span>}{' '}
                        {t.hdr && <span className="badge double">HDR</span>}
                        {(t.year || t.language || t.source) && (
                          <div className="muted" style={{ fontSize: 11 }}>
                            {[t.year, t.language, t.source, t.codec].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="muted">{t.category?.name}</td>
                  <td className="muted">{formatSize(t.size)}</td>
                  <td style={{ color: 'var(--success)' }}>{t.seeders}</td>
                  <td style={{ color: 'var(--danger)' }}>{t.leechers}</td>
                  <td className="muted">{t.anonymousUpload ? 'Anonyme' : t.uploader?.username}</td>
                </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={6} className="muted">Aucun résultat.</td></tr>
              )}
            </tbody>
          </table>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            <span className="muted">Page {page}</span>
            <div className="row">
              <button className="secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>← Préc.</button>
              <button className="secondary" disabled={page * 25 >= total} onClick={() => goToPage(page + 1)}>Suiv. →</button>
            </div>
          </div>
        </div>

        <div className="panel ornate">
          <div className="panel-title"><span className="title-icon">🔎</span>Filtres avancés</div>
          <div className="grid" style={{ gap: 10 }}>
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>Année</div>
              <input type="number" placeholder="2024" value={year} onChange={(e) => updateParam('year', e.target.value)} />
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>Résolution</div>
              <select value={resolution} onChange={(e) => updateParam('resolution', e.target.value)}>
                <option value="">Toutes</option>
                {RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>Langue</div>
              <select value={language} onChange={(e) => updateParam('language', e.target.value)}>
                <option value="">Toutes</option>
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>Source</div>
              <select value={source} onChange={(e) => updateParam('source', e.target.value)}>
                <option value="">Toutes</option>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>Codec</div>
              <select value={codec} onChange={(e) => updateParam('codec', e.target.value)}>
                <option value="">Tous</option>
                {CODECS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>Audio</div>
              <select value={audio} onChange={(e) => updateParam('audio', e.target.value)}>
                <option value="">Tous</option>
                {AUDIO_FORMATS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>Format</div>
              <select value={containerFormat} onChange={(e) => updateParam('containerFormat', e.target.value)}>
                <option value="">Tous</option>
                {CONTAINERS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <label className="row muted" style={{ gap: 6 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={hdr} onChange={(e) => updateParam('hdr', e.target.checked ? 'true' : 'false')} />
              HDR uniquement
            </label>
            <div className="row">
              <div style={{ flex: 1 }}>
                <div className="muted" style={{ marginBottom: 4 }}>Taille min (Go)</div>
                <input type="number" value={minSizeGo} onChange={(e) => updateParam('minSize', e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="muted" style={{ marginBottom: 4 }}>Taille max (Go)</div>
                <input type="number" value={maxSizeGo} onChange={(e) => updateParam('maxSize', e.target.value)} />
              </div>
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>Seeders minimum</div>
              <input type="number" value={minSeeders} onChange={(e) => updateParam('minSeeders', e.target.value)} />
            </div>
            {hasAdvancedFilters && (
              <button className="secondary" onClick={resetFilters}>Réinitialiser les filtres</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
