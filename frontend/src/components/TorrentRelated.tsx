import { useEffect, useState } from 'react';
import { TorrentHover } from './TorrentLink';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import MetaChips from './MetaChips';

interface Card {
  id: string;
  name: string;
  size: string | number;
  resolution: string | null;
  language: string | null;
  seeders: number;
  leechers: number;
  // Informations des étiquettes (MetaChips) : date de sortie, saison / épisode, source, codec, audio...
  [key: string]: any;
}

interface Coverage {
  season: number;
  episodes: number[] | null;
}

interface TvTorrent extends Card {
  coverage: Coverage[];
}

const pad = (n: number) => String(n).padStart(2, '0');

function ranges(nums: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(j > i ? `${nums[i]}–${nums[j]}` : String(nums[i]));
    i = j;
  }
  return out.join(', ');
}

/** Une release : les étiquettes du site (date, langue, qualité...) puis la taille écrite et les seeders. */
function ReleaseLine({ t, current, label }: { t: Card; current: boolean; label?: string }) {
  return (
    <TorrentHover id={t.id}>
      <Link to={`/torrents/${t.id}`} className={`rel-line${current ? ' current' : ''}`} title={t.name}>
        <span className="vr-chips"><MetaChips t={t} inline /></span>
        <span className="rel-size">{formatBytes(t.size)}</span>
        <span className="muted">· {t.seeders} S</span>
        {label && <span className="muted">· {label}</span>}
      </Link>
    </TorrentHover>
  );
}

/** « 3 releases » : le nombre de versions d'un épisode ou d'un film ; un clic les déplie. */
function CountBadge({ n, open }: { n: number; open: boolean }) {
  return <span className="rel-count">{open ? '▾' : '▸'} {n} release{n > 1 ? 's' : ''}</span>;
}

/** Une ligne d'épisode : une seule release s'affiche tout de suite ; plusieurs : le nombre de releases, et un clic sur l'épisode les montre avec leurs étiquettes. */
function EpisodeRow({ season, ep, have, hasPack, torrentId, seriesTitle }: { season: number; ep: { number: number; name: string; airDate?: string | null }; have: TvTorrent[]; hasPack: boolean; torrentId: string; seriesTitle: string }) {
  const [open, setOpen] = useState(false);
  const many = have.length > 1;
  const label = (t: TvTorrent) => { const c = t.coverage.find((x) => x.season === season); return c?.episodes && c.episodes.length > 1 ? `épisodes ${ranges(c.episodes)}` : undefined; };
  return (
    <>
      <tr className={many ? 'rel-click' : undefined} onClick={many ? () => setOpen((o) => !o) : undefined}>
        <td className="muted" style={{ width: 60 }}>E{pad(ep.number)}</td>
        <td>{ep.name}{ep.airDate && <span className="muted"> · {ep.airDate}</span>}</td>
        <td>
          {have.length === 0
            ? (hasPack ? <span className="muted">Dans la saison complète</span> : <span className="muted">Non disponible — <Link to={requestLink(`${seriesTitle} S${pad(season)}E${pad(ep.number)}`)}>faire une demande</Link></span>)
            : many ? <CountBadge n={have.length} open={open} /> : <ReleaseLine t={have[0]} current={have[0].id === torrentId} label={label(have[0])} />}
        </td>
      </tr>
      {many && open && (
        <tr>
          <td />
          <td colSpan={2}><div className="rel-list" style={{ padding: '2px 0 8px' }}>{have.map((t) => <ReleaseLine key={t.id} t={t} current={t.id === torrentId} label={label(t)} />)}</div></td>
        </tr>
      )}
    </>
  );
}

/** Une ligne de saga : la release s'affiche tout de suite si elle est seule ; sinon le nombre de releases, que l'on déplie d'un clic. */
function MovieRow({ part, current, torrentId }: { part: any; current: boolean; torrentId: string }) {
  const list: Card[] = part.torrents ?? [];
  const many = list.length > 1;
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className={`row${many ? ' rel-click' : ''}`} style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }} onClick={many ? () => setOpen((o) => !o) : undefined}>
        <span style={{ minWidth: 60 }} className="muted">{part.year ?? '—'}</span>
        <strong style={{ minWidth: 220, color: current ? 'var(--gold-bright)' : undefined }}>{part.title}{current ? ' (celui-ci)' : ''}</strong>
        {list.length === 0
          ? <span className="muted">Non disponible sur Seeduction — <Link to={requestLink(`${part.title}${part.year ? ` (${part.year})` : ''}`)}>faire une demande</Link></span>
          : many ? <CountBadge n={list.length} open={open} /> : <ReleaseLine t={list[0]} current={list[0].id === torrentId} />}
      </div>
      {many && open && <div className="rel-list" style={{ margin: '6px 0 4px 68px' }}>{list.map((t) => <ReleaseLine key={t.id} t={t} current={t.id === torrentId} />)}</div>}
    </div>
  );
}

/** Les saisons complètes : une seule release s'affiche ; plusieurs : leur nombre, et un clic les montre. */
function PackRow({ list, torrentId }: { list: TvTorrent[]; torrentId: string }) {
  const many = list.length > 1;
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 8 }}>
      <div className={`row${many ? ' rel-click' : ''}`} style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }} onClick={many ? () => setOpen((o) => !o) : undefined}>
        <strong style={{ minWidth: 130 }}>Saison complète</strong>
        {many ? <CountBadge n={list.length} open={open} /> : <ReleaseLine t={list[0]} current={list[0].id === torrentId} />}
      </div>
      {many && open && <div className="rel-list" style={{ margin: '6px 0 0 138px' }}>{list.map((t) => <ReleaseLine key={t.id} t={t} current={t.id === torrentId} />)}</div>}
    </div>
  );
}

function requestLink(title: string) {
  return `/requests?title=${encodeURIComponent(title)}`;
}

/**
 * Suites/sagas (films) ou saisons/épisodes (séries) du même titre, d'après la
 * fiche TMDB liée aux torrents, avec ce qui est disponible sur Seeduction.
 */
export default function TorrentRelated({ torrentId, seriesTitle }: { torrentId: string; seriesTitle: string }) {
  const [data, setData] = useState<any>(null);
  const [openSeason, setOpenSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<Record<number, any[] | 'error'>>({});

  useEffect(() => {
    setData(null);
    setOpenSeason(null);
    setEpisodes({});
    api.get(`/torrents/${torrentId}/related`).then((r) => setData(r.data)).catch(() => {});
  }, [torrentId]);

  async function toggleSeason(n: number) {
    if (openSeason === n) return setOpenSeason(null);
    setOpenSeason(n);
    if (episodes[n] || !data?.tmdbId) return;
    try {
      const { data: eps } = await api.get(`/metadata/tv/${data.tmdbId}/season/${n}`);
      setEpisodes((prev) => ({ ...prev, [n]: eps }));
    } catch {
      setEpisodes((prev) => ({ ...prev, [n]: 'error' }));
    }
  }

  if (!data || !data.kind) return null;

  if (data.kind === 'movie') {
    const parts: any[] = data.parts ?? [];
    if (parts.length < 2) return null;
    return (
      <div className="panel">
        <div className="panel-title">Saga : {data.collection?.name}</div>
        <div className="grid" style={{ gap: 8 }}>
          {parts.map((p) => <MovieRow key={p.tmdbId} part={p} current={String(p.tmdbId) === String(data.currentTmdbId)} torrentId={torrentId} />)}
        </div>
      </div>
    );
  }

  // Série : saisons connues de TMDB + saisons couvertes par des torrents du site.
  const torrents: TvTorrent[] = data.torrents ?? [];
  const seasonInfo = new Map<number, any>((data.seasons ?? []).map((s: any) => [s.number, s]));
  for (const t of torrents) for (const c of t.coverage) if (!seasonInfo.has(c.season)) seasonInfo.set(c.season, { number: c.season, name: `Saison ${c.season}` });
  const seasonNumbers = [...seasonInfo.keys()].sort((a, b) => a - b);
  if (seasonNumbers.length === 0) return null;

  const covering = (season: number) => torrents.filter((t) => t.coverage.some((c) => c.season === season));
  /** Épisodes manquants d'une saison dont les torrents du site ne couvrent qu'une partie (0 si une saison complète existe ou si le nombre d'épisodes est inconnu). */
  const missingEpisodes = (season: number, total?: number | null) => {
    if (!total) return 0;
    const list = covering(season);
    if (list.length === 0 || list.some((t) => t.coverage.some((c) => c.season === season && c.episodes === null))) return 0;
    const have = new Set<number>();
    list.forEach((t) => t.coverage.forEach((c) => { if (c.season === season) (c.episodes ?? []).forEach((e) => have.add(e)); }));
    return Math.max(0, total - have.size);
  };
  /** Épisodes précis qui couvrent cet épisode (hors saisons complètes, listées à part). */
  /** Une saison complète : sans détail d'épisodes, ou qui contient TOUS les épisodes de la saison (quand leur liste est connue) : elle n'est pas répétée sous chaque épisode. */
  const isPack = (c: Coverage, epNums: number[] | null) => c.episodes === null || (!!epNums && epNums.length >= 2 && epNums.every((x) => c.episodes!.includes(x)));
  const coversEpisode = (season: number, ep: number, epNums: number[] | null) =>
    torrents.filter((t) => t.coverage.some((c) => c.season === season && !isPack(c, epNums) && c.episodes !== null && c.episodes.includes(ep)));
  const packs = (season: number, epNums: number[] | null) => torrents.filter((t) => t.coverage.some((c) => c.season === season && isPack(c, epNums)));
  /** Résumé d'une saison : saison complète disponible, ou nombre d'épisodes disponibles. */
  const availability = (season: number) => {
    const list = covering(season);
    const complete = list.some((t) => t.coverage.some((c) => c.season === season && c.episodes === null));
    const have = new Set<number>();
    list.forEach((t) => t.coverage.forEach((c) => { if (c.season === season) (c.episodes ?? []).forEach((e) => have.add(e)); }));
    return { any: list.length > 0, complete, count: have.size };
  };

  return (
    <div className="panel">
      <div className="panel-title">Saisons et épisodes</div>
      <div className="grid" style={{ gap: 10 }}>
        {seasonNumbers.map((n) => {
          const s = seasonInfo.get(n);
          const list = covering(n);
          const isOpen = openSeason === n;
          const eps = episodes[n];
          const epNums: number[] | null = Array.isArray(eps) ? eps.map((e: any) => e.number) : null;
          return (
            <div key={n}>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <button type="button" className="secondary" onClick={() => toggleSeason(n)} style={{ minWidth: 150, textAlign: 'left' }}>
                  {isOpen ? '▾' : '▸'} {s.name}
                </button>
                <span className="muted">
                  {[s.episodeCount ? `${s.episodeCount} épisode${s.episodeCount > 1 ? 's' : ''}` : null, s.airDate ? String(s.airDate).slice(0, 4) : null].filter(Boolean).join(' · ')}
                </span>
                {(() => {
                  const av = availability(n);
                  const missing = missingEpisodes(n, s.episodeCount);
                  if (!av.any) return <span className="muted">Non disponible — <Link to={requestLink(`${seriesTitle} ${s.name}`)}>faire une demande</Link></span>;
                  if (av.complete) return <span className="rel-ok">✓ Saison complète disponible</span>;
                  return (
                    <span>
                      <span className="rel-ok">{av.count} épisode{av.count > 1 ? 's' : ''} disponible{av.count > 1 ? 's' : ''}</span>
                      {s.episodeCount && s.episodeCount >= av.count ? <span className="muted"> sur {s.episodeCount}</span> : null}
                      {missing > 0 && <span className="muted"> · {missing} manquant{missing > 1 ? 's' : ''} — <Link to={requestLink(`${seriesTitle} ${s.name} (saison complète)`)}>faire une demande</Link></span>}
                    </span>
                  );
                })()}
              </div>

              {isOpen && (
                <div style={{ margin: '8px 0 4px 16px' }}>
                  {!eps && <p className="muted">Chargement...</p>}
                  {eps === 'error' && <p className="muted">Liste des épisodes indisponible.</p>}
                  {packs(n, epNums).length > 0 && <PackRow list={packs(n, epNums)} torrentId={torrentId} />}
                  {Array.isArray(eps) && (
                    <table>
                      <tbody>
                        {eps.map((e: any) => <EpisodeRow key={e.number} season={n} ep={e} have={coversEpisode(n, e.number, epNums)} hasPack={packs(n, epNums).length > 0} torrentId={torrentId} seriesTitle={seriesTitle} />)}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
