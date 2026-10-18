import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import { audio, playWin, setSoundOn, soundOn, tick } from '../lib/slotSound';
import { playWrong } from '../lib/cardSound';
import CoinShower from '../components/CoinShower';
import '../games.css';

type Kind = 'UNDER' | 'OVER' | 'EXACT' | 'DOUBLES';
interface BetInfo { kind: Kind; n: number; ways: number; p: number; mult: number }
interface Rolled { d1: number; d2: number; total: number; win: boolean; doubles: boolean; stake: number; daily: boolean; mult: number; payout: number; tier: 'none' | 'small' | 'big' | 'mega'; points: number; stakeable: number }
interface Overview {
  config: { enabled: boolean; minStake: number; maxStake: number; maxWin: number; dailyLossMax: number; dailyFree: { enabled: boolean; stake: number; maxWin: number } };
  bets: BetInfo[];
  me: { points: number; donated: number; stakeable: number; blocked: string | null; lossLeft: number | null; dailyFreeAvailable: boolean };
  recent: { id: string; kind: Kind; n: number; d1: number; d2: number; valued: number; daily: boolean; mult: number; payout: number; createdAt: string }[];
  biggest: { username: string; kind: Kind; n: number; stake: number; mult: number; payout: number }[];
}

const STAKES = [5, 10, 25, 50, 100];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const when = (iso: string) => new Date(iso).toLocaleString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const mult = (m: number) => `×${m.toFixed(2).replace('.', ',')}`;
const pct = (p: number) => `${p >= 0.1 ? Math.round(p * 100) : (p * 100).toFixed(1).replace('.', ',')} %`;
const TABS: { kind: Kind; label: string }[] = [{ kind: 'UNDER', label: 'Moins que' }, { kind: 'OVER', label: 'Plus que' }, { kind: 'EXACT', label: 'Total exact' }, { kind: 'DOUBLES', label: 'Doubles' }];
const betLabel = (kind: Kind, n: number) => (kind === 'UNDER' ? `Moins que ${n}` : kind === 'OVER' ? `Plus que ${n}` : kind === 'EXACT' ? `Total de ${n}` : 'Doubles');

/** Orientation (degrés) qui amène chaque face devant le joueur : 1 devant, 6 derrière, 3 à droite, 4 à gauche, 2 dessus, 5 dessous. */
const FACE: Record<number, [number, number]> = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function winsTotal(kind: Kind, n: number, t: number): boolean {
  return kind === 'UNDER' ? t < n : kind === 'OVER' ? t > n : kind === 'EXACT' ? t === n : t % 2 === 0;
}
const WAYS = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];

function Face({ v, cls }: { v: number; cls: string }) {
  return <div className={`dc-face ${cls}`}>{Array.from({ length: 9 }, (_, i) => <i key={i} className={PIPS[v].includes(i) ? 'on' : ''} />)}</div>;
}

/** Un dé en 3D : tourne sur lui-même puis s'arrête sur la face tirée par le serveur. */
function Die({ x, y, rolling }: { x: number; y: number; rolling: boolean }) {
  return (
    <div className="dc-die">
      <div className={`dc-cube${rolling ? ' rolling' : ''}`} style={{ transform: `rotateX(${x}deg) rotateY(${y}deg)` }}>
        <Face v={1} cls="f1" /><Face v={6} cls="f6" /><Face v={3} cls="f3" /><Face v={4} cls="f4" /><Face v={2} cls="f2" /><Face v={5} cls="f5" />
      </div>
    </div>
  );
}

/** Le cliquetis des dés qui roulent, puis le choc à l'arrêt. */
function rattle() {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const t0 = a.c.currentTime + 0.02;
  let t = 0, gap = 0.045;
  while (t < 1.3) { tick(a, t0 + t, 700 + Math.random() * 1800, 0.07 + Math.random() * 0.06, 0.02 + Math.random() * 0.02); t += gap; gap *= 1.06; }
}
function thud() {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const { c, out } = a, t = c.currentTime + 0.01;
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(g).connect(out); o.start(t); o.stop(t + 0.25);
  tick(a, t, 2200, 0.12, 0.03);
}

/** Dés : deux dés, un pari sur le total ou sur des doubles ; la cote dépend des chances. */
export default function Dice() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [bet, setBet] = useState<{ kind: Kind; n: number }>({ kind: 'OVER', n: 7 });
  const [stake, setStake] = useState(10);
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [ang, setAng] = useState<[[number, number], [number, number]]>([[-20, -25], [-20, 25]]);
  const [res, setRes] = useState<Rolled | null>(null);
  const [points, setPoints] = useState(0);
  const [shower, setShower] = useState(0);
  const [sound, setSound] = useState(soundOn());
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/games/dice');
      if (!alive.current) return;
      setData(r.data); setPoints(r.data.me.points); setError('');
    } catch { setError('Impossible de charger le jeu'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const info = (kind: Kind, n: number) => data?.bets.find((b) => b.kind === kind && b.n === n) ?? null;
  const cur = data ? info(bet.kind, bet.n) : null;

  /** Prochaine orientation d'un dé : toujours en avant, avec quelques tours complets de plus. */
  const next = (from: [number, number], v: number): [number, number] => {
    const [bx, by] = FACE[v];
    const fwd = (current: number, base: number) => base + 360 * Math.ceil((current - base) / 360 + 2 + Math.floor(Math.random() * 2));
    return [fwd(from[0], bx), fwd(from[1], by)];
  };

  async function roll(daily: boolean) {
    if (!data || busy) return;
    const b = daily ? (cur ?? { kind: 'OVER' as Kind, n: 7 }) : bet;
    setError(''); setBusy(true); setRes(null);
    try {
      const { data: r } = await api.post('/games/dice/roll', { kind: b.kind, n: b.n, stake, daily });
      const g = r as Rolled;
      setRolling(true); rattle();
      setAng(([a1, a2]) => [next(a1, g.d1), next(a2, g.d2)]);
      await sleep(1600);
      if (!alive.current) return;
      setRolling(false); thud();
      await sleep(250);
      if (!alive.current) return;
      setRes(g); setPoints(g.points);
      if (g.win) { playWin(g.tier === 'mega' ? 'mega' : g.tier === 'big' ? 'big' : 'small', Math.max(1, g.payout / Math.max(1, g.stake))); setShower((n) => n + 1); }
      else playWrong();
      void load();
    } catch (e: any) { setRolling(false); setError(e.response?.data?.message ?? 'Lancer impossible'); }
    finally { if (alive.current) setBusy(false); }
  }

  if (!data) return <p className="muted">{error || 'Chargement…'}</p>;
  if (!data.config.enabled) return <div className="panel"><h1>🎲 Dés</h1><p className="muted">Les dés sont fermés pour le moment.</p></div>;

  const cfg = data.config, me = data.me;
  const stakes = STAKES.filter((s) => s >= cfg.minStake && s <= cfg.maxStake);
  const canRoll = !busy && !me.blocked && !!cur && me.stakeable >= stake && (me.lossLeft === null || me.lossLeft >= stake);
  const potential = cur ? Math.floor(stake * cur.mult) : 0;
  const numbers = (kind: Kind) => data.bets.filter((b) => b.kind === kind);
  const presets: { label: string; kind: Kind; n: number; icon: string }[] = [
    { label: 'Prudent', kind: 'UNDER', n: 8, icon: '🍀' }, { label: 'Équilibré', kind: 'OVER', n: 7, icon: '⚖️' },
    { label: 'Audacieux', kind: 'EXACT', n: 7, icon: '🔥' }, { label: 'Gros lot', kind: 'EXACT', n: 12, icon: '💎' },
  ];

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>🎲 Dés</h1>
        <Link to="/jeux" className="muted">← Tous les jeux</Link>
      </div>

      <div className={`dc-table${res ? (res.win ? ' won' : ' lost') : ''}`}>
        <div className="dc-top">
          <span className="dc-points">Solde : <strong>{formatNumber(points)}</strong></span>
          <span className="dc-bet">{cur ? <>{betLabel(bet.kind, bet.n)} · <strong>{mult(cur.mult)}</strong> · {pct(cur.p)} de chances</> : 'Choisis un pari'}</span>
          <button type="button" className="slot-mini" onClick={() => { const v = !sound; setSound(v); setSoundOn(v); }} aria-pressed={sound} title={sound ? 'Couper le son' : 'Activer le son'}>{sound ? '🔊' : '🔇'}</button>
        </div>

        <div className="dc-stage">
          <Die x={ang[0][0]} y={ang[0][1]} rolling={rolling} />
          <Die x={ang[1][0]} y={ang[1][1]} rolling={rolling} />
        </div>

        <div className="dc-total" aria-live="polite">
          {res ? <><span className="dc-total-n">{res.d1} + {res.d2} = {res.total}</span>{res.doubles && <span className="dc-dbl">DOUBLES !</span>}</> : rolling ? <span className="dc-total-n">…</span> : <span className="muted">Les dés sont prêts</span>}
        </div>

        <div className="dc-strip" aria-label="Totaux gagnants">
          {Array.from({ length: 11 }, (_, i) => i + 2).map((t) => {
            const w = winsTotal(bet.kind, bet.n, t);
            return <span key={t} className={`dc-pill${w ? ' win' : ''}${res && res.total === t ? ' hit' : ''}`} title={`${WAYS[t]} combinaison${WAYS[t] > 1 ? 's' : ''} sur 36`}><b>{t}</b><i style={{ height: `${WAYS[t] * 4 + 3}px` }} /></span>;
          })}
        </div>

        {res && (
          <div className={`dc-banner ${res.win ? (res.tier === 'mega' ? 'mega' : 'win') : 'lose'}`} role="status">
            {res.win ? `${res.tier === 'mega' ? '🏆 GROS LOT ! ' : res.tier === 'big' ? '🎉 ' : ''}Gagné ! +${formatNumber(res.payout)} points (${mult(res.mult)})` : `Pas cette fois : ${res.total}. Relance les dés !`}
          </div>
        )}
        {shower > 0 && <CoinShower key={shower} coins={res?.tier === 'mega' ? 90 : res?.tier === 'big' ? 50 : 24} items={res?.tier === 'mega' ? ['🎲', '⭐'] : undefined} />}
      </div>

      <div className="panel ornate dc-panel">
        <div className="dc-presets" role="group" aria-label="Paris rapides">
          {presets.map((p) => { const i = info(p.kind, p.n); return i ? <button key={p.label} type="button" className={`secondary${bet.kind === p.kind && bet.n === p.n ? ' on' : ''}`} disabled={busy} onClick={() => setBet({ kind: p.kind, n: p.n })}>{p.icon} {p.label} <small>{mult(i.mult)}</small></button> : null; })}
        </div>
        <div className="dc-tabs" role="tablist">
          {TABS.map((t) => <button key={t.kind} type="button" role="tab" aria-selected={bet.kind === t.kind} className={`dc-tab${bet.kind === t.kind ? ' on' : ''}`} disabled={busy} onClick={() => setBet(t.kind === 'DOUBLES' ? { kind: 'DOUBLES', n: 0 } : { kind: t.kind, n: numbers(t.kind).some((b) => b.n === bet.n) && bet.kind !== 'DOUBLES' ? bet.n : numbers(t.kind)[Math.floor(numbers(t.kind).length / 2)]?.n ?? 7 })}>{t.label}</button>)}
        </div>
        {bet.kind !== 'DOUBLES' && (
          <div className="dc-nums">
            {numbers(bet.kind).map((b) => (
              <button key={b.n} type="button" className={`dc-num${bet.n === b.n ? ' on' : ''}`} disabled={busy} onClick={() => setBet({ kind: bet.kind, n: b.n })}>
                <strong>{b.n}</strong><small>{mult(b.mult)}</small>
              </button>
            ))}
          </div>
        )}
        {bet.kind === 'DOUBLES' && <p className="muted" style={{ margin: '6px 0' }}>Les deux dés montrent le même chiffre (1-1, 2-2… 6-6) : 6 combinaisons sur 36.</p>}

        <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <strong>Mise</strong>
          <div className="slot-stakes" role="group" aria-label="Mise" style={{ display: 'flex', gap: 6 }}>
            {stakes.map((s) => <button key={s} type="button" className={`secondary${stake === s ? ' on' : ''}`} onClick={() => setStake(s)} disabled={busy}>{s}</button>)}
          </div>
          <button type="button" className="dc-go" disabled={!canRoll} onClick={() => roll(false)}>🎲 Lancer · {stake} points{cur ? <small> (jusqu'à +{formatNumber(Math.min(potential, cfg.maxWin || potential))})</small> : null}</button>
          {me.dailyFreeAvailable && <button type="button" className="secondary" disabled={busy || !!me.blocked} onClick={() => roll(true)}>🎁 Lancer gratuit du jour</button>}
        </div>
        {me.blocked && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{me.blocked}</div>}
        {!me.blocked && me.stakeable < stake && !me.dailyFreeAvailable && <div className="muted" style={{ marginTop: 8 }}>Points misables insuffisants{me.donated > 0 ? ' (les points de don ne se misent pas)' : ''}.</div>}
        <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          Points misables : <strong>{formatNumber(me.stakeable)}</strong>. Deux dés sont lancés : plus ton pari est rare, plus la cote est grande. Jeu de hasard avec des points du site : gagner n'est jamais garanti.
          Gain maximal par lancer : {formatNumber(cfg.maxWin)} points{cfg.dailyLossMax > 0 && me.lossLeft !== null ? ` · limite du jour : encore ${formatNumber(me.lossLeft)} points` : ''}.
        </div>
      </div>
      {error && <div className="slot-error">{error}</div>}

      <div className="moj-two">
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Mes derniers lancers</h3>
          {data.recent.length === 0 ? <p className="muted">Pas encore de lancer.</p> : (
            <table className="moj-board"><tbody>
              {data.recent.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{when(r.createdAt)}</td>
                  <td>{betLabel(r.kind, r.n)} · 🎲 {r.d1}+{r.d2}</td>
                  <td style={{ textAlign: 'right', color: r.payout > 0 ? 'var(--green-bright)' : undefined }}><strong>{r.payout > 0 ? `+${formatNumber(r.payout)}` : '—'}</strong></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Plus gros gains (7 jours)</h3>
          {data.biggest.length === 0 ? <p className="muted">Aucun gain pour l'instant.</p> : (
            <table className="moj-board"><tbody>
              {data.biggest.map((b, i) => (
                <tr key={i}><td>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td><td>{b.username}</td><td className="muted">{betLabel(b.kind, b.n)} · mise {b.stake}</td><td style={{ textAlign: 'right' }}><strong>+{formatNumber(b.payout)}</strong></td></tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}
