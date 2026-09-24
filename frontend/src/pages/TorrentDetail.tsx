import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import UserLink from '../components/UserLink';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import StaffTorrentPanel from '../components/StaffTorrentPanel';
import TorrentComments from '../components/TorrentComments';
import TorrentSocial from '../components/TorrentSocial';
import ReportButton from '../components/ReportButton';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { bbcodeToHtml } from '../lib/bbcode';
import TorrentHero from '../components/TorrentHero';
import TorrentRelated from '../components/TorrentRelated';
import { FavoriteStar, HealthDot } from '../components/TorrentBits';
import { useFavorites } from '../lib/favorites';
import { usePageBackdrop } from '../lib/backdrop';
import { useTheme } from '../lib/theme';
import { formatBytes } from '../lib/format';

export default function TorrentDetail() {
  const { id } = useParams();
  const justUploaded = (useLocation().state as { justUploaded?: boolean } | null)?.justUploaded;
  const [torrent, setTorrent] = useState<any>(null);
  const [loadError, setLoadError] = useState('');
  const theme = useTheme();
  const [tab, setTab] = useState<'overview' | 'files' | 'comments' | 'related'>('overview');
  const [trailerOpen, setTrailerOpen] = useState(false);
  usePageBackdrop(torrent ? (torrent.metadata?.backdrop ?? torrent.coverImage ?? null) : null);
  const user = useAuthStore((s) => s.user);
  const favorites = useFavorites();
  const [searchParams] = useSearchParams();
  const isStaff = ['MODERATOR', 'ADMIN', 'OWNER'].includes(user?.role ?? '');
  const [myCollections, setMyCollections] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set());
  const [tokenUntil, setTokenUntil] = useState<string | null>(null);
  const [tokenMsg, setTokenMsg] = useState('');

  useEffect(() => {
    setLoadError('');
    api.get(`/torrents/${id}`).then((r) => setTorrent(r.data)).catch((err) => setLoadError(err.response?.data?.message ?? 'Torrent introuvable'));
  }, [id]);

  useEffect(() => {
    if (!user || !id) return;
    api.get(`/bonus/token/${id}`).then((r) => setTokenUntil(r.data.activeUntil)).catch(() => {});
  }, [user, id]);

  async function spendToken() {
    setTokenMsg('');
    try {
      const { data } = await api.post(`/bonus/token/${id}`);
      setTokenUntil(data.expiresAt);
    } catch (err: any) {
      setTokenMsg(err.response?.data?.message ?? 'Impossible d\'utiliser un jeton');
    }
  }

  useEffect(() => {
    if (!user) return;
    api.get('/collections/mine').then((r) => setMyCollections(r.data)).catch(() => {});
  }, [user]);

  async function addToCollection(collectionId: string) {
    await api.post(`/collections/${collectionId}/items`, { torrentId: id });
    setAddedTo((prev) => new Set(prev).add(collectionId));
  }

  async function download() {
    const res = await api.get(`/torrents/${id}/download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${torrent.name}.torrent`;
    a.click();
  }

  if (loadError) {
    return (
      <div className="panel">
        <p>{loadError}</p>
        <Link to="/profile"><button type="button">Aller à mon profil</button></Link>{' '}
        <Link to="/browse" className="muted">← Retour à Parcourir</Link>
      </div>
    );
  }
  if (!torrent) return <p className="muted">Chargement...</p>;

  const meta = [
    torrent.year, torrent.resolution, torrent.hdr ? 'HDR' : null, torrent.codec,
    torrent.audio, torrent.source, torrent.containerFormat, torrent.language,
    torrent.fps ? `${torrent.fps} fps` : null,
    torrent.durationMinutes ? `${torrent.durationMinutes} min` : null,
  ].filter(Boolean);

  const synopsis: string | null = torrent.metadata?.overview ?? null;

  const uploadedBanner = justUploaded && (
    <div className="panel ornate">
      <strong>✅ Torrent envoyé — en attente d'approbation du staff.</strong>
      <p className="muted" style={{ margin: '6px 0 0' }}>
        Seeduction a nettoyé ton fichier : trackers externes retirés, torrent marqué privé. L'empreinte du torrent a changé,
        donc <strong>télécharge-le ci-dessous depuis Seeduction</strong> (il contient ton announce avec ta passkey) et ajoute-le
        à ton client pour le seeder — ton fichier .torrent d'origine ne fonctionnera pas ici.
      </p>
    </div>
  );

  // Boutons d'action (télécharger, merci, jeton, collection, signaler) : les mêmes dans les deux mises en page.
  const actions = user && (
    <div className="row" style={{ gap: 8, position: 'relative', flexWrap: 'wrap' }}>
      <button onClick={download} className="download-btn">⬇ Télécharger le .torrent</button>
      <TorrentSocial torrentId={torrent.id} seeders={torrent.seeders} isUploader={torrent.uploader?.id === user.id} />
      {!torrent.freeleech && (tokenUntil
        ? <span className="badge freeleech" title="Jeton freeleech actif">🎟️ Freeleech pour toi jusqu'au {new Date(tokenUntil).toLocaleDateString('fr-FR')}</span>
        : <button className="secondary" onClick={spendToken} title="Son téléchargement ne compte pas dans ton ratio pendant 7 jours">🎟️ Utiliser un jeton</button>)}
      <button className="secondary" onClick={() => setAddOpen((v) => !v)}>📚 Collection</button>
      {torrent.uploader?.id !== user.id && <ReportButton targetType="torrent" targetId={torrent.id} />}
      {addOpen && (
        <div className="panel ornate" style={{ position: 'absolute', left: 0, top: '110%', width: 260, zIndex: 30, padding: 10, background: 'var(--bg-panel-raised)' }}>
          {myCollections.length === 0 && <p className="muted" style={{ margin: 0 }}>Crée d'abord une collection.</p>}
          {myCollections.map((c) => (
            <button
              key={c.id}
              className="secondary"
              style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4 }}
              disabled={addedTo.has(c.id)}
              onClick={() => addToCollection(c.id)}
            >
              {addedTo.has(c.id) ? '✓ ' : ''}{c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const staffPanel = isStaff && (
    <StaffTorrentPanel key={torrent.id} torrent={torrent} startOpen={searchParams.get('edit') === '1'} onSaved={(patch) => setTorrent((t: any) => ({ ...t, ...patch }))} />
  );

  const descriptionPanel = torrent.description && (
    <div className="panel">
      <div className="bbcode-content" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(torrent.description) }} />
    </div>
  );

  const filesPanel = (
    <div className="panel">
      <h3>Fichiers</h3>
      <table>
        <tbody>
          {(torrent.fileList ?? []).map((f: any, i: number) => (
            <tr key={i}><td>{f.path}</td><td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatBytes(f.size)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const tokenError = tokenMsg && <div className="muted" style={{ color: 'var(--danger)' }}>{tokenMsg} — <a href="/bonus">boutique bonus</a></div>;

  // ---- Thème Prestige : page façon plateforme (grande affiche, actions, onglets) ----
  if (theme === 'prestige') {
    const hasRelated = torrent.metaSource === 'tmdb';
    const tabs = [
      { id: 'overview', label: 'Aperçu' },
      { id: 'files', label: `Fichiers${torrent.fileList?.length ? ` (${torrent.fileList.length})` : ''}` },
      { id: 'comments', label: 'Commentaires' },
      ...(hasRelated ? [{ id: 'related', label: 'Saga & épisodes' }] : []),
    ] as { id: typeof tab; label: string }[];

    return (
      <div className="detail-plex">
        {uploadedBanner}
        <section className="detail-head">
          <div className="detail-poster">
            {torrent.coverImage ? <img src={torrent.coverImage} alt="" /> : <div className="poster-fallback">🎬</div>}
          </div>
          <div className="detail-info">
            <div className="hero-kicker">{torrent.category?.name}{torrent.status === 'PENDING' ? ' · en attente de validation' : ''}{torrent.status === 'DEAD' ? ' · ☠️ mort' : ''}</div>
            <h1>{torrent.name}</h1>
            <div className="hero-meta">{meta.join('  ·  ')}</div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {torrent.freeleech && <span className="badge freeleech">FREELEECH</span>}
              {torrent.doubleUpload && <span className="badge double">DOUBLE UPLOAD</span>}
              {torrent.metadata?.tagline && <span className="muted" style={{ fontStyle: 'italic' }}>« {torrent.metadata.tagline} »</span>}
            </div>
            {synopsis && <p className="hero-synopsis">{synopsis}</p>}
            <div className="detail-stats">
              <span><HealthDot seeders={torrent.seeders} /><strong>{torrent.seeders}</strong> seeders</span>
              <span><strong>{torrent.leechers}</strong> leechers</span>
              <span><strong>{torrent.completedCount}</strong> complétés</span>
              <span><strong>{formatBytes(torrent.size)}</strong></span>
              <span>par {torrent.anonymousUpload ? 'Anonyme' : <UserLink user={torrent.uploader} />}</span>
            </div>
            <div className="detail-actions">
              {torrent.metadata?.trailer?.key && (
                <button type="button" className="secondary" onClick={() => setTrailerOpen(true)}>▶ Bande-annonce</button>
              )}
              {actions}
              {favorites.enabled && (
                <button type="button" className="secondary" onClick={() => favorites.toggle(torrent.id)}>
                  {favorites.ids.has(torrent.id) ? '★ Dans ma liste' : '☆ Ma liste'}
                </button>
              )}
            </div>
            {tokenError}
          </div>
        </section>

        {trailerOpen && torrent.metadata?.trailer?.key && createPortal(
          <div className="trailer-modal" onClick={() => setTrailerOpen(false)}>
            <button type="button" className="secondary trailer-close" onClick={() => setTrailerOpen(false)}>✕ Fermer</button>
            <div className="trailer-modal-inner" onClick={(e) => e.stopPropagation()}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(torrent.metadata.trailer.key)}?autoplay=1&rel=0`}
                title="Bande-annonce"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        ,
          document.body,
        )}

        {staffPanel}

        <nav className="tabs" aria-label="Sections du torrent">
          {tabs.map((t) => <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </nav>

        {tab === 'overview' && (
          <div className="grid" style={{ gap: 18 }}>
            <TorrentHero torrent={torrent} />
            {descriptionPanel}
          </div>
        )}
        {tab === 'files' && filesPanel}
        {tab === 'comments' && <TorrentComments torrentId={torrent.id} />}
        {tab === 'related' && hasRelated && <TorrentRelated torrentId={torrent.id} seriesTitle={torrent.metadata?.originalTitle ?? torrent.name} />}
      </div>
    );
  }

  return (
    <div className="grid">
      {uploadedBanner}
      <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        {torrent.coverImage && (
          <img src={torrent.coverImage} alt="" style={{ width: 100, height: 140, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
        )}
        <div>
          <h1>
            {favorites.enabled && <FavoriteStar active={favorites.ids.has(torrent.id)} onToggle={() => favorites.toggle(torrent.id)} size={26} />}
            {torrent.name}
          </h1>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {torrent.freeleech && <span className="badge freeleech">FREELEECH</span>}
            {torrent.doubleUpload && <span className="badge double">DOUBLE UPLOAD</span>}
            {meta.map((m, i) => <span key={i} className="badge new">{m}</span>)}
          </div>
        </div>
      </div>
      {staffPanel}
      <TorrentHero torrent={torrent} />
      {torrent.metaSource === 'tmdb' && (
        <TorrentRelated torrentId={torrent.id} seriesTitle={torrent.metadata?.originalTitle ?? torrent.name} />
      )}
      <div className="panel grid">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <div className="muted">Catégorie : {torrent.category?.name}</div>
            <div className="muted">Uploader : {torrent.anonymousUpload ? 'Anonyme' : <UserLink user={torrent.uploader} />}</div>
            <div className="muted"><HealthDot seeders={torrent.seeders} />Seeders {torrent.seeders} / Leechers {torrent.leechers} / Complétés {torrent.completedCount}</div>
          </div>
          {actions}
        </div>
        {torrent.description && (
          <div className="bbcode-content" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(torrent.description) }} />
        )}
      </div>
      {tokenError}
      <TorrentComments torrentId={torrent.id} />
      {filesPanel}
    </div>
  );
}
