import { Link } from 'react-router-dom';
import { api } from '../api/client';
import HoverCard from './HoverCard';
import { formatBytes, formatRuntime } from '../lib/format';
import { timeAgo } from '../lib/time';
import { useTipStyle, type TipStyle } from '../lib/tipStyle';
import { HealthDot } from './TorrentBits';
import MetaChips from './MetaChips';

const loadPreview = (id: string) => () => api.get(`/torrents/${id}/preview`).then((r) => r.data);

function Credits({ t }: { t: any }) {
  if (!t.director && !(t.cast?.length > 0)) return null;
  return (
    <dl className="tp-credits">
      {t.director && <><dt>Réal.</dt><dd>{t.director}</dd></>}
      {t.cast?.length > 0 && <><dt>Avec</dt><dd>{t.cast.join(', ')}</dd></>}
    </dl>
  );
}

function Genres({ t }: { t: any }) {
  if (!(t.genres?.length > 0)) return null;
  return <div className="tp-genres">{t.genres.slice(0, 4).map((g: string) => <span key={g} className="tp-genre">{g}</span>)}</div>;
}

/** Pastilles année · note · durée (les infos que l'on regarde en premier). */
function Chips({ t }: { t: any }) {
  const runtime = formatRuntime(t.runtime);
  return (
    <div className="tp-chips">
      {t.rating != null && <span className="tp-chip rating">★ {t.rating.toFixed(1)}<small> /10</small></span>}
      {runtime && <span className="tp-chip">◷ {runtime}</span>}
    </div>
  );
}

/** Ligne propre à un torrent : santé, pairs, qualité, taille, ancienneté. */
function Stats({ t }: { t: any }) {
  return (
    <div className="tp-stats">
      <HealthDot seeders={t.seeders} />
      <span style={{ color: 'var(--success)' }}>▲ {t.seeders}</span>
      <span style={{ color: 'var(--danger)' }}>▼ {t.leechers}</span>
      {[t.resolution, formatBytes(t.size), timeAgo(t.createdAt)].filter(Boolean).map((x, i) => <span key={i} className="muted">· {x}</span>)}
    </div>
  );
}

function Synopsis({ t, lines }: { t: any; lines?: number }) {
  return <p className="tp-synopsis" style={lines ? { WebkitLineClamp: lines } : undefined}>{t.synopsis ?? <span className="muted">Pas de synopsis pour ce torrent.</span>}</p>;
}

/** Style « Affiche » : grande affiche, titre posé dessus, pastilles, genres, synopsis et casting. */
function PosterTip({ t }: { t: any }) {
  return (
    <>
      <div className="tp-hero">
        {t.coverImage ? <img src={t.coverImage} alt="" /> : <div className="tp-nocover">🎬</div>}
        <div className="tp-hero-fade" />
        <div className="tp-hero-title">{t.name}</div>
      </div>
      <div className="tp-body">
        <Chips t={t} />
        <MetaChips t={t} className="tp-meta-chips" />
        <Genres t={t} />
        <Synopsis t={t} lines={4} />
        <Credits t={t} />
        <Stats t={t} />
      </div>
    </>
  );
}

/** Style « Cinéma » : bandeau panoramique, petite affiche qui chevauche, synopsis et casting. */
function CinemaTip({ t }: { t: any }) {
  const banner = t.backdrop ?? t.coverImage;
  return (
    <>
      <div className="tp-banner" style={banner ? { backgroundImage: `url("${banner}")` } : undefined}><div className="tp-hero-fade" /></div>
      <div className="tp-cin-head">
        {t.coverImage ? <img src={t.coverImage} alt="" className="tp-thumb" /> : <div className="tp-thumb tp-nocover">🎬</div>}
        <div style={{ minWidth: 0 }}>
          <div className="tp-title">{t.name}</div>
          <Chips t={t} />
        </div>
      </div>
      <div className="tp-body">
        <MetaChips t={t} className="tp-meta-chips" />
        <Genres t={t} />
        <Synopsis t={t} lines={4} />
        <Credits t={t} />
        <Stats t={t} />
      </div>
    </>
  );
}

/** Style « Classique » : petite affiche à gauche, détail à droite. */
function ClassicTip({ t }: { t: any }) {
  const runtime = formatRuntime(t.runtime);
  return (
    <>
      {t.coverImage && <img src={t.coverImage} alt="" className="tp-side-img" />}
      <div style={{ minWidth: 0 }}>
        <div className="tip-title">{t.name}</div>
        <div className="tip-meta">
          {t.rating != null && <span className="tip-rating">★ {t.rating.toFixed(1)}</span>}
          {[t.category?.name, runtime, formatBytes(t.size)].filter(Boolean).join(' · ')}
        </div>
        <MetaChips t={t} className="tp-meta-chips" />
        {(t.director || t.cast?.length > 0) && (
          <div className="tip-meta tip-credits">
            {t.director && <div><span className="muted">Réalisation :</span> {t.director}</div>}
            {t.cast?.length > 0 && <div><span className="muted">Avec :</span> {t.cast.join(', ')}</div>}
          </div>
        )}
        {t.genres?.length > 0 && (
          <div className="tip-genres">{t.genres.slice(0, 4).map((g: string) => <span key={g} className="tip-genre-chip">{g}</span>)}</div>
        )}
        <div className="tip-meta">
          <HealthDot seeders={t.seeders} />
          <span style={{ color: 'var(--success)' }}>▲ {t.seeders}</span> · <span style={{ color: 'var(--danger)' }}>▼ {t.leechers}</span> · {timeAgo(t.createdAt)}
        </div>
        <div className="tip-synopsis">{t.synopsis ?? <span className="muted">Pas de synopsis pour ce torrent.</span>}</div>
      </div>
    </>
  );
}

/** Style « Minimal » : aucune image, juste l'essentiel. */
function MinimalTip({ t }: { t: any }) {
  const runtime = formatRuntime(t.runtime);
  return (
    <div className="tp-body">
      <div className="tp-title">{t.name}</div>
      <div className="tp-mini-meta">
        {t.rating != null && <span className="tip-rating">★ {t.rating.toFixed(1)}</span>}
        {[t.category?.name, runtime, t.genres?.slice(0, 2).join(' / ')].filter(Boolean).join(' · ')}
      </div>
      <MetaChips t={t} className="tp-meta-chips" />
      <Stats t={t} />
      <Synopsis t={t} lines={3} />
    </div>
  );
}

/** Contenu de l'infobulle d'un torrent, dans le style choisi par le membre (voir lib/tipStyle.ts). */
export function TorrentPreview({ t, style }: { t: any; style?: TipStyle }) {
  const chosen = useTipStyle();
  switch (style ?? chosen) {
    case 'cinema': return <CinemaTip t={t} />;
    case 'classic': return <ClassicTip t={t} />;
    case 'minimal': return <MinimalTip t={t} />;
    default: return <PosterTip t={t} />;
  }
}

/** Infobulle d'un torrent au survol de `children`, dans le style choisi par le membre (ou aucune s'il les a désactivées). */
export function TorrentHover({ id, inline = true, children }: { id: string; inline?: boolean; children: React.ReactNode }) {
  const style = useTipStyle();
  return (
    <HoverCard cacheKey={`torrent:${id}`} inline={inline} load={loadPreview(id)} render={(d: any) => <TorrentPreview t={d} style={style} />} tipClass={`tip-${style}`} disabled={style === 'off'}>
      {children}
    </HoverCard>
  );
}

/**
 * Nom de torrent cliquable, partout sur le site : petite pochette à côté du titre (quand on la connaît)
 * et infobulle complète au survol (chargée à la demande).
 */
export default function TorrentLink({ torrent, thumb = true, children }: {
  torrent: { id: string; name: string; coverImage?: string | null };
  thumb?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <TorrentHover id={torrent.id}>
      <Link to={`/torrents/${torrent.id}`} className="torrent-link">
        {thumb && torrent.coverImage && <img src={torrent.coverImage} alt="" className="torrent-link-thumb" />}
        <span>{children ?? torrent.name}</span>
      </Link>
    </TorrentHover>
  );
}
