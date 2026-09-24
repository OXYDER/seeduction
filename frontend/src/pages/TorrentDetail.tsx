import { useEffect, useState } from 'react';
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

export default function TorrentDetail() {
  const { id } = useParams();
  const justUploaded = (useLocation().state as { justUploaded?: boolean } | null)?.justUploaded;
  const [torrent, setTorrent] = useState<any>(null);
  const [loadError, setLoadError] = useState('');
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

  return (
    <div className="grid">
      {justUploaded && (
        <div className="panel ornate">
          <strong>✅ Torrent envoyé — en attente d'approbation du staff.</strong>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Seeduction a nettoyé ton fichier : trackers externes retirés, torrent marqué privé. L'empreinte du torrent a changé,
            donc <strong>télécharge-le ci-dessous depuis Seeduction</strong> (il contient ton announce avec ta passkey) et ajoute-le
            à ton client pour le seeder — ton fichier .torrent d'origine ne fonctionnera pas ici.
          </p>
        </div>
      )}
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
      {isStaff && (
        <StaffTorrentPanel key={torrent.id} torrent={torrent} startOpen={searchParams.get('edit') === '1'} onSaved={(patch) => setTorrent((t: any) => ({ ...t, ...patch }))} />
      )}
      <TorrentHero torrent={torrent} />
      {torrent.metaSource === 'tmdb' && (
        <TorrentRelated torrentId={torrent.id} seriesTitle={torrent.metadata?.originalTitle ?? torrent.name} />
      )}
      <div className="panel grid">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="muted">Catégorie : {torrent.category?.name}</div>
            <div className="muted">Uploader : {torrent.anonymousUpload ? 'Anonyme' : <UserLink user={torrent.uploader} />}</div>
            <div className="muted"><HealthDot seeders={torrent.seeders} />Seeders {torrent.seeders} / Leechers {torrent.leechers} / Complétés {torrent.completedCount}</div>
          </div>
          {user && (
            <div className="row" style={{ gap: 8, position: 'relative' }}>
              <button onClick={download}>⬇ Télécharger le .torrent</button>
              <TorrentSocial torrentId={torrent.id} seeders={torrent.seeders} isUploader={torrent.uploader?.id === user.id} />
              {!torrent.freeleech && (tokenUntil
                ? <span className="badge freeleech" title="Jeton freeleech actif">🎟️ Freeleech pour toi jusqu'au {new Date(tokenUntil).toLocaleDateString('fr-FR')}</span>
                : <button className="secondary" onClick={spendToken} title="Son téléchargement ne compte pas dans ton ratio pendant 7 jours">🎟️ Utiliser un jeton</button>)}
              <button className="secondary" onClick={() => setAddOpen((v) => !v)}>📚 Ajouter à une collection</button>
              {torrent.uploader?.id !== user.id && <ReportButton targetType="torrent" targetId={torrent.id} />}
              {addOpen && (
                <div className="panel ornate" style={{ position: 'absolute', right: 0, top: '110%', width: 260, zIndex: 30, padding: 10 }}>
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
          )}
        </div>
        {torrent.description && (
          <div className="bbcode-content" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(torrent.description) }} />
        )}
      </div>
      {tokenMsg && <div className="muted" style={{ color: 'var(--danger)' }}>{tokenMsg} — <a href="/bonus">boutique bonus</a></div>}
      <TorrentComments torrentId={torrent.id} />
      <div className="panel">
        <h3>Fichiers</h3>
        <table>
          <tbody>
            {(torrent.fileList ?? []).map((f: any, i: number) => (
              <tr key={i}><td>{f.path}</td><td className="muted">{f.size} o</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
