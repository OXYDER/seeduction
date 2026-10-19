import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatClock } from '../lib/format';
import HomeSection from './HomeSection';

interface ResumeItem { torrentId: string; title: string; name: string; cover: string | null; fileIndex: number; season: number | null; episode: number | null; positionSeconds: number; durationSeconds: number | null; percent: number | null }
interface NextItem { torrentId: string; title: string; name: string; cover: string | null; season: number; episode: number; afterEpisode: number }

const ep = (s: number | null, e: number | null) => (s != null && e != null ? `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}` : '');

/** Accueil : « Continuer à regarder » (reprendre là où le lecteur Seeduction s'est arrêté) et « Épisode suivant » des séries dont le dernier épisode est terminé. N'affiche rien s'il n'y a rien à reprendre. */
export default function ContinueWatching() {
  const [data, setData] = useState<{ resume: ResumeItem[]; next: NextItem[] } | null>(null);
  const [error, setError] = useState('');
  const [hint, setHint] = useState(false);

  const load = () => api.get('/stream/continue').then((r) => setData(r.data)).catch(() => setData(null));
  useEffect(() => { void load(); }, []);

  async function resume(t: ResumeItem) {
    setError(''); setHint(false);
    try {
      const { data: s } = await api.post('/stream/session', { torrentId: t.torrentId, fileIndex: t.fileIndex });
      window.location.href = `seeduction://stream/${s.token}`;
      window.setTimeout(() => { if (!document.hidden) setHint(true); }, 1500); // le lecteur ne s'est pas ouvert : il n'est sans doute pas installé
    } catch (e: any) { setError(e.response?.data?.message ?? 'Impossible de préparer la lecture'); }
  }
  async function forget(t: ResumeItem) {
    try { await api.delete(`/stream/continue/${t.torrentId}`); setData((d) => d && { ...d, resume: d.resume.filter((x) => x.torrentId !== t.torrentId) }); } catch { /* sans effet */ }
  }

  if (!data || (data.resume.length === 0 && data.next.length === 0)) return null;
  return (
    <HomeSection id="continue" label="Continuer à regarder" icon="▶️">
      <div className="panel" style={{ display: 'grid', gap: 10 }}>
        <div className="panel-title"><span className="title-icon">▶️</span>Continuer à regarder</div>
        {error && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</span>}
        {hint && <span className="muted" style={{ fontSize: 13 }}>Le lecteur Seeduction ne s'est pas ouvert ? <Link to="/player">Installe-le ici</Link>.</span>}
        <div className="cw-rail">
          {data.resume.map((t) => (
            <div key={t.torrentId} className="cw-card">
              <button type="button" className="cw-poster" onClick={() => resume(t)} title="Reprendre dans le lecteur Seeduction" aria-label={`Reprendre ${t.title}`}>
                {t.cover ? <img src={t.cover} alt="" loading="lazy" /> : <span className="cw-noimg">🎬</span>}
                <span className="cw-play" aria-hidden>▶</span>
                {t.percent != null && <span className="cw-bar"><span style={{ width: `${t.percent}%` }} /></span>}
              </button>
              <div className="cw-info">
                <Link to={`/torrents/${t.torrentId}`} title={t.name} className="cw-title">{t.title}</Link>
                <small className="muted">{ep(t.season, t.episode)}{ep(t.season, t.episode) ? ' · ' : ''}à {formatClock(t.positionSeconds)}{t.durationSeconds ? ` / ${formatClock(t.durationSeconds)}` : ''}</small>
              </div>
              <button type="button" className="cw-x" onClick={() => forget(t)} title="Retirer de cette liste" aria-label={`Retirer ${t.title}`}>✕</button>
            </div>
          ))}
          {data.next.map((t) => (
            <div key={t.torrentId} className="cw-card">
              <Link to={`/torrents/${t.torrentId}`} className="cw-poster" title={t.name}>
                {t.cover ? <img src={t.cover} alt="" loading="lazy" /> : <span className="cw-noimg">🎬</span>}
                <span className="cw-badge">Épisode suivant</span>
              </Link>
              <div className="cw-info">
                <Link to={`/torrents/${t.torrentId}`} title={t.name} className="cw-title">{t.title}</Link>
                <small className="muted">{ep(t.season, t.episode)} disponible</small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </HomeSection>
  );
}
