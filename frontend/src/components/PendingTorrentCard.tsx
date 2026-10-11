import { Link } from 'react-router-dom';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import MetaChips from './MetaChips';
import RejectReason from './RejectReason';
import FileTree from './FileTree';

export interface PendingTorrent {
  id: string; infoHash: string; name: string; size: number; coverImage: string | null; createdAt: string; year: number | null; resolution: string | null;
  language: string | null; source: string | null; codec: string | null; hdr: boolean; audio: string | null; subtitles?: string[]; containerFormat: string | null; season: string | null; episode: string | null;
  releaseDate: string | null; origin: string | null; releaseGroup: string | null; videoType: string | null; durationMinutes: number | null; genres: string[];
  seeders: number; leechers: number; anonymousUpload: boolean; freeleech: boolean; doubleUpload: boolean; openReports: number;
  category: { name: string; path: string; adult: boolean } | null;
  uploader: { id: string; username: string; role: string; uploaded: string; downloaded: string; createdAt: string; ratio: number | null; history: { approved: number; rejected: number; pending: number; other: number } };
  fiche: { source: string; id: string | null; title: string | null; originalTitle: string | null; year: number | null } | null;
  nfo: { present: boolean; length: number; excerpt: string };
  description: { length: number; excerpt: string };
  excerpt: string;
  fileCount: number; files: { path: string; size: number }[]; filesTruncated: boolean;
  duplicates: { id: string; name: string; status: string; why: string; language: string | null; resolution: string | null; source: string | null; season: string | null; episode: string | null; size: number; seeders: number }[];
  sentVia: { via: string; verdict: string | null; learned: boolean } | null;
}

const isOld = (iso: string) => Date.now() - new Date(iso).getTime() > 24 * 3600_000;
const days = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
const ROLES: Record<string, string> = { UPLOADER: 'Uploader', MODERATOR: 'Modérateur', SUPER_MODERATOR: 'Super-modérateur', ADMIN: 'Admin', OWNER: 'Propriétaire' };

function Check({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return <span className={`mod-chk ${ok ? 'ok' : 'warn'}`} title={hint}>{ok ? '✓' : '⚠'} {label}</span>;
}

interface Props {
  t: PendingTorrent;
  compact?: boolean;
  busy?: boolean;
  rejecting?: boolean;
  selected?: boolean;
  onSelect?: (on: boolean) => void;
  onApprove: () => void;
  onToggleReject: () => void;
  onReject: (reason: string) => void;
}

/**
 * Un torrent à valider avec tout ce qu'il faut pour décider sans ouvrir la fiche : étiquettes de la release, contrôles automatiques (pochette, NFO, langue,
 * fiche, seeders...), envoyeur (ancienneté, ratio, historique), doublons possibles, origine de l'envoi, et en dépliant : description, NFO, fichiers.
 */
export default function PendingTorrentCard({ t, compact, busy, rejecting, selected, onSelect, onApprove, onToggleReject, onReject }: Props) {
  const u = t.uploader;
  const newcomer = days(u.createdAt) < 7;
  const lowRatio = u.ratio !== null && u.ratio < 0.5 && Number(u.downloaded) > 5 * 1024 ** 3;
  const bad = u.history.rejected > 0 && u.history.rejected >= u.history.approved;
  const isVideo = !!t.resolution || /film|s[ée]rie|vid[ée]o|anim|document/i.test(t.category?.path ?? '');
  const hasLang = !!t.language;
  const checks = (
    <div className="mod-checks">
      <Check ok={!!t.coverImage} label="Pochette" hint={t.coverImage ? 'Une pochette est enregistrée' : 'Aucune pochette'} />
      <Check ok={t.nfo.present} label="NFO" hint={t.nfo.present ? `NFO / MediaInfo présent (${t.nfo.length} caractères)` : 'Pas de NFO ni de MediaInfo'} />
      {isVideo && <Check ok={hasLang} label={hasLang ? `Langue ${t.language}` : 'Langue manquante'} hint="La langue doit être précisée (VFF, VFQ, MULTI.VF2, VOSTFR...)" />}
      <Check ok={!!t.fiche} label={t.fiche ? 'Fiche' : 'Sans fiche'} hint={t.fiche ? 'Une fiche (TMDB, Deezer...) est rattachée' : 'Aucune fiche rattachée'} />
      <Check ok={t.description.length >= 30} label="Description" hint={`${t.description.length} caractères`} />
      <Check ok={t.seeders > 0} label={t.seeders > 0 ? `${t.seeders} seeder${t.seeders > 1 ? 's' : ''}` : 'Aucun seeder'} hint="Un seeder doit être présent pour approuver" />
      {t.duplicates.length > 0 && <Check ok={false} label={`${t.duplicates.length} doublon${t.duplicates.length > 1 ? 's' : ''} possible${t.duplicates.length > 1 ? 's' : ''}`} hint="Même fiche ou même nom que d'autres torrents" />}
    </div>
  );

  return (
    <article className={`mod-card${isOld(t.createdAt) ? ' old' : ''}${compact ? ' compact' : ''}`}>
      {onSelect && <label className="mod-check"><input type="checkbox" checked={!!selected} onChange={(e) => onSelect(e.target.checked)} aria-label={`Sélectionner ${t.name}`} /></label>}
      <Link to={`/torrents/${t.id}`} className="mod-cover" title="Ouvrir la fiche">{t.coverImage ? <img src={t.coverImage} alt="" loading="lazy" /> : <span>🎬</span>}</Link>
      <div className="mod-body">
        <Link to={`/torrents/${t.id}`} className="mod-title">{t.name}</Link>
        <MetaChips t={t} limit={compact ? 7 : undefined} />
        <div className="mod-meta">
          {[t.category?.path, formatBytes(t.size), t.fileCount ? `${t.fileCount} fichier${t.fileCount > 1 ? 's' : ''}` : null, t.durationMinutes ? `${t.durationMinutes} min` : null, t.releaseGroup ? `team ${t.releaseGroup}` : null].filter(Boolean).join(' · ')}
          {t.category?.adult && <span className="badge double" style={{ marginLeft: 8 }}>🔞 Adulte</span>}
          {t.freeleech && <span className="badge freeleech" style={{ marginLeft: 8 }}>FREELEECH</span>}
          {t.doubleUpload && <span className="badge double" style={{ marginLeft: 8 }}>DOUBLE UPLOAD</span>}
          {t.openReports > 0 && <span className="badge double" style={{ marginLeft: 8 }}>⚠ {t.openReports} signalement{t.openReports > 1 ? 's' : ''}</span>}
        </div>
        {checks}
        <div className="mod-uploader">
          <span>Envoyé par <Link to={`/users/${u.id}`}>{u.username}</Link>{t.anonymousUpload ? ' (anonyme)' : ''}{ROLES[u.role] ? <span className="badge" style={{ marginLeft: 6 }}>{ROLES[u.role]}</span> : null}</span>
          <span className={isOld(t.createdAt) ? 'mod-late' : ''}>· {timeAgo(t.createdAt)}</span>
          <span className={newcomer ? 'mod-flag' : ''}>· inscrit {newcomer ? `depuis ${Math.max(0, days(u.createdAt))} j ⚠` : timeAgo(u.createdAt)}</span>
          <span className={lowRatio ? 'mod-flag' : ''}>· ratio {u.ratio === null ? '∞' : u.ratio.toFixed(2)}{lowRatio ? ' ⚠' : ''}</span>
          <span>· ↑ {formatBytes(u.uploaded)} ↓ {formatBytes(u.downloaded)}</span>
          <span className={bad ? 'mod-flag' : ''}>· envois : {u.history.approved} approuvé{u.history.approved > 1 ? 's' : ''}, {u.history.rejected} rejeté{u.history.rejected > 1 ? 's' : ''}{u.history.pending > 1 ? `, ${u.history.pending} en attente` : ''}</span>
        </div>
        {t.fiche && <div className="mod-meta">🎞️ Fiche {t.fiche.source.toUpperCase()}{t.fiche.title ? ` : ${t.fiche.title}` : ''}{t.fiche.year ? ` (${t.fiche.year})` : ''}{t.fiche.originalTitle && t.fiche.originalTitle !== t.fiche.title ? ` — ${t.fiche.originalTitle}` : ''}</div>}
        {t.sentVia && <div className="mod-meta">📤 Envoyé depuis le client du membre ({t.sentVia.via}){t.sentVia.verdict ? ` — contrôle ${t.sentVia.verdict === 'GREEN' ? '🟢 vert' : '🟠 orange'}` : ''}{t.sentVia.learned ? ' · choix appris des autres membres' : ''}</div>}
        {t.duplicates.length > 0 && (
          <div className="mod-dupes">
            <strong>⚠ Doublons possibles :</strong>
            {t.duplicates.map((d) => (
              <Link key={d.id} to={`/torrents/${d.id}`}>
                {d.name} <span className="muted">({d.why}{d.language ? ` · ${d.language}` : ''}{d.resolution ? ` · ${d.resolution}` : ''}{d.source ? ` · ${d.source}` : ''} · {formatBytes(d.size)}{d.status === 'PENDING' ? ' · aussi en attente' : ''})</span>
              </Link>
            ))}
          </div>
        )}
        {!compact && t.excerpt && <p className="mod-excerpt">{t.excerpt}</p>}
        <details className="mod-details">
          <summary>Détails : description, NFO, fichiers</summary>
          <div className="mod-details-body">
            <div className="mod-meta">Hash : <code>{t.infoHash}</code>{t.genres.length ? ` · Genres : ${t.genres.join(', ')}` : ''}{t.origin ? ` · Origine : ${t.origin}` : ''}{t.releaseDate ? ` · Sortie : ${t.releaseDate}` : ''}{t.videoType ? ` · ${t.videoType}` : ''}{` · ${t.leechers} leecher${t.leechers > 1 ? 's' : ''}`}</div>
            {t.description.excerpt ? <><strong>Description ({t.description.length} caractères)</strong><p className="mod-excerpt" style={{ whiteSpace: 'pre-wrap' }}>{t.description.excerpt}</p></> : <p className="muted">Aucune description.</p>}
            {t.nfo.present ? <><strong>NFO / MediaInfo ({t.nfo.length} caractères)</strong><pre className="mod-nfo">{t.nfo.excerpt}</pre></> : <p className="muted">Pas de NFO.</p>}
            {t.files.length > 0 && (
              <>
                <strong>Fichiers ({t.fileCount})</strong>
                <FileTree files={t.files} truncatedBy={t.filesTruncated ? t.fileCount - t.files.length : 0} />
              </>
            )}
          </div>
        </details>
        {rejecting && <RejectReason busy={!!busy} onCancel={onToggleReject} onConfirm={onReject} />}
      </div>
      <div className="mod-actions">
        <button type="button" disabled={busy} onClick={onApprove}>✓ Approuver</button>
        <button type="button" className="danger" disabled={busy} onClick={onToggleReject}>✕ Rejeter</button>
        <Link to={`/torrents/${t.id}?edit=1`} className="mod-link">✏️ Modifier</Link>
      </div>
    </article>
  );
}
