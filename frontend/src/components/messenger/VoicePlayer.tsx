import { useEffect, useRef, useState } from 'react';

const SPEEDS = [1, 1.5, 2];
const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Lecteur d'un message vocal : lecture/pause, barre cliquable, vitesse x1 / x1,5 / x2. */
export default function VoicePlayer({ src, durationMs }: { src: string; durationMs?: number | null }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState(false);
  const total = durationMs && durationMs > 0 ? durationMs : 0;

  // Un seul vocal à la fois : en lancer un arrête les autres.
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onPlay = () => window.dispatchEvent(new CustomEvent('msgr-voice-play', { detail: el }));
    const stopOthers = (e: Event) => { if ((e as CustomEvent).detail !== el) el.pause(); };
    el.addEventListener('play', onPlay);
    window.addEventListener('msgr-voice-play', stopOthers);
    return () => { el.removeEventListener('play', onPlay); window.removeEventListener('msgr-voice-play', stopOthers); };
  }, []);

  function toggle() {
    const el = audio.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => setFailed(true)); else el.pause();
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const el = audio.current;
    if (!el || !total) return;
    const r = e.currentTarget.getBoundingClientRect();
    el.currentTime = (Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * total) / 1000;
  }

  const shown = playing || pos > 0 ? pos : total;
  return (
    <div className="msgr-voice-player">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setPos(0); }}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime * 1000)}
        onError={() => setFailed(true)}
      />
      <button type="button" className="msgr-voice-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Écouter'}>{playing ? '❚❚' : '▶'}</button>
      <div className="msgr-voice-bar" onClick={seek} role="slider" aria-label="Position" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.round(pos)}>
        <div style={{ width: `${total ? Math.min(100, (pos / total) * 100) : 0}%` }} />
      </div>
      <span className="msgr-voice-time">{failed ? '⚠️' : fmt(shown)}</span>
      <button
        type="button"
        className="msgr-voice-speed"
        title="Vitesse de lecture"
        onClick={() => {
          const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
          setSpeed(next);
          if (audio.current) audio.current.playbackRate = next;
        }}
      >{speed === 1 ? '1x' : `${speed}x`.replace('.', ',')}</button>
    </div>
  );
}
