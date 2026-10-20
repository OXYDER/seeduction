import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatClock } from '../lib/format';
import HomeSection from './HomeSection';

interface ResumeItem { torrentId: string; title: string; name: string; cover: string | null; fileIndex: number; season: number | null; episode: number | null; positionSeconds: number; durationSeconds: number | null; percent: number | null; playingNow?: boolean }
interface NextItem { torrentId: string; title: string; name: string; cover: string | null; season: number; episode: number; afterEpisode: number }

const ep = (s: number | null, e: number | null) => (s != null && e != null ? `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}` : '');

/** Accueil : « Continuer à regarder » (reprendre là où le lecteur Seeduction s'est arrêté) et « Épisode suivant » des séries dont le dernier épisode est terminé. N'affiche rien s'il n'y a rien à reprendre. */
export default function ContinueWatching() {
  const [data, setData] = useState<{ resume: ResumeItem[]; next: NextItem[] } | null>(null);
  const [error, setError] = useState('');
  const [hint, setHint] = useState(false);

  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const load = () => api.get('/stream/continue').then((r) => { setData(r.data); setFetchedAt(Date.now()); }).catch(() => setData(null));
  useEffect(() => { void load(); }, []);
  const playing = !!data?.resume.some((t) => t.playingNow);
  // Mise à jour en direct : on réinterroge le serveur toutes les 4 s pendant une lecture (20 s sinon) tant que l'onglet est visible, et le temps avance chaque seconde entre deux réponses.
  useEffect(() => {
    const poll = window.setInterval(() => { if (!document.hidden) void load(); }, playing ? 4000 : 20000);
    const tick = playing ? window.setInterval(() => setNow(Date.now()), 1000) : undefined;
    return () => { window.clearInterval(poll); if (tick) window.clearInterval(tick); };
  }, [playing]);
  const live = (t: ResumeItem) => (t.playingNow ? Math.max(0, Math.floor((now - fetchedAt) / 1000)) : 0);

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
            <div key={t.torrentId} className={t.playingNow ? 'cw-card playing' : 'cw-card'}>
              {t.playingNow ? (
                <Link to={`/torrents/${t.torrentId}`} className="cw-poster" title="Lecture en cours dans le lecteur Seeduction" aria-label={`${t.title} : en cours de lecture`}>
                  {t.cover ? <img src={t.cover} alt="" loading="lazy" /> : <span className="cw-noimg">🎬</span>}
                  <span className="cw-wave" aria-hidden><i /><i /></span>
                  <span className="cw-live"><span className="cw-eq" aria-hidden><b /><b /><b /><b /></span>En cours de lecture</span>
                  {t.durationSeconds ? <span className="cw-bar"><span style={{ width: `${Math.min(99, Math.round(((t.positionSeconds + live(t)) / t.durationSeconds) * 100))}%` }} /></span> : null}
                </Link>
              ) : (
                <button type="button" className="cw-poster" onClick={() => resume(t)} title="Reprendre dans le lecteur Seeduction" aria-label={`Reprendre ${t.title}`}>
                  {t.cover ? <img src={t.cover} alt="" loading="lazy" /> : <span className="cw-noimg">🎬</span>}
                  <span className="cw-play" aria-hidden>▶</span>
                  {t.percent != null && <span className="cw-bar"><span style={{ width: `${t.percent}%` }} /></span>}
                </button>
              )}
              <div className="cw-info">
                <Link to={`/torrents/${t.torrentId}`} title={t.name} className="cw-title">{t.title}</Link>
                <small className={t.playingNow ? 'cw-now' : 'muted'}>{ep(t.season, t.episode)}{ep(t.season, t.episode) ? ' · ' : ''}{t.playingNow ? 'en lecture : ' : 'à '}{formatClock(t.positionSeconds + live(t))}{t.durationSeconds ? ` / ${formatClock(t.durationSeconds)}` : ''}</small>
              </div>
              {!t.playingNow && <button type="button" className="cw-x" onClick={() => forget(t)} title="Retirer de cette liste" aria-label={`Retirer ${t.title}`}>✕</button>}
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
