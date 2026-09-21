import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';

interface Card {
  id: string;
  name: string;
  size: string | number;
  resolution: string | null;
  language: string | null;
  seeders: number;
  leechers: number;
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

function TorrentChip({ t, current, label }: { t: Card; current: boolean; label?: string }) {
  return (
    <Link
      to={`/torrents/${t.id}`}
      className="entity-chip"
      title={t.name}
      style={current ? { borderColor: 'var(--gold)' } : undefined}
    >
      {[t.resolution, t.language, formatBytes(t.size)].filter(Boolean).join(' · ')}
      <span className="muted">· {t.seeders} S</span>
      {label && <span className="muted">· {label}</span>}
    </Link>
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
          {parts.map((p) => {
            const isCurrent = String(p.tmdbId) === String(data.currentTmdbId);
            return (
              <div key={p.tmdbId} className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <span style={{ minWidth: 60 }} className="muted">{p.year ?? '—'}</span>
                <strong style={{ minWidth: 220, color: isCurrent ? 'var(--gold-bright)' : undefined }}>
                  {p.title}{isCurrent ? ' (celui-ci)' : ''}
                </strong>
                {p.torrents.length > 0
                  ? p.torrents.map((t: Card) => <TorrentChip key={t.id} t={t} current={t.id === torrentId} />)
                  : <span className="muted">Non disponible sur Seeduction — <Link to={requestLink(`${p.title}${p.year ? ` (${p.year})` : ''}`)}>faire une demande</Link></span>}
              </div>
            );
          })}
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
  const coversEpisode = (season: number, ep: number) =>
    torrents.filter((t) => t.coverage.some((c) => c.season === season && (c.episodes === null || c.episodes.includes(ep))));

  return (
    <div className="panel">
      <div className="panel-title">Saisons et épisodes</div>
      <div className="grid" style={{ gap: 10 }}>
        {seasonNumbers.map((n) => {
          const s = seasonInfo.get(n);
          const list = covering(n);
          const isOpen = openSeason === n;
          const eps = episodes[n];
          return (
            <div key={n}>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <button type="button" className="secondary" onClick={() => toggleSeason(n)} style={{ minWidth: 150, textAlign: 'left' }}>
                  {isOpen ? '▾' : '▸'} {s.name}
                </button>
                <span className="muted">
                  {[s.episodeCount ? `${s.episodeCount} épisodes` : null, s.airDate ? String(s.airDate).slice(0, 4) : null].filter(Boolean).join(' · ')}
                </span>
                {list.length > 0
                  ? list.map((t) => {
                      const c = t.coverage.find((x) => x.season === n)!;
                      return <TorrentChip key={t.id} t={t} current={t.id === torrentId} label={c.episodes === null ? 'saison complète' : `épisodes ${ranges(c.episodes)}`} />;
                    })
                  : <span className="muted">Non disponible — <Link to={requestLink(`${seriesTitle} ${s.name}`)}>faire une demande</Link></span>}
              </div>

              {isOpen && (
                <div style={{ margin: '8px 0 4px 16px' }}>
                  {!eps && <p className="muted">Chargement...</p>}
                  {eps === 'error' && <p className="muted">Liste des épisodes indisponible.</p>}
                  {Array.isArray(eps) && (
                    <table>
                      <tbody>
                        {eps.map((e: any) => {
                          const have = coversEpisode(n, e.number);
                          return (
                            <tr key={e.number}>
                              <td className="muted" style={{ width: 60 }}>E{pad(e.number)}</td>
                              <td>{e.name}{e.airDate && <span className="muted"> · {e.airDate}</span>}</td>
                              <td style={{ textAlign: 'right' }}>
                                {have.length > 0
                                  ? have.map((t) => <TorrentChip key={t.id} t={t} current={t.id === torrentId} />)
                                  : <span className="muted">—</span>}
                              </td>
                            </tr>
                          );
                        })}
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
