import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import { useFavorites } from '../lib/favorites';
import { resolveContentKind } from '../lib/categoryKind';
import { downloadTorrent } from '../lib/download';
import { VIEW_MODES, type ViewMode } from '../lib/viewMode';
import { CATEGORY_STYLE } from './Layout';
import CategoryTag from './CategoryTag';
import UserLink from './UserLink';
import HoverCard from './HoverCard';
import { TorrentPreview } from './TorrentLink';
import { FavoriteStar, HealthDot } from './TorrentBits';
import WatchOnlineButton from './WatchOnlineButton';

const VIDEO_KINDS = new Set(['FILM', 'SERIE', 'XXX', 'DOCUMENT']);

/** Sélecteur d'affichage (liste / détails / grille / affiches / compact), à mettre dans la barre d'outils d'une liste. */
export function ViewSwitcher({ value, onChange, modes }: { value: ViewMode; onChange: (v: ViewMode) => void; modes?: ViewMode[] }) {
  return (
    <div className="view-toggle" role="group" aria-label="Affichage de la liste">
      {VIEW_MODES.filter((m) => !modes || modes.includes(m.id)).map((m) => (
        <button key={m.id} type="button" className={value === m.id ? 'on' : ''} onClick={() => onChange(m.id)} title={`${m.label} — ${m.hint}`} aria-pressed={value === m.id}>
          <span aria-hidden="true">{m.icon}</span>
          <span className="view-toggle-label">{m.label}</span>
        </button>
      ))}
    </div>
  );
}

export interface TorrentViewProps {
  items: any[];
  view: ViewMode;
  /** Affichage « liste » : en-têtes triables (champ de tri côté serveur) quand `onSort` est fourni. */
  sort?: string;
  order?: 'asc' | 'desc';
  onSort?: (field: string) => void;
  /** À la place de l'étoile « à télécharger plus tard » (ex. un bouton Retirer sur la page des favoris). */
  leading?: (t: any) => ReactNode;
  /** Infos propres à une page (« Mis de côté », « Ajouté par »...) : colonnes en liste, petites lignes ailleurs. */
  extraColumns?: { header: string; render: (t: any) => ReactNode }[];
  /** Boutons supplémentaires à côté de « Visionner » / « Télécharger ». */
  rowActions?: (t: any) => ReactNode;
  hideUploader?: boolean;
  empty?: ReactNode;
}

const COLUMNS: { label: string; sort: string; key: 'cat' | 'name' | 'date' | 'size' | 's' | 'l' | 'up' }[] = [
  { label: 'Catégorie', sort: 'categorie', key: 'cat' },
  { label: 'Nom', sort: 'nom', key: 'name' },
  { label: 'Ajouté', sort: 'date', key: 'date' },
  { label: 'Taille', sort: 'taille', key: 'size' },
  { label: 'S', sort: 'seeders', key: 's' },
  { label: 'L', sort: 'leechers', key: 'l' },
  { label: 'Uploader', sort: 'uploader', key: 'up' },
];

/** Icône / couleur de la catégorie du torrent (la sienne si elle en a une, sinon celle de sa catégorie principale). */
const styleOf = (t: any) => CATEGORY_STYLE[t.category?.slug ?? ''] ?? CATEGORY_STYLE[t.category?.parent?.slug ?? ''];

const metaLine = (t: any) => [t.year, t.origin, t.language, t.source, t.codec, t.audio].filter(Boolean).join(' · ');
const previewLoader = (t: any) => () => api.get(`/torrents/${t.id}/preview`).then((r) => r.data);

function Badges({ t }: { t: any }) {
  return (
    <>
      {t.freeleech && <span className="badge freeleech">FL</span>}{' '}
      {t.doubleUpload && <span className="badge double">2x</span>}{' '}
      {t.resolution && <span className="badge new">{t.resolution}</span>}{' '}
      {t.hdr && <span className="badge double">HDR</span>}
      {t.status === 'DEAD' && <span className="badge" style={{ background: 'rgba(224,90,90,0.2)', color: 'var(--danger)' }}>☠️ Mort</span>}
    </>
  );
}

function Seeds({ t }: { t: any }) {
  return (
    <>
      <HealthDot seeders={t.seeders ?? 0} />
      <span style={{ color: 'var(--success)' }}>{t.seeders ?? 0}</span>
      <span className="muted">&nbsp;/&nbsp;</span>
      <span style={{ color: 'var(--danger)' }}>{t.leechers ?? 0}</span>
    </>
  );
}

function Cover({ t, className }: { t: any; className?: string }) {
  const catStyle = styleOf(t);
  return t.coverImage
    ? <img className={className ?? 'poster'} src={t.coverImage} alt="" loading="lazy" />
    : <div className="poster-fallback">{catStyle?.icon ?? '📦'}</div>;
}

/**
 * La liste de torrents du site, dans l'affichage choisi par le membre (voir lib/viewMode.ts) : un seul composant pour
 * Parcourir, les favoris, les collections, les fiches membres... afin qu'un torrent s'affiche pareil partout.
 * Chaque champ est facultatif : une liste qui n'a pas (encore) tous les détails s'affiche quand même proprement.
 */
export default function TorrentView(props: TorrentViewProps) {
  const { items, view, empty } = props;
  const favorites = useFavorites();
  const isStaff = ['MODERATOR', 'ADMIN', 'OWNER'].includes(useAuthStore((s) => s.user?.role) ?? '');

  const star = (t: any) => props.leading
    ? props.leading(t)
    : favorites.enabled ? <FavoriteStar active={favorites.ids.has(t.id)} onToggle={() => favorites.toggle(t.id)} /> : null;

  const actions = (t: any) => (
    <>
      {VIDEO_KINDS.has(resolveContentKind(t.category, t.category?.parent) ?? '') && t.fileList && <WatchOnlineButton compact torrentId={t.id} fileList={t.fileList} />}
      <button type="button" className="icon-btn icon-btn-sq" title="Télécharger le .torrent" onClick={() => downloadTorrent(t.id, t.name)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" />
        </svg>
      </button>
      {props.rowActions?.(t)}
    </>
  );

  const titleLink = (t: any) => (
    <HoverCard cacheKey={`torrent:${t.id}`} load={previewLoader(t)} render={(d: any) => <TorrentPreview t={d} />}>
      <Link to={`/torrents/${t.id}`}>{t.name}</Link>
    </HoverCard>
  );

  const extras = (t: any) => props.extraColumns?.map((c) => (
    <span key={c.header} className="tv-extra"><span className="muted">{c.header} :</span> {c.render(t)}</span>
  ));

  if (items.length === 0) return <div className="muted tv-empty">{empty ?? 'Aucun résultat.'}</div>;

  // ------------------------------------------------------------------ liste (tableau)
  if (view === 'list') {
    const cols = COLUMNS.filter((c) => !(c.key === 'up' && props.hideUploader));
    return (
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.sort}
                  className={props.onSort ? `sortable${props.sort === c.sort ? ' sorted' : ''}` : undefined}
                  onClick={props.onSort ? () => props.onSort!(c.sort) : undefined}
                  title={props.onSort ? `Trier par ${c.label.toLowerCase()}` : undefined}
                  // Toutes les colonnes sauf « Nom » se réduisent à leur contenu : « Nom » absorbe l'espace restant.
                  style={c.key === 'name' ? undefined : { width: '1%', whiteSpace: 'nowrap' }}
                >
                  {c.label}{props.onSort && <span className="sort-arrow">{props.sort === c.sort ? (props.order === 'asc' ? '▲' : '▼') : '⇅'}</span>}
                </th>
              ))}
              {props.extraColumns?.map((c) => <th key={c.header} style={{ width: '1%', whiteSpace: 'nowrap' }}>{c.header}</th>)}
              <th style={{ width: '1%', whiteSpace: 'nowrap' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => {
              const catStyle = styleOf(t);
              return (
                <tr key={t.id}>
                  <td className="cat-cell" style={{ whiteSpace: 'nowrap' }}>
                    {t.category?.imageUrl
                      ? <img src={t.category.imageUrl} alt={t.category.name} title={t.category.name} style={{ height: 22, maxWidth: 80, objectFit: 'contain' }} />
                      : <CategoryTag category={t.category} />}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      {star(t)}
                      {t.coverImage
                        ? <img src={t.coverImage} alt="" style={{ width: 32, height: 44, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                        : <span className="category-swatch" style={{ background: `${(catStyle?.color ?? '#e0b84a')}26` }}>{catStyle?.icon ?? '📦'}</span>}
                      <span>
                        {isStaff && <Link to={`/torrents/${t.id}?edit=1`} title="Modifier / supprimer (staff)" style={{ marginRight: 6 }}>✏️</Link>}
                        {titleLink(t)}{' '}
                        <Badges t={t} />
                        {metaLine(t) && <div className="muted" style={{ fontSize: 11 }}>{metaLine(t)}</div>}
                        {t.reason && <div className="tv-reason">✨ {t.reason}</div>}
                      </span>
                    </div>
                  </td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{t.createdAt ? timeAgo(t.createdAt) : ''}</td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatBytes(t.size)}</td>
                  <td style={{ color: 'var(--success)', whiteSpace: 'nowrap' }}><HealthDot seeders={t.seeders ?? 0} />{t.seeders ?? 0}</td>
                  <td style={{ color: 'var(--danger)' }}>{t.leechers ?? 0}</td>
                  {!props.hideUploader && <td className="muted">{t.anonymousUpload ? 'Anonyme' : t.uploader ? <UserLink user={t.uploader} /> : '—'}</td>}
                  {props.extraColumns?.map((c) => <td key={c.header} className="muted" style={{ whiteSpace: 'nowrap' }}>{c.render(t)}</td>)}
                  <td style={{ whiteSpace: 'nowrap' }}><div className="row" style={{ gap: 4 }}>{actions(t)}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // ------------------------------------------------------------------ détails (grandes lignes)
  if (view === 'details') {
    return (
      <div className="tv-details">
        {items.map((t) => (
          <article key={t.id} className="tv-detail-card">
            <Link to={`/torrents/${t.id}`} className="tv-detail-poster" tabIndex={-1} aria-hidden="true"><Cover t={t} /></Link>
            <div className="tv-detail-main">
              <div className="tv-detail-title">{star(t)}{titleLink(t)}</div>
              <div className="tv-detail-badges"><CategoryTag category={t.category} /> <Badges t={t} /></div>
              {metaLine(t) && <div className="muted">{metaLine(t)}</div>}
              {t.synopsis && <p className="tv-detail-synopsis">{t.synopsis}</p>}
              {t.reason && <div className="tv-reason">✨ {t.reason}</div>}
              <div className="muted tv-detail-foot">
                {!props.hideUploader && <>{t.anonymousUpload ? 'Anonyme' : t.uploader ? <UserLink user={t.uploader} /> : null}{(t.anonymousUpload || t.uploader) && t.createdAt ? ' · ' : ''}</>}
                {t.createdAt && timeAgo(t.createdAt)}
                {extras(t)}
              </div>
            </div>
            <div className="tv-detail-side">
              <div className="tv-detail-stats"><Seeds t={t} /></div>
              <div className="muted">{formatBytes(t.size)}</div>
              <div className="row" style={{ gap: 4 }}>{actions(t)}</div>
            </div>
          </article>
        ))}
      </div>
    );
  }

  // ------------------------------------------------------------------ compact (une ligne fine)
  if (view === 'compact') {
    return (
      <div className="tv-compact">
        {items.map((t) => {
          return (
            <div key={t.id} className="tv-compact-row">
              <span className="tv-compact-lead">{star(t)}</span>
              <span className="tv-compact-icon" title={t.category?.name}>{styleOf(t)?.icon || '📦'}</span>
              <span className="tv-compact-name">{titleLink(t)}</span>
              <span className="tv-compact-badges"><Badges t={t} /></span>
              {extras(t)}
              <span className="muted tv-compact-size">{formatBytes(t.size)}</span>
              <span className="tv-compact-seeds"><Seeds t={t} /></span>
              <span className="muted tv-compact-age">{t.createdAt ? timeAgo(t.createdAt) : ''}</span>
              <span className="row tv-compact-actions" style={{ gap: 4 }}>{actions(t)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  // ------------------------------------------------------------------ grille (cartes) / affiches (images seules)
  const postersOnly = view === 'posters';
  return (
    <div className={`poster-grid ${postersOnly ? 'tv-posters' : 'tv-grid'}`}>
      {items.map((t) => (
        <HoverCard key={t.id} cacheKey={`torrent:${t.id}`} inline={false} load={previewLoader(t)} render={(d: any) => <TorrentPreview t={d} />}>
          <Link to={`/torrents/${t.id}`} className="poster-card">
            <Cover t={t} />
            <div className="poster-badges">
              <CategoryTag category={t.category} />
              {t.freeleech && <span className="badge freeleech">FL</span>}
              {t.doubleUpload && <span className="badge double">2x</span>}
              {t.resolution && <span className="badge new">{t.resolution}</span>}
            </div>
            {favorites.enabled && !props.leading && (
              <div className="poster-fav"><FavoriteStar active={favorites.ids.has(t.id)} onToggle={() => favorites.toggle(t.id)} /></div>
            )}
            {props.leading && <div className="poster-fav">{props.leading(t)}</div>}
            <div className="poster-body">
              <div className="poster-title">{t.name}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center' }}>
                <Seeds t={t} />
                <span style={{ marginLeft: 'auto' }}>{formatBytes(t.size)}</span>
              </div>
              {t.reason && <div className="tv-reason tv-reason-card">✨ {t.reason}</div>}
              {extras(t)}
            </div>
          </Link>
        </HoverCard>
      ))}
    </div>
  );
}
