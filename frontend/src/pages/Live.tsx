import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Hls from 'hls.js';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import LiveCalendar, { CalendarView, LiveEvent } from '../components/LiveCalendar';
import LiveStage from '../components/LiveRoom';
import { countdown, hm, longDate } from '../lib/liveTime';

interface Upcoming { title: string; description: string | null; posterUrl: string | null; color: string | null; start: string; end: string }
interface PageCfg {
  showPlayerWhenOff: boolean; showCountdown: boolean; countdownSeconds: boolean;
  offlineTitle: string; offlineMessage: string; endedTitle: string; endedMessage: string; endedMinutes: number; noneMessage: string;
  posterUrl: string; showCalendar: boolean; calendarView: CalendarView; weekStartsMonday: boolean; horizonDays: number; showPast: boolean;
  showUpcomingList: boolean; upcomingCount: number; showEndTime: boolean; showDescription: boolean; showPlayerButton: boolean; startMuted: boolean;
  todayColor: string; eventColor: string; liveColor: string; banner: string;
}
interface LiveState {
  live: boolean; title: string | null; description: string | null; startedAt: string | null; endsAt: string | null; playbackUrl: string | null;
  ended: { title: string; end: string } | null; next: Upcoming[]; events: LiveEvent[]; timezone: string; serverTime: string; page: PageCfg;
}

/** L'heure, corrigée de l'écart avec l'horloge du serveur, rafraîchie chaque seconde (compte à rebours). */
function useNow(skew: number) {
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => { setNow(Date.now() + skew); const t = setInterval(() => setNow(Date.now() + skew), 1000); return () => clearInterval(t); }, [skew]);
  return now;
}

/** Lecteur du direct : l'image apparaît quand une diffusion du calendrier est en cours (la première fois, compte quelques secondes de connexion). */
function Player({ url, muted, overlay }: { url: string; muted: boolean; overlay?: ReactNode }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    setProblem('');
    // Les navigateurs bloquent la lecture automatique avec le son : si « démarrer sans le son » est désactivé et que le navigateur refuse,
    // on se rabat sur une lecture muette plutôt que de laisser l'image figée.
    v.muted = muted;
    const tryPlay = () => { v.play().catch(() => { v.muted = true; void v.play().catch(() => undefined); }); };
    v.addEventListener('loadedmetadata', tryPlay, { once: true });
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
  }, [url, muted]);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {/* Le plein écran est celui de la scène (lecteur + chat + réactions) : on retire celui du lecteur. */}
      <div style={{ position: 'relative' }}>
        <video ref={ref} controls controlsList="nofullscreen" autoPlay muted={muted} playsInline style={{ width: '100%', maxHeight: '70vh', background: '#000', borderRadius: 10, display: 'block' }} />
        {overlay}
      </div>
      {problem && <p style={{ color: 'var(--danger)', margin: 0 }}>{problem}</p>}
      <p className="muted live-hint" style={{ margin: 0, fontSize: 12.5 }}>
        {muted ? 'La lecture démarre sans le son : clique sur le haut-parleur de la vidéo pour l\'activer. ' : ''}Au tout début, la connexion au direct peut prendre quelques secondes.
      </p>
    </div>
  );
}

/** Écran du lecteur hors diffusion : la prochaine diffusion avec son compte à rebours, ou « Diffusion terminée » juste après la fin. */
function OffAir({ s, now }: { s: LiveState; now: number }) {
  const { page, timezone: tz } = s;
  const next = s.next[0] ?? null;
  const poster = next?.posterUrl || page.posterUrl;
  const left = next ? new Date(next.start).getTime() - now : 0;
  return (
    <div style={{
      width: '100%', borderRadius: 10, overflow: 'hidden', background: '#000',
      backgroundImage: poster ? `url("${poster.replace(/"/g, '%22')}")` : undefined, backgroundSize: 'cover', backgroundPosition: 'center',
    }}>
      {/* Hauteur d'un écran 16:9 sur grand écran ; sur téléphone, elle grandit avec le texte plutôt que de le couper. */}
      <div style={{ minHeight: 'min(56.25vw, 70vh)', boxSizing: 'border-box', background: poster ? 'rgba(0,0,0,0.62)' : 'radial-gradient(circle at center, var(--bg-panel-raised), #000)', display: 'grid', placeItems: 'center', padding: '28px 16px', textAlign: 'center', color: '#fff' }}>
        <div style={{ display: 'grid', gap: 8, maxWidth: 640, justifyItems: 'center' }}>
          {s.ended ? (
            <>
              <span style={{ fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.8 }}>⏹ {page.endedTitle}</span>
              <strong style={{ fontSize: 'clamp(16px, 3.5vw, 26px)' }}>{s.ended.title}</strong>
              {page.endedMessage && <span style={{ opacity: 0.85 }}>{page.endedMessage}</span>}
            </>
          ) : (
            <>
              <span style={{ fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.8 }}>⚪ {page.offlineTitle}</span>
              {page.offlineMessage && next && <span style={{ opacity: 0.85, fontSize: 14 }}>{page.offlineMessage}</span>}
            </>
          )}
          {next ? (
            <div style={{ display: 'grid', gap: 4, marginTop: 8, justifyItems: 'center' }}>
              <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.7 }}>Prochaine diffusion</span>
              <strong style={{ fontSize: 'clamp(18px, 4vw, 30px)' }}>{next.title}</strong>
              <span>{longDate(next.start, tz)} · {hm(next.start, tz)}{page.showEndTime ? ` – ${hm(next.end, tz)}` : ''}</span>
              {page.showDescription && next.description && <span style={{ opacity: 0.8, fontSize: 14, whiteSpace: 'pre-line' }}>{next.description}</span>}
              {page.showCountdown && (
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 'clamp(26px, 7vw, 54px)', color: page.todayColor, marginTop: 4 }}>
                  {left > 0 ? countdown(left, page.countdownSeconds) : 'Ça commence…'}
                </span>
              )}
            </div>
          ) : (
            <span style={{ opacity: 0.85 }}>{page.noneMessage}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Ouvre le direct dans le lecteur Seeduction (VLC) : son et image d'origine, sans conversion sur le relais. */
function OpenInPlayer() {
  const [state, setState] = useState<'idle' | 'opening' | 'hint'>('idle');
  const [error, setError] = useState('');
  async function open() {
    setError('');
    try {
      const { data } = await api.post('/live/player');
      setState('opening');
      window.location.href = `seeduction://live/${data.token}`;
      // Même astuce que la fiche torrent : si la page garde le focus, le lecteur n'est probablement pas installé.
      window.setTimeout(() => setState(document.hidden ? 'idle' : 'hint'), 1500);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Impossible d'ouvrir le lecteur.");
    }
  }
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={open} title="Le lecteur Seeduction lit le son et l'image d'origine, même quand le navigateur ne peut pas">🖥️ Ouvrir dans le lecteur Seeduction</button>
        <span className="muted" style={{ fontSize: 12.5 }}>Pas de son ici ? Le lecteur lit tous les formats.</span>
      </div>
      {error && <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
      {state === 'hint' && (
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Rien ne s'est ouvert ? Le lecteur n'est peut-être pas installé sur ce PC : <Link to="/player">comment l'installer</Link>.</p>
      )}
    </div>
  );
}

export default function Live() {
  const [s, setS] = useState<LiveState | null>(null);
  const [err, setErr] = useState(false);
  const [skew, setSkew] = useState(0);
  const load = useCallback(() => api.get('/live').then((r) => {
    setS(r.data);
    setErr(false);
    if (r.data.serverTime) setSkew(new Date(r.data.serverTime).getTime() - Date.now());
  }).catch(() => setErr(true)), []);

  useEffect(() => {
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const now = useNow(skew);

  // Aux moments charnières (début de la prochaine diffusion, fin de celle en cours, fin de l'écran « terminée »), on recharge tout de suite
  // plutôt que d'attendre le prochain rafraîchissement de 30 secondes.
  const boundary = s
    ? Math.min(...[
      s.next[0] ? new Date(s.next[0].start).getTime() : Infinity,
      s.endsAt ? new Date(s.endsAt).getTime() : Infinity,
      s.ended ? new Date(s.ended.end).getTime() + s.page.endedMinutes * 60_000 : Infinity,
    ])
    : Infinity;
  const crossed = Number.isFinite(boundary) && now >= boundary;
  useEffect(() => { if (crossed) void load(); }, [crossed, load]);

  if (!s) return <p className="muted">{err ? 'Chargement impossible.' : 'Chargement…'}</p>;
  const { page, timezone: tz } = s;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1>📺 Canadiens en direct</h1>
      {page.banner && <div className="panel" style={{ whiteSpace: 'pre-line' }}>{page.banner}</div>}

      {s.live && s.playbackUrl ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 700 }}>
            <span style={{ color: page.liveColor }}>🔴 EN DIRECT</span> · {s.title}
            {page.showEndTime && s.endsAt && <span className="muted" style={{ fontWeight: 400 }}> · jusqu'à {hm(s.endsAt, tz)}</span>}
          </div>
          {page.showDescription && s.description && <div className="muted" style={{ whiteSpace: 'pre-line' }}>{s.description}</div>}
          <LiveStage>{(overlay) => <Player url={s.playbackUrl!} muted={page.startMuted} overlay={overlay} />}</LiveStage>
          {page.showPlayerButton && <OpenInPlayer />}
        </div>
      ) : page.showPlayerWhenOff ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <OffAir s={s} now={now} />
        </div>
      ) : (
        <div className="panel" style={{ display: 'grid', gap: 6 }}>
          <strong>{s.ended ? `⏹ ${page.endedTitle} : ${s.ended.title}` : `⚪ ${page.offlineTitle}`}</strong>
          <span className="muted">{s.next.length ? page.offlineMessage : page.noneMessage}</span>
        </div>
      )}

      {page.showCalendar && (
        <LiveCalendar
          events={s.events}
          tz={tz}
          now={now}
          view={page.calendarView}
          mondayFirst={page.weekStartsMonday}
          showEndTime={page.showEndTime}
          colors={{ today: page.todayColor, event: page.eventColor, live: page.liveColor }}
        />
      )}

      {page.showUpcomingList && s.next.length > 0 && (
        <div className="panel" style={{ display: 'grid', gap: 6 }}>
          <strong>À venir</strong>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {s.next.map((n, i) => (
              <li key={i}>
                <strong>{n.title}</strong> · <span>{longDate(n.start, tz)}</span> à {hm(n.start, tz)}
                {page.showEndTime && <span className="muted"> (jusqu'à {hm(n.end, tz)})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
