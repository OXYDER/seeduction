import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import type { Skin } from '../lib/slotSkins';
import { playBonus, playSpin, playStop, playTick, playWin, setSoundOn, soundOn } from '../lib/slotSound';
import { EventSprite } from './EventDecor';

export interface SlotGame { strips: number[][]; paylines: number[][]; payThree: number[]; payTwo: number; step: number; rtp: number; hitRate: number; maxMultiple: number }
export interface SlotConfig { minStake: number; maxStake: number; dailyLossMax: number; maxWin: number; dailyFree: { enabled: boolean; stake: number; maxWin: number } }
export interface SlotMe { points: number; donated: number; stakeable: number; blocked: string | null; lossToday: number; lossLeft: number | null; dailyFreeAvailable: boolean }
interface Round { stops: number[]; grid: number[][]; lines: { line: number; mult: number }[]; mult: number; win: number; free: boolean }
interface Result { win: number; tier: 'none' | 'small' | 'big' | 'mega'; freeSpins: number; rounds: Round[]; points: number; stakeable: number; daily: boolean; stake: number }
interface Reel { strip: number[]; y: number; anim: boolean; dur: number }

const STAKES = [5, 10, 25, 50, 100];
const LINE_COLORS = ['#ffd24a', '#4ad6ff', '#ff6a8a', '#8aff6a', '#c08aff'];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
const column = (strip: number[], stop: number) => [strip[(stop - 1 + strip.length) % strip.length], strip[stop], strip[(stop + 1) % strip.length]];
const rand = (n: number) => Math.floor(Math.random() * n);

function Sym({ skin, id }: { skin: Skin; id: number }) {
  return <svg viewBox="0 0 64 64" className="slot-sym" aria-hidden="true" dangerouslySetInnerHTML={{ __html: skin.art[id] }} />;
}

/** Pluie d'objets du thème lors d'un gros gain. */
function Rain({ items }: { items: string[] }) {
  const drops = useMemo(() => Array.from({ length: 28 }, (_, i) => ({ k: i, e: items[i % items.length], x: rand(100), d: 1.6 + Math.random() * 1.6, s: 18 + rand(22), w: Math.random() * 0.6 })), [items]);
  return <div className="slot-rain" aria-hidden="true">{drops.map((d) => <span key={d.k} style={{ left: `${d.x}%`, fontSize: d.s, animationDuration: `${d.d}s`, animationDelay: `${d.w}s` }}>{d.e}</span>)}</div>;
}

/** La machine : le serveur tire au sort, cette vue ne fait qu'animer le résultat reçu. */
export default function SlotMachine({ skin, machine, game, config, me, event, onUpdate, onDone }: {
  skin: Skin; machine: string; game: SlotGame; config: SlotConfig; me: SlotMe; event: boolean;
  onUpdate: (patch: { points: number; stakeable: number; dailyFreeAvailable?: boolean }) => void; onDone: () => void;
}) {
  const [stake, setStake] = useState(() => (config.minStake <= 10 && config.maxStake >= 10 ? 10 : config.minStake));
  const [reels, setReels] = useState<Reel[]>(() => game.strips.map((s) => ({ strip: column(s, rand(s.length)), y: 0, anim: false, dur: 0 })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [winLines, setWinLines] = useState<Round['lines']>([]);
  const [banner, setBanner] = useState<{ text: string; tier: string } | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const [points, setPoints] = useState(me.points);
  const [rain, setRain] = useState(0);
  const [sound, setSound] = useState(soundOn());
  const [session, setSession] = useState({ start: 0, wagered: 0, won: 0 });
  const [remind, setRemind] = useState(false);
  const [paytable, setPaytable] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!busy) setPoints(me.points); }, [me.points, busy]);
  useEffect(() => {
    if (!session.start) return;
    const t = setTimeout(() => setRemind(true), 20 * 60_000 - (Date.now() - session.start));
    return () => clearTimeout(t);
  }, [session.start]);

  const stakes = STAKES.filter((s) => s >= config.minStake && s <= config.maxStake);
  const canPay = me.stakeable >= stake && !me.blocked && (me.lossLeft === null || me.lossLeft >= stake);

  const cells = useMemo(() => {
    const set = new Set<string>();
    for (const l of winLines) game.paylines[l.line].forEach((row, reel) => set.add(`${reel}:${row}`));
    return set;
  }, [winLines, game.paylines]);

  async function animate(grid: number[][], fast: boolean) {
    setWinLines([]);
    setReels((prev) => prev.map((r, i) => ({ strip: [...r.strip.slice(-3), ...Array.from({ length: (fast ? 8 : 14) + i * (fast ? 3 : 5) }, () => rand(8)), ...grid[i]], y: 0, anim: false, dur: 0 })));
    await frame();
    const durs = [0, 1, 2].map((i) => (fast ? 550 : 1000) + i * (fast ? 180 : 360));
    setReels((prev) => prev.map((r, i) => ({ ...r, y: ((r.strip.length - 3) / r.strip.length) * 100, anim: true, dur: durs[i] })));
    durs.forEach((d, i) => setTimeout(() => playStop(i), d));
    await sleep(durs[2] + 60);
    if (!alive.current) return;
    setReels(grid.map((col) => ({ strip: col, y: 0, anim: false, dur: 0 })));
  }

  async function countUp(total: number) {
    const t0 = performance.now(), dur = Math.min(1600, 500 + total * 6);
    let lastTick = 0;
    while (alive.current) {
      const k = Math.min(1, (performance.now() - t0) / dur);
      setShown(Math.round(total * (1 - (1 - k) * (1 - k))));
      if (performance.now() - lastTick > 90 && k < 1) { playTick(); lastTick = performance.now(); }
      if (k >= 1) break;
      await frame();
    }
    setShown(total);
  }

  async function spin(daily: boolean) {
    if (busy) return;
    setError(''); setBanner(null); setShown(null); setRain(0); setWinLines([]);
    setBusy(true);
    let res: Result;
    try {
      res = (await api.post('/games/slots/spin', { machine, stake, daily })).data;
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Tour impossible');
      setBusy(false);
      return;
    }
    const cost = daily ? 0 : res.stake;
    setPoints((p) => p - cost);
    setSession((s) => ({ start: s.start || Date.now(), wagered: s.wagered + cost, won: s.won }));
    playSpin();
    let running = 0;
    for (let i = 0; i < res.rounds.length; i++) {
      const r = res.rounds[i];
      if (i > 0) setBanner({ text: `Tour gratuit ${i} / ${res.freeSpins}`, tier: 'free' });
      await animate(r.grid, i > 0);
      if (!alive.current) return;
      setWinLines(r.lines);
      if (i === 0 && res.freeSpins > 0) { playBonus(); setBanner({ text: `BONUS ! ${res.freeSpins} tours gratuits`, tier: 'bonus' }); await sleep(1600); }
      running += r.win;
      if (r.win > 0) { if (i > 0 || res.freeSpins === 0) playWin('small'); setShown(running); await sleep(i > 0 ? 900 : 1200); } else await sleep(i > 0 ? 450 : 250);
    }
    if (!alive.current) return;
    if (res.win > 0) {
      setBanner({ text: res.tier === 'mega' ? 'MÉGA GAIN !' : res.tier === 'big' ? 'GROS GAIN !' : res.win >= res.stake ? 'Gagné !' : 'Petit retour', tier: res.tier });
      if (res.tier !== 'small') { playWin(res.tier as 'big' | 'mega'); setRain((n) => n + 1); }
      await countUp(res.win);
    } else {
      setBanner({ text: 'Pas cette fois…', tier: 'none' });
    }
    setSession((s) => ({ ...s, won: s.won + res.win }));
    setPoints(res.points);
    onUpdate({ points: res.points, stakeable: res.stakeable, ...(daily ? { dailyFreeAvailable: false } : {}) });
    setBusy(false);
    onDone();
  }

  const tile = (reel: number, symbol: number, i: number, rows: number) => {
    const hit = rows === 3 && cells.has(`${reel}:${i}`);
    return <div key={i} className={`slot-tile${hit ? ' win' : ''}`} style={{ height: `${100 / rows}%` }}><Sym skin={skin} id={symbol} /></div>;
  };

  return (
    <div className="slot" style={skin.vars as React.CSSProperties}>
      {event && <EventSprite />}
      <div className="slot-head">
        <div><strong className="slot-title">{skin.icon} {skin.name}</strong><div className="slot-tag">{skin.tagline}</div></div>
        <div className="slot-head-r">
          <button type="button" className="slot-mini" onClick={() => { const v = !sound; setSound(v); setSoundOn(v); }} title={sound ? 'Couper le son' : 'Activer le son'} aria-pressed={sound}>{sound ? '🔊' : '🔇'}</button>
          <button type="button" className="slot-mini" onClick={() => setPaytable((v) => !v)} aria-expanded={paytable}>Gains</button>
        </div>
      </div>

      <div className="slot-window">
        <div className="slot-reels">
          {reels.map((r, ri) => (
            <div key={ri} className="slot-reel">
              <div className="slot-strip" style={{ height: `${(r.strip.length / 3) * 100}%`, transform: `translateY(-${r.y}%)`, transition: r.anim ? `transform ${r.dur}ms cubic-bezier(.15,.75,.25,1)` : 'none' }}>
                {r.strip.map((s, i) => tile(ri, s, i, r.strip.length))}
              </div>
            </div>
          ))}
        </div>
        {winLines.length > 0 ? (
          <svg className="slot-lines" viewBox="0 0 300 300" preserveAspectRatio="none" aria-hidden="true">
            {winLines.map((l) => <polyline key={l.line} points={game.paylines[l.line].map((row, i) => `${50 + i * 100},${50 + row * 100}`).join(' ')} fill="none" stroke={LINE_COLORS[l.line % 5]} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />)}
          </svg>
        ) : null}
        {banner && <div className={`slot-banner ${banner.tier}`} role="status">{banner.text}{shown !== null && shown > 0 && banner.tier !== 'free' && banner.tier !== 'bonus' ? <strong> +{formatNumber(shown)}</strong> : null}</div>}
        {rain > 0 && <Rain key={rain} items={skin.rain} />}
      </div>

      <div className="slot-status" aria-live="polite">
        {busy && shown !== null && shown > 0 ? <span>Gain en cours : <strong>+{formatNumber(shown)}</strong> points</span> : <span>Mise totale <strong>{stake}</strong> points · 5 lignes de {stake / 5}</span>}
        <span className="slot-points">Solde : <strong>{formatNumber(points)}</strong></span>
      </div>

      <div className="slot-controls">
        <div className="slot-stakes" role="group" aria-label="Mise">
          {stakes.map((s) => <button key={s} type="button" className={`slot-chip${stake === s ? ' on' : ''}`} disabled={busy} onClick={() => setStake(s)}>{s}</button>)}
        </div>
        <button type="button" className="slot-spin" disabled={busy || !canPay} onClick={() => spin(false)}>{busy ? '…' : `TOURNER · ${stake}`}</button>
        {me.dailyFreeAvailable && <button type="button" className="slot-free" disabled={busy || !!me.blocked} onClick={() => spin(true)}>🎁 Tour gratuit du jour</button>}
      </div>

      {error && <div className="slot-error">{error}</div>}
      {me.blocked && <div className="slot-error">{me.blocked}</div>}
      {!me.blocked && me.stakeable < stake && !me.dailyFreeAvailable && <div className="slot-note">Points misables insuffisants{me.donated > 0 ? ' (les points de don ne se misent pas)' : ''}.</div>}
      <div className="slot-note">
        Retour théorique au joueur : {game.rtp} % · le site garde le reste à long terme · gagner n'est jamais garanti.
        {me.lossLeft !== null && <> Perte maximale aujourd'hui : encore {formatNumber(me.lossLeft)} points.</>}
      </div>
      {remind && <div className="slot-remind">⏰ Tu joues depuis plus de 20 minutes ({formatNumber(session.wagered)} points misés, {formatNumber(session.won)} gagnés). Une petite pause ? <button type="button" className="slot-mini" onClick={() => setRemind(false)}>OK</button></div>}

      {paytable && (
        <div className="slot-pay">
          <div className="muted" style={{ marginBottom: 6 }}>Trois symboles identiques sur une ligne (le joker remplace un symbole) pour une mise de {stake} points :</div>
          <div className="slot-pay-grid">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="slot-pay-row"><Sym skin={skin} id={i} /><span>{skin.names[i]}</span><strong>{formatNumber((game.payThree[i] * stake) / game.step)}</strong></div>)}
            <div className="slot-pay-row"><Sym skin={skin} id={6} /><span>{skin.names[6]}</span><span className="muted">remplace tout</span></div>
            <div className="slot-pay-row"><Sym skin={skin} id={7} /><span>{skin.names[7]}</span><span className="muted">3 ou plus : 5 tours gratuits</span></div>
          </div>
          <div className="muted" style={{ marginTop: 6, fontSize: 12.5 }}>Deux {skin.names[5].toLowerCase()} à gauche : petit gain de {formatNumber((game.payTwo * stake) / game.step)}. Les 5 lignes : 3 horizontales et 2 diagonales ; les gains de toutes les lignes s'additionnent. Gain maximal par partie : {formatNumber(config.maxWin)} points.</div>
        </div>
      )}
    </div>
  );
}
