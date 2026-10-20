import Nick from './Nick';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import type { Skin } from '../lib/slotSkins';
import { playBonus, playLever, playSpin, playStop, playTick, playWin, setSoundOn, soundOn } from '../lib/slotSound';
import { EventSprite } from './EventDecor';

export interface SlotGame { strips: number[][]; paylines: number[][]; payThree: number[]; payPair: number[]; freeMult: number; step: number }
export interface Jackpot { enabled: boolean; pool: number; minStake: number; last: { username: string; amount: number; at: string } | null }
export interface SlotConfig { minStake: number; maxStake: number; dailyLossMax: number; maxWin: number; dailyFree: { enabled: boolean; stake: number; maxWin: number } }
export interface SlotMe { points: number; donated: number; stakeable: number; blocked: string | null; lossToday: number; lossLeft: number | null; dailyFreeAvailable: boolean }
interface Round { stops: number[]; grid: number[][]; lines: { line: number; mult: number; jackpot?: boolean }[]; mult: number; win: number; free: boolean }
interface Result { win: number; tier: 'none' | 'small' | 'big' | 'mega'; freeSpins: number; rounds: Round[]; points: number; stakeable: number; daily: boolean; stake: number; jackpot: { amount: number } | null; poolAfter: number }
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

/** Pièce d'or qui tourne en tombant. */
function Coin({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <defs><radialGradient id="slcg" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#fff6b0" /><stop offset="0.5" stopColor="#f5c02a" /><stop offset="1" stopColor="#a86a00" /></radialGradient></defs>
      <circle cx="16" cy="16" r="14.5" fill="url(#slcg)" stroke="#8a5600" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="#fff0a0" strokeWidth="1.2" opacity=".8" />
      <path d="M16 9l2 4.6 5 .5-3.8 3.3 1.2 4.9L16 19.7l-4.4 2.6 1.2-4.9L9 14.1l5-.5z" fill="#fff0a0" opacity=".9" />
    </svg>
  );
}

/** Déluge de pièces d'or (gros gains) et d'objets du thème (méga gain). */
function Shower({ coins, items }: { coins: number; items?: string[] }) {
  const drops = useMemo(() => Array.from({ length: coins }, (_, i) => ({
    k: i, x: rand(100), d: 1.5 + Math.random() * 1.7, w: Math.random() * 0.9, s: 18 + rand(20), flip: 0.5 + Math.random() * 0.7, emoji: items && i % 3 === 0 ? items[i % items.length] : null,
  })), [coins, items]);
  return (
    <div className="slot-rain" aria-hidden="true">
      {drops.map((d) => (
        <span key={d.k} style={{ left: `${d.x}%`, animationDuration: `${d.d}s`, animationDelay: `${d.w}s`, ['--flip' as any]: `${d.flip}s`, fontSize: d.s }}>
          {d.emoji ?? <Coin size={d.s} />}
        </span>
      ))}
    </div>
  );
}

/** Ampoules qui courent autour de la fenêtre (rondes, de la taille réelle du cabinet). */
function Bulbs({ w, h }: { w: number; h: number }) {
  if (w < 40 || h < 40) return null;
  const inset = 8;
  return (
    <svg className="slot-bulbs" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <rect x={inset} y={inset} width={w - inset * 2} height={h - inset * 2} rx="26" className="b-base" />
      <rect x={inset} y={inset} width={w - inset * 2} height={h - inset * 2} rx="26" className="b-lit b1" />
      <rect x={inset} y={inset} width={w - inset * 2} height={h - inset * 2} rx="26" className="b-lit b2" />
    </svg>
  );
}

/** La machine : le serveur tire au sort, cette vue ne fait qu'animer le résultat reçu. */
export default function SlotMachine({ skin, machine, game, config, me, event, jackpot, onUpdate, onDone }: {
  skin: Skin; machine: string; game: SlotGame; config: SlotConfig; me: SlotMe; event: boolean; jackpot?: Jackpot | null;
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
  const [shower, setShower] = useState<{ n: number; coins: number; mega: boolean }>({ n: 0, coins: 0, mega: false });
  const [fx, setFx] = useState<'idle' | 'spin' | 'small' | 'big' | 'mega' | 'bonus'>('idle');
  const [pull, setPull] = useState(false);
  const [sound, setSound] = useState(soundOn());
  const [session, setSession] = useState({ start: 0, wagered: 0, won: 0 });
  const [remind, setRemind] = useState(false);
  const [paytable, setPaytable] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pool, setPool] = useState(jackpot?.pool ?? 0);
  const [jackpotWin, setJackpotWin] = useState<number | null>(null);
  useEffect(() => { setPool(jackpot?.pool ?? 0); }, [jackpot?.pool]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!busy) setPoints(me.points); }, [me.points, busy]);
  useEffect(() => {
    if (!session.start) return;
    const t = setTimeout(() => setRemind(true), 20 * 60_000 - (Date.now() - session.start));
    return () => clearTimeout(t);
  }, [session.start]);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setSize({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    const t0 = performance.now(), dur = Math.min(1800, 600 + total * 5);
    let lastTick = 0;
    while (alive.current) {
      const k = Math.min(1, (performance.now() - t0) / dur);
      setShown(Math.round(total * (1 - (1 - k) * (1 - k))));
      if (performance.now() - lastTick > 85 && k < 1) { playTick(); lastTick = performance.now(); }
      if (k >= 1) break;
      await frame();
    }
    setShown(total);
  }

  async function spin(daily: boolean) {
    if (busy) return;
    setError(''); setBanner(null); setShown(null); setWinLines([]); setFx('spin'); setJackpotWin(null);
    setBusy(true);
    setPull(true); playLever(); setTimeout(() => setPull(false), 650);
    let res: Result;
    try {
      res = (await api.post('/games/slots/spin', { machine, stake, daily })).data;
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Tour impossible');
      setBusy(false); setFx('idle');
      return;
    }
    const cost = daily ? 0 : res.stake;
    setPoints((p) => p - cost);
    setSession((s) => ({ start: s.start || Date.now(), wagered: s.wagered + cost, won: s.won }));
    playSpin(1900);
    let running = 0;
    for (let i = 0; i < res.rounds.length; i++) {
      const r = res.rounds[i];
      if (i > 0) { setFx('bonus'); setBanner({ text: `Tour gratuit ${i} / ${res.freeSpins} · gains ×${game.freeMult}`, tier: 'free' }); }
      await animate(r.grid, i > 0);
      if (!alive.current) return;
      setWinLines(r.lines);
      if (i === 0 && res.freeSpins > 0) { setFx('bonus'); playBonus(); setBanner({ text: `BONUS ! ${res.freeSpins} tours gratuits · gains ×${game.freeMult}`, tier: 'bonus' }); await sleep(1800); }
      running += r.win;
      if (r.win > 0) { if (i > 0 || res.freeSpins === 0) playWin('small', r.win / res.stake); setShown(running); await sleep(i > 0 ? 900 : 1200); } else await sleep(i > 0 ? 450 : 250);
    }
    if (!alive.current) return;
    if (res.jackpot) {
      // GROS LOT : célébration complète
      setJackpotWin(res.jackpot.amount); setFx('mega');
      setBanner({ text: 'GROS LOT !!!', tier: 'jackpot' });
      playWin('mega'); setTimeout(() => playWin('mega'), 1800); setTimeout(() => playBonus(), 900);
      setShower((s) => ({ n: s.n + 1, coins: 90, mega: true }));
      await countUp(res.win);
      await sleep(2600);
    } else if (res.win > 0) {
      setFx(res.tier === 'none' ? 'small' : res.tier);
      setBanner({ text: res.tier === 'mega' ? 'MÉGA GAIN !' : res.tier === 'big' ? 'GROS GAIN !' : res.win >= res.stake ? 'Gagné !' : 'Petit retour', tier: res.tier });
      if (res.tier === 'big' || res.tier === 'mega') { playWin(res.tier); setShower((s) => ({ n: s.n + 1, coins: res.tier === 'mega' ? 46 : 24, mega: res.tier === 'mega' })); }
      await countUp(res.win);
      await sleep(res.tier === 'mega' ? 1600 : 700);
    } else {
      setBanner({ text: 'Pas cette fois…', tier: 'none' });
    }
    setSession((s) => ({ ...s, won: s.won + res.win }));
    setPoints(res.points); setPool(res.poolAfter); setJackpotWin(null);
    onUpdate({ points: res.points, stakeable: res.stakeable, ...(daily ? { dailyFreeAvailable: false } : {}) });
    setBusy(false); setFx('idle');
    onDone();
  }

  const tile = (reel: number, symbol: number, i: number, rows: number) => {
    const hit = rows === 3 && cells.has(`${reel}:${i}`);
    return <div key={i} className={`slot-tile${hit ? ' win' : ''}`} style={{ height: `${100 / rows}%` }}><Sym skin={skin} id={symbol} /></div>;
  };
  const preview = [0, 1, 2, 3, 4].map((i) => i);

  return (
    <div className={`slot fx-${fx}${pull ? ' pulled' : ''}`} style={skin.vars as React.CSSProperties}>
      {event && <EventSprite />}
      <div className="slot-beams" aria-hidden="true"><i /><i /></div>

      <div className="slot-sign">
        <div className="slot-sign-icons" aria-hidden="true">{preview.map((i) => <span key={i}><Sym skin={skin} id={i} /></span>)}</div>
        <div className="slot-sign-text">
          <strong className="slot-title">{skin.icon} {skin.name}</strong>
          <div className="slot-tag">{skin.tagline}</div>
        </div>
        {jackpot?.enabled && (
          <div className={`slot-jackpot${jackpotWin ? ' won' : ''}`} title={`Trois meilleurs symboles alignés (sans joker) avec une mise de ${jackpot.minStake} points ou plus`}>
            <span className="slot-jackpot-l">GROS LOT</span>
            <strong className="slot-jackpot-v">{formatNumber(pool)}</strong>
          </div>
        )}
        <div className="slot-head-r">
          <button type="button" className="slot-mini" onClick={() => { const v = !sound; setSound(v); setSoundOn(v); }} title={sound ? 'Couper le son' : 'Activer le son'} aria-pressed={sound}>{sound ? '🔊' : '🔇'}</button>
          <button type="button" className="slot-mini" onClick={() => setPaytable((v) => !v)} aria-expanded={paytable}>Gains</button>
        </div>
      </div>

      <div className="slot-cabinet">
        <div className="slot-body" ref={bodyRef}>
          <Bulbs w={size.w} h={size.h} />
          <div className="slot-window">
            <div className="slot-reels">
              {reels.map((r, ri) => (
                <div key={ri} className="slot-reel">
                  <div className={`slot-strip${r.anim ? ' spinning' : ''}`} style={{ height: `${(r.strip.length / 3) * 100}%`, transform: `translateY(-${r.y}%)`, transition: r.anim ? `transform ${r.dur}ms cubic-bezier(.15,.75,.25,1)` : 'none', ['--dur' as any]: `${r.dur}ms` }}>
                    {r.strip.map((s, i) => tile(ri, s, i, r.strip.length))}
                  </div>
                  <div className="slot-drum" aria-hidden="true" />
                </div>
              ))}
            </div>
            {winLines.length > 0 ? (
              <svg className="slot-lines" viewBox="0 0 300 300" preserveAspectRatio="none" aria-hidden="true">
                {winLines.map((l) => <polyline key={l.line} points={game.paylines[l.line].map((row, i) => `${50 + i * 100},${50 + row * 100}`).join(' ')} fill="none" stroke={LINE_COLORS[l.line % 5]} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />)}
              </svg>
            ) : null}
            {banner && <div className={`slot-banner ${banner.tier}`} role="status">{banner.text}{shown !== null && shown > 0 && banner.tier !== 'free' && banner.tier !== 'bonus' ? <strong> +{formatNumber(shown)}</strong> : null}</div>}
            {shower.n > 0 && <Shower key={shower.n} coins={shower.coins} items={shower.mega ? skin.rain : undefined} />}
            <div className="slot-glass" aria-hidden="true" />
          </div>
          <div className="slot-shine" aria-hidden="true" />
        </div>

        <button type="button" className="slot-lever" onClick={() => spin(false)} disabled={busy || !canPay} aria-label="Tirer le levier pour tourner" title="Tirer le levier">
          <span className="lever-base" /><span className="lever-rod" /><span className="lever-ball" />
        </button>
      </div>

      <div className="slot-tray" aria-hidden="true"><i /><i /><i /><i /><i /></div>

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
        {jackpot?.enabled && <>Gros lot : trois meilleurs symboles alignés avec une mise de {jackpot.minStake} points ou plus. {jackpot.last && <>Dernier gagnant : <strong><Nick name={jackpot.last.username} /></strong> (+{formatNumber(jackpot.last.amount)}). </>}</>}
        Jeu de hasard avec des points du site : gagner n'est jamais garanti.
        {me.lossLeft !== null && <> Limite du jour : encore {formatNumber(me.lossLeft)} points.</>}
      </div>
      {remind && <div className="slot-remind">⏰ Tu joues depuis plus de 20 minutes ({formatNumber(session.wagered)} points misés, {formatNumber(session.won)} gagnés). Une petite pause ? <button type="button" className="slot-mini" onClick={() => setRemind(false)}>OK</button></div>}

      {paytable && (
        <div className="slot-pay">
          <div className="muted" style={{ marginBottom: 6 }}>Gains pour une mise de {stake} points (le joker remplace un symbole) :</div>
          <div className="slot-pay-grid">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="slot-pay-row"><Sym skin={skin} id={i} /><span>{skin.names[i]}</span><span><strong>{formatNumber((game.payThree[i] * stake) / game.step)}</strong> <span className="muted" style={{ fontSize: 12 }}>(3 identiques) · {formatNumber((game.payPair[i] * stake) / game.step)} (paire à gauche)</span></span></div>
            ))}
            <div className="slot-pay-row"><Sym skin={skin} id={6} /><span>{skin.names[6]}</span><span className="muted">remplace tout</span></div>
            <div className="slot-pay-row"><Sym skin={skin} id={7} /><span>{skin.names[7]}</span><span className="muted">3 ou plus : 5 tours gratuits, gains ×{game.freeMult}</span></div>
          </div>
          <div className="muted" style={{ marginTop: 6, fontSize: 12.5 }}>5 lignes : 3 horizontales et 2 diagonales ; les gains de toutes les lignes s'additionnent. Gain maximal par partie : {formatNumber(config.maxWin)} points.</div>
        </div>
      )}
    </div>
  );
}
