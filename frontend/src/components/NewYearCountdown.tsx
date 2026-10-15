import { useEffect, useMemo, useState } from 'react';
import { useEventTheme } from '../store/eventTheme';

const COLORS = ['#ff5c8a', '#ffd54a', '#4aa8ff', '#7bdc7b', '#a78bfa', '#fb923c', '#fff'];

/** Pluie de confettis à minuit pile (une fois, quelques secondes). */
function Burst() {
  const pieces = useMemo(() => Array.from({ length: 80 }, (_, i) => {
    const a = Math.random() * Math.PI * 2, d = 160 + Math.random() * 420;
    return { i, style: { '--x': `${Math.round(Math.cos(a) * d)}px`, '--y': `${Math.round(Math.sin(a) * d * 0.8 + 260)}px`, '--r': `${Math.round(Math.random() * 900 - 450)}deg`, '--c': COLORS[i % COLORS.length], animationDelay: `${(Math.random() * 0.25).toFixed(2)}s`, animationDuration: `${(2 + Math.random() * 1.6).toFixed(2)}s` } as React.CSSProperties };
  }), []);
  return <div className="ev-burst" aria-hidden="true">{pieces.map((p) => <i key={p.i} style={p.style} />)}</div>;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Compte à rebours du Jour de l'An : une pastille en haut de l'écran à partir de quelques semaines avant (réglable par l'administration), les dix dernières
 * secondes en grand au milieu de l'écran, puis « Bonne année ! » et des confettis à minuit pile. Tout le monde compte vers le même instant (celui du serveur).
 */
export default function NewYearCountdown() {
  const ny = useEventTheme((s) => s.server?.newYear ?? null);
  const mode = useEventTheme((s) => s.mode);
  const [now, setNow] = useState(() => Date.now());
  const target = ny ? new Date(ny.at).getTime() : 0;
  const left = target - now;
  const visible = !!ny && mode !== 'off' && left <= ny.daysBefore * 86400_000 && left > -90_000;

  useEffect(() => {
    if (!ny || mode === 'off') return;
    const t = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, left < 3600_000 ? 250 : 1000);
    return () => clearInterval(t);
  }, [ny, mode, left < 3600_000]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible || !ny) return null;
  const animated = mode === 'full';
  if (left <= 0) {
    return (
      <>
        <span className="ev-ny-pill done" title="Bonne année !">🎆 Bonne année {ny.year} !</span>
        {animated && left > -12_000 && <Burst key={ny.at} />}
      </>
    );
  }
  const secs = Math.ceil(left / 1000);
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  const label = d >= 1 ? `${d} j ${pad(h)} h ${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
  return (
    <>
      <span className="ev-ny-pill" title={`Minuit : bonne année ${ny.year} !`}>🎆 {ny.year} dans <strong>{label}</strong></span>
      {animated && secs <= 10 && <div key={secs} className="ev-count-big" aria-hidden="true">{secs}</div>}
    </>
  );
}
