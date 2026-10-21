import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { api } from '../api/client';

interface LiveState { live: boolean; title: string | null; endsAt: string | null; playbackUrl: string | null; next: { title: string; start: string; end: string }[] }

const when = (iso: string) => new Date(iso).toLocaleString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const until = (iso: string) => new Date(iso).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });

/** Lecteur du direct : l'image apparaît quand une diffusion du calendrier est en cours (la première fois, compte quelques secondes de connexion). */
function Player({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    setProblem('');
    if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = url; return () => { v.removeAttribute('src'); v.load(); }; }
    if (!Hls.isSupported()) { setProblem('Ton navigateur ne peut pas lire ce direct.'); return; }
    // Le relais met quelques secondes à se connecter au premier spectateur : on patiente plus longtemps que d'habitude.
    const hls = new Hls({ liveSyncDurationCount: 3, manifestLoadingTimeOut: 30_000, manifestLoadingMaxRetry: 6, manifestLoadingRetryDelay: 2_000 });
    hls.on(Hls.Events.ERROR, (_e, d) => {
      if (!d.fatal) return;
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else setProblem('La lecture a été interrompue. Recharge la page.');
    });
    hls.loadSource(url);
    hls.attachMedia(v);
    return () => hls.destroy();
  }, [url]);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <video ref={ref} controls autoPlay muted playsInline style={{ width: '100%', maxHeight: '70vh', background: '#000', borderRadius: 10 }} />
      {problem && <p style={{ color: 'var(--danger)', margin: 0 }}>{problem}</p>}
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>La lecture démarre sans le son : clique sur le haut-parleur de la vidéo pour l'activer. Au tout début, la connexion au direct peut prendre quelques secondes.</p>
    </div>
  );
}

export default function Live() {
  const [s, setS] = useState<LiveState | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => api.get('/live').then((r) => { if (alive) { setS(r.data); setErr(false); } }).catch(() => { if (alive) setErr(true); });
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!s) return <p className="muted">{err ? 'Chargement impossible.' : 'Chargement…'}</p>;
  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1>📺 Direct</h1>
      {s.live && s.playbackUrl ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 700 }}>🔴 {s.title}{s.endsAt && <span className="muted" style={{ fontWeight: 400 }}> · jusqu'à {until(s.endsAt)}</span>}</div>
          <Player url={s.playbackUrl} />
        </div>
      ) : (
        <div className="panel" style={{ display: 'grid', gap: 6 }}>
          <strong>⚪ Aucune diffusion en ce moment.</strong>
          <span className="muted">{s.next.length ? 'La prochaine diffusion est indiquée ci-dessous : reviens à ce moment-là, la page se met à jour toute seule.' : 'Aucune diffusion n\'est prévue pour l\'instant.'}</span>
        </div>
      )}
      {s.next.length > 0 && (
        <div className="panel" style={{ display: 'grid', gap: 6 }}>
          <strong>À venir</strong>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{s.next.map((n, i) => <li key={i}><strong>{n.title}</strong> · {when(n.start)} <span className="muted">(jusqu'à {until(n.end)})</span></li>)}</ul>
        </div>
      )}
    </div>
  );
}
