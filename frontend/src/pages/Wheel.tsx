import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import { audio, bell, noiseBuffer, playWin, setSoundOn, soundOn, tick } from '../lib/slotSound';
import { useCountdown } from '../components/FreeleechCalendar';
import CoinShower from '../components/CoinShower';
import '../games.css';

interface SegmentV { label: string; points: number; tokens: number; color: string }
interface Reward { points: number; tokens: number; streakBonus: number; total: number }
interface Overview {
  enabled: boolean; blocked: string | null; optOut: boolean; playedToday: boolean; day: string; nextAt: string;
  segments: SegmentV[];
  streak: { current: number; next: number; multiplier: number; spinsToWeekly: number; weeklyBonus: number };
  me: { spins: number; points: number; tokens: number; best: number };
  recent: { day: string; segment: number; points: number; tokens: number; streak: number; streakBonus: number }[];
  biggest: { username: string; points: number; at: string }[];
}
interface SpinResult { segment: number; label: string; reward: Reward; streak: number; streakMultiplier: number; points: number; tokens: number }

const N = 16;
const STEP = 360 / N;
const CX = 200, CY = 200, R_IN = 26, R_OUT = 170;
const BULBS = 24;
const TAU = Math.PI / 180;
const pt = (r: number, deg: number) => `${(CX + r * Math.sin(deg * TAU)).toFixed(2)} ${(CY - r * Math.cos(deg * TAU)).toFixed(2)}`;
/** Secteur de la roue : de l'angle `a0` à `a1` (degrés, dans le sens horaire depuis le haut). */
const sector = (a0: number, a1: number) => `M ${pt(R_IN, a0)} L ${pt(R_OUT, a0)} A ${R_OUT} ${R_OUT} 0 0 1 ${pt(R_OUT, a1)} L ${pt(R_IN, a1)} A ${R_IN} ${R_IN} 0 0 0 ${pt(R_IN, a0)} Z`;
const mod = (n: number, m: number) => ((n % m) + m) % m;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const when = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });
const textOf = (s: SegmentV) => (s.tokens > 0 ? `🎟 ${s.label}` : s.label);

/** Le « clac » d'un secteur qui passe devant la languette. */
function clack() {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const t = a.c.currentTime;
  tick(a, t, 1300 + Math.random() * 400, 0.1, 0.03);
  bell(a, t, 1800 + Math.random() * 300, 0.02, 0.1);
}
/** Le souffle du départ : bruit qui monte puis retombe. */
function whoosh() {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const { c, out } = a, t = c.currentTime + 0.01;
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 1.2);
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.6); f.frequency.exponentialRampToValueAtTime(500, t + 1.1);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
  src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + 1.2);
}
/** Petit roulement de tambour avant le verdict. */
function drumroll() {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const t = a.c.currentTime;
  for (let i = 0; i < 14; i++) tick(a, t + i * 0.045, 220 + i * 25, 0.05 + i * 0.006, 0.05);
}

/** Roue de la fortune : un tour gratuit par jour, des lots fixes, et une série de jours qui améliore les gains. */
export default function Wheel() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [angle, setAngle] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'done'>('idle');
  const [result, setResult] = useState<SpinResult | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  const [shower, setShower] = useState(0);
  const [sound, setSound] = useState(soundOn());
  const pointer = useRef<SVGGElement | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/games/wheel');
      if (!alive.current) return;
      setData(r.data); setError('');
    } catch { setError('Impossible de charger la roue'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const left = useCountdown(data?.playedToday ? data.nextAt : null);

  /** Lance l'animation jusqu'au secteur tiré par le serveur : chaque secteur franchi fait « clac » et sursauter la languette. */
  const animateTo = useCallback((segment: number) => new Promise<void>((resolve) => {
    const from = angle;
    const jitter = (Math.random() - 0.5) * STEP * 0.7;
    const target = -segment * STEP + jitter;
    const turns = reduced() ? 1 : 6;
    const total = turns * 360 + mod(target - from, 360);
    const duration = reduced() ? 1400 : 7200;
    const t0 = performance.now();
    let lastIdx = Math.floor((mod(-from, 360) + STEP / 2) / STEP);
    const frame = (now: number) => {
      if (!alive.current) { resolve(); return; }
      const t = Math.min(1, (now - t0) / duration);
      const a = from + total * easeOut(t);
      setAngle(a);
      const idx = Math.floor((mod(-a, 360) + STEP / 2) / STEP);
      if (idx !== lastIdx) {
        lastIdx = idx; clack();
        try { pointer.current?.animate([{ transform: 'rotate(-26deg)' }, { transform: 'rotate(0deg)' }], { duration: 140, easing: 'ease-out' }); } catch { /* ignoré */ }
      }
      if (t < 1) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  }), [angle]);

  async function spin() {
    if (!data || phase === 'spinning' || data.playedToday || data.blocked) return;
    setError(''); setResult(null); setLit(null); setPhase('spinning');
    try {
      const { data: r } = await api.post('/games/wheel/spin');
      const res = r as SpinResult;
      whoosh();
      await sleep(250);
      const run = animateTo(res.segment);
      await run;
      if (!alive.current) return;
      drumroll();
      await sleep(650);
      if (!alive.current) return;
      setLit(res.segment); setResult(res); setPhase('done'); setShower((n) => n + 1);
      const big = res.reward.total;
      playWin(big >= 500 ? 'mega' : big >= 100 ? 'big' : 'small', Math.max(1, big / 40));
      void load();
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Impossible de tourner la roue');
      setPhase('idle');
      void load();
    }
  }

  const art = useMemo(() => {
    if (!data) return null;
    return data.segments.map((s, i) => {
      const a0 = i * STEP - STEP / 2, a1 = i * STEP + STEP / 2;
      const big = textOf(s).length > 4;
      return (
        <g key={i}>
          <path d={sector(a0, a1)} fill={s.color} stroke="#fff8dc" strokeWidth="1.6" />
          <path d={sector(a0, a1)} fill="url(#wh-shine)" />
          <text transform={`translate(${CX} ${CY}) rotate(${i * STEP - 90})`} x={R_OUT - 12} y="0" textAnchor="end" dominantBaseline="central" className="wh-label" fontSize={big ? 17 : 23}>{textOf(s)}</text>
        </g>
      );
    });
  }, [data]);

  if (!data) return <p className="muted">{error || 'Chargement…'}</p>;
  if (!data.enabled) return <div className="panel"><h1>🎡 Roue de la fortune</h1><p className="muted">La roue est fermée pour le moment.</p></div>;

  const canSpin = !data.playedToday && !data.blocked && phase !== 'spinning';
  const cycle = data.playedToday ? ((data.streak.current - 1) % 7) + 1 : data.streak.current % 7;
  const total = result?.reward.total ?? 0;
  const tier = total >= 500 ? 'mega' : total >= 100 ? 'big' : 'small';
  const winner = lit !== null ? data.segments[lit] : null;

  return (
    <div className="wh-page">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>🎡 Roue de la fortune</h1>
        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          <Link to="/jeux" className="muted">← Jeux</Link>
          <button type="button" className="secondary" onClick={() => { const v = !sound; setSound(v); setSoundOn(v); }} aria-label={sound ? 'Couper le son' : 'Activer le son'}>{sound ? '🔊' : '🔇'}</button>
        </div>
      </div>

      <div className="wh-layout">
        <div className={`wh-stage ${phase === 'spinning' ? 'is-spinning' : ''} ${phase === 'done' ? `is-done is-${tier}` : ''}`}>
          {phase === 'done' && total >= 100 && <div className="wh-beams" aria-hidden="true" />}
          <svg viewBox="0 0 400 400" className="wh-svg" role="img" aria-label="Roue de la fortune">
            <defs>
              <radialGradient id="wh-rim" cx="50%" cy="35%" r="75%"><stop offset="0" stopColor="#ffe9a0" /><stop offset=".5" stopColor="#d99a1f" /><stop offset="1" stopColor="#6b4200" /></radialGradient>
              <radialGradient id="wh-shine" cx="50%" cy="50%" r="60%"><stop offset=".55" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" stopOpacity=".28" /></radialGradient>
              <radialGradient id="wh-hub" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#fff6b0" /><stop offset=".55" stopColor="#f0b323" /><stop offset="1" stopColor="#8a5600" /></radialGradient>
              <linearGradient id="wh-ptr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff6a5a" /><stop offset="1" stopColor="#a30f00" /></linearGradient>
              <filter id="wh-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <circle cx={CX} cy={CY} r="197" fill="url(#wh-rim)" stroke="#3b2400" strokeWidth="3" />
            <circle cx={CX} cy={CY} r="176" fill="#2a1a00" stroke="#fff0a0" strokeWidth="1.5" />
            {Array.from({ length: BULBS }, (_, i) => {
              const a = (i * 360) / BULBS;
              const [x, y] = pt(187, a).split(' ').map(Number);
              return <circle key={i} cx={x} cy={y} r="4.6" className={`wh-bulb ${i % 2 ? 'odd' : 'even'}`} />;
            })}
            <g transform={`rotate(${angle} ${CX} ${CY})`}>
              {art}
              {lit !== null && <path d={sector(lit * STEP - STEP / 2, lit * STEP + STEP / 2)} className="wh-win-glow" filter="url(#wh-glow)" />}
            </g>
            <circle cx={CX} cy={CY} r={R_IN + 6} fill="url(#wh-hub)" stroke="#3b2400" strokeWidth="2.5" />
            <circle cx={CX} cy={CY} r="9" fill="#fff6b0" opacity=".85" />
            {/* languette (en haut) : elle sursaute à chaque secteur qui passe */}
            <g ref={pointer} style={{ transformOrigin: `${CX}px 18px` }}>
              <path d="M 200 52 L 187 14 Q 200 2 213 14 Z" fill="url(#wh-ptr)" stroke="#3b0600" strokeWidth="2" />
              <circle cx="200" cy="18" r="4" fill="#ffd9d2" />
            </g>
          </svg>
          {phase === 'done' && total >= 100 && <CoinShower key={shower} coins={Math.min(120, 30 + Math.floor(total / 6))} items={['🎡', '⭐']} />}
          {phase === 'done' && total < 100 && <CoinShower key={shower} coins={24} />}

          <div className="wh-actions">
            {canSpin && <button type="button" className="wh-spin" onClick={spin}>🎡 Tourner la roue</button>}
            {phase === 'spinning' && <button type="button" className="wh-spin" disabled>Bonne chance…</button>}
            {!canSpin && phase !== 'spinning' && data.playedToday && <div className="wh-wait">Ton tour du jour est joué. Prochain tour gratuit dans <strong>{left ?? '…'}</strong></div>}
            {!canSpin && phase !== 'spinning' && !data.playedToday && data.blocked && <div className="wh-wait" style={{ color: 'var(--danger)' }}>{data.blocked}</div>}
          </div>
          {error && <div style={{ color: 'var(--danger)', textAlign: 'center' }}>{error}</div>}

          {result && winner && phase === 'done' && (
            <div className={`wh-result ${tier}`} role="status">
              <div className="wh-result-title">{tier === 'mega' ? '🏆 GROS LOT !' : tier === 'big' ? '🎉 Superbe tirage !' : '✨ Bravo !'}</div>
              <div className="wh-result-amount">
                {result.reward.total > 0 && <>+{formatNumber(result.reward.total)} <small>points</small></>}
                {result.reward.tokens > 0 && <span className="wh-token">🎟️ +{result.reward.tokens} jeton{result.reward.tokens > 1 ? 's' : ''} freeleech</span>}
              </div>
              <ul className="wh-breakdown">
                {winner.points > 0 && <li>Secteur gagné : {formatNumber(winner.points)} points</li>}
                {result.reward.points > winner.points && <li>🔥 Série de {result.streak} jours : +{Math.round((result.streakMultiplier - 1) * 100)} % ({formatNumber(result.reward.points)} points)</li>}
                {result.reward.streakBonus > 0 && <li>🎁 Bonus de 7 jours de suite : +{formatNumber(result.reward.streakBonus)} points</li>}
                <li className="muted">Ton solde : {formatNumber(result.points)} points</li>
              </ul>
              <div className="muted">Reviens demain pour un autre tour gratuit{data.streak.current > 0 ? ' et garder ta série' : ''} !</div>
            </div>
          )}
        </div>

        <div className="wh-side">
          <div className="panel ornate">
            <h2 style={{ marginTop: 0 }}>🔥 Ta série</h2>
            <div className="wh-week" aria-label={`${data.streak.current} jours de suite`}>
              {Array.from({ length: 7 }, (_, i) => {
                const done = i < cycle;
                return <div key={i} className={`wh-day ${done ? 'done' : ''} ${i === 6 ? 'gift' : ''}`} title={i === 6 ? `Jour 7 : +${data.streak.weeklyBonus} points` : `Jour ${i + 1}`}>{i === 6 ? '🎁' : done ? '✓' : i + 1}</div>;
              })}
            </div>
            <p className="muted" style={{ margin: '10px 0 0', fontSize: 13.5 }}>
              {data.streak.current > 0 ? <>Série en cours : <strong>{data.streak.current} jour{data.streak.current > 1 ? 's' : ''}</strong>. </> : <>Joue chaque jour pour bâtir une série. </>}
              Chaque jour de suite améliore tes gains{data.streak.multiplier > 1 ? <> (<strong>+{Math.round((data.streak.multiplier - 1) * 100)} %</strong> à ton prochain tour)</> : ''}, et le 7<sup>e</sup> jour rapporte <strong>+{data.streak.weeklyBonus} points</strong> en plus.
            </p>
          </div>

          <div className="panel">
            <h2 style={{ marginTop: 0 }}>🎁 Les lots</h2>
            <div className="wh-prizes">
              {[...data.segments].sort((a, b) => (b.points + b.tokens * 300) - (a.points + a.tokens * 300)).map((s, i) => (
                <span key={i} className="wh-chip" style={{ borderColor: s.color }}>{textOf(s)}</span>
              ))}
            </div>
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>Un tour gratuit par jour (heure de Montréal) : rien à miser, rien à perdre. Le tirage est fait par le serveur.</p>
          </div>

          <div className="panel">
            <h2 style={{ marginTop: 0 }}>📜 Mes derniers tours</h2>
            {data.me.spins > 0 && <p className="muted" style={{ margin: '0 0 6px', fontSize: 13 }}>{data.me.spins} tour{data.me.spins > 1 ? 's' : ''} · <span style={{ color: 'var(--green-bright)' }}>+{formatNumber(data.me.points)} points</span>{data.me.tokens > 0 && <> · 🎟️ {data.me.tokens}</>} gagnés au total · meilleur lot : {formatNumber(data.me.best)}</p>}
            {data.recent.length === 0 ? <p className="muted" style={{ margin: 0 }}>Tourne la roue pour ton premier cadeau du jour !</p> : (
              <ul className="wh-recent">
                {data.recent.map((r) => (
                  <li key={r.day}><span>{when(r.day)}</span><strong>+{formatNumber(r.points + r.streakBonus)}{r.tokens > 0 ? ` · 🎟️ ${r.tokens}` : ''}</strong><span className="muted">🔥 {r.streak}</span></li>
                ))}
              </ul>
            )}
          </div>

          {data.biggest.length > 0 && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>🏆 Gros lots de la semaine</h2>
              <ul className="wh-recent">{data.biggest.map((b, i) => <li key={i}><span>{b.username}</span><strong>+{formatNumber(b.points)}</strong></li>)}</ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
