import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROLE_LABEL, formatMinutes } from '../lib/entityLabels';

interface LinkedEntity {
  role: string;
  detail: string | null;
  position: number;
  entity: { id: string; type: string; name: string; imageUrl: string | null };
}

const CREW_ROLES = ['DIRECTOR', 'CREATOR', 'WRITER', 'PRODUCER', 'ARTIST', 'AUTHOR'];
const COMPANY_ROLES = ['STUDIO', 'NETWORK', 'LABEL', 'PUBLISHER', 'DEVELOPER'];
const CHIP_ROLES = ['GENRE', 'PLATFORM'];

const SOURCE_CREDIT: Record<string, string> = {
  tmdb: "Données et images : TMDB. Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.",
  deezer: 'Données : Deezer.',
  rawg: 'Données : RAWG.',
  'google-books': 'Données : Google Books.',
  openlibrary: 'Données : Open Library.',
};

function Thumb({ url, name, w, h }: { url: string | null; name: string; w: number; h: number }) {
  return url
    ? <img src={url} alt="" style={{ width: w, height: h, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
    : <div className="entity-initial" style={{ width: w, height: h }}>{name.slice(0, 1).toUpperCase()}</div>;
}

/**
 * En-tête riche d'un torrent : toutes les infos de sa fiche (durée, note,
 * bande-annonce...) et ses entités liées (genres, équipe, studios, casting).
 * Chaque entité mène à la liste de tous les torrents qui la partagent.
 */
export default function TorrentHero({ torrent }: { torrent: any }) {
  const [showTrailer, setShowTrailer] = useState(false);
  const info = torrent.metadata ?? {};
  const links: LinkedEntity[] = torrent.entities ?? [];
  if (!torrent.metadata && links.length === 0) return null;

  const byRole = (role: string) => links.filter((l) => l.role === role);
  const cast = byRole('ACTOR');

  const facts: string[] = [
    info.releaseDate ?? info.publishedDate ?? info.released,
    info.runtime ? formatMinutes(info.runtime) : null,
    info.rating ? `★ ${Number(info.rating).toFixed(1).replace('.', ',')} / ${torrent.metaSource === 'tmdb' ? 10 : 5}` : null,
    info.metacritic ? `Metacritic ${info.metacritic}` : null,
    info.seasons ? `${info.seasons} saison${info.seasons > 1 ? 's' : ''}` : null,
    info.episodes ? `${info.episodes} épisodes` : null,
    info.nbTracks ? `${info.nbTracks} pistes` : null,
    info.pageCount ? `${info.pageCount} pages` : null,
    info.playtime ? `~${info.playtime} h de jeu` : null,
    info.status,
    info.esrb,
    ...(info.countries ?? []),
    ...(info.languages ?? []),
  ].filter(Boolean);

  const backdrop = info.backdrop as string | undefined;
  const background = backdrop
    ? { backgroundImage: `linear-gradient(rgba(6,13,9,0.82), rgba(6,13,9,0.95)), url(${backdrop})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined;

  return (
    <div className="panel ornate torrent-hero" style={background}>
      {info.tagline && <div style={{ fontStyle: 'italic', color: 'var(--gold-bright)', marginBottom: 8 }}>« {info.tagline} »</div>}
      {info.originalTitle && info.originalTitle !== torrent.name && <div className="muted" style={{ marginBottom: 6 }}>Titre original : {info.originalTitle}</div>}
      {Array.isArray(info.titles) && info.titles.length > 1 && (
        <details style={{ marginBottom: 10 }}>
          <summary className="muted" style={{ cursor: 'pointer' }}>Autres titres ({info.titles.length - 1})</summary>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {info.titles.filter((t: any) => t.title !== torrent.name).map((t: any, i: number) => (
              <span key={i} className="entity-chip">{t.title}{t.lang && <span className="muted" style={{ fontSize: 10 }}>{t.lang}</span>}</span>
            ))}
          </div>
        </details>
      )}

      {facts.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {facts.map((f, i) => <span key={i} className="badge new">{f}</span>)}
        </div>
      )}

      {CHIP_ROLES.map((role) => {
        const items = byRole(role);
        return items.length > 0 && (
          <div key={role} className="hero-line">
            <span className="hero-label">{ROLE_LABEL[role]}</span>
            {items.map((l) => <Link key={l.entity.id} className="entity-chip" to={`/entities/${l.entity.id}`}>{l.entity.name}</Link>)}
          </div>
        );
      })}

      {CREW_ROLES.map((role) => {
        const items = byRole(role);
        return items.length > 0 && (
          <div key={role} className="hero-line">
            <span className="hero-label">{ROLE_LABEL[role]}</span>
            {items.map((l) => (
              <Link key={l.entity.id} className="entity-chip" to={`/entities/${l.entity.id}`}>
                <Thumb url={l.entity.imageUrl} name={l.entity.name} w={24} h={24} />{l.entity.name}
              </Link>
            ))}
          </div>
        );
      })}

      {COMPANY_ROLES.map((role) => {
        const items = byRole(role);
        return items.length > 0 && (
          <div key={role} className="hero-line">
            <span className="hero-label">{ROLE_LABEL[role]}</span>
            {items.map((l) => (
              <Link key={l.entity.id} className="entity-chip" to={`/entities/${l.entity.id}`}>
                {l.entity.imageUrl && <img src={l.entity.imageUrl} alt="" style={{ height: 20, maxWidth: 60, objectFit: 'contain', background: 'rgba(255,255,255,0.85)', padding: 2, borderRadius: 2 }} />}
                {l.entity.name}
              </Link>
            ))}
          </div>
        );
      })}

      {cast.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="hero-label" style={{ marginBottom: 6 }}>Distribution</div>
          <div className="entity-grid">
            {cast.map((l) => (
              <Link key={l.entity.id} to={`/entities/${l.entity.id}`} className="entity-card">
                <Thumb url={l.entity.imageUrl} name={l.entity.name} w={78} h={104} />
                <div className="entity-card-name">{l.entity.name}</div>
                {l.detail && <div className="muted" style={{ fontSize: 11 }}>{l.detail}</div>}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="row" style={{ flexWrap: 'wrap', marginTop: 12 }}>
        {info.trailer?.key && (
          <button type="button" onClick={() => setShowTrailer((v) => !v)}>{showTrailer ? 'Masquer la bande-annonce' : '▶ Bande-annonce'}</button>
        )}
        {info.imdbId && <a href={`https://www.imdb.com/title/${info.imdbId}/`} target="_blank" rel="noopener noreferrer">IMDb ↗</a>}
        {info.website && /^https?:\/\//.test(info.website) && <a href={info.website} target="_blank" rel="noopener noreferrer">Site officiel ↗</a>}
      </div>

      {showTrailer && info.trailer?.key && (
        <div className="trailer-frame">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(info.trailer.key)}?autoplay=1`}
            title="Bande-annonce"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {torrent.metaSource && SOURCE_CREDIT[torrent.metaSource] && (
        <p className="muted" style={{ fontSize: 11, margin: '12px 0 0' }}>{SOURCE_CREDIT[torrent.metaSource]}</p>
      )}
    </div>
  );
}
