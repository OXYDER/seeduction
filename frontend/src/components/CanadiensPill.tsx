import { playGoalHorn, primeGoalHorn } from '../lib/goalHorn';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useEventTheme } from '../store/eventTheme';
import HeaderPopover from './HeaderPopover';
import TeamLogo from './TeamLogo';

interface Side { abbrev: string; name: string; score: number | null; sog: number | null }
interface Game {
  id: number; date: string; startUtc: string; state: 'FUT' | 'PRE' | 'LIVE' | 'FINAL' | 'PPD'; kind: string; home: Side; away: Side; venue: string | null; tv: string[];
  period: string | null; clock: { remaining: string; running: boolean; intermission: boolean } | null; outcome: string | null; won: boolean | null; side: 'home' | 'away';
}
interface Data { enabled: boolean; available?: boolean; stale?: boolean; live: Game | null; featured: Game | null; last: Game[]; next: Game[]; updatedAt?: string; clockAt?: string; serverNow?: string }

/** Chrono affiché : le temps restant donné par la LNH, diminué du temps écoulé depuis (les horloges du serveur donnent l'âge exact de la donnée, celle de l'appareil fait avancer les secondes). */
function clockLeft(g: Game, d: Data, receivedAt: number, now: number, moving: boolean): string {
  const c = g.clock;
  if (!c) return '';
  const m = /^(\d+):(\d{2})$/.exec(c.remaining);
  if (!m || !moving) return c.remaining;
  const age = d.clockAt && d.serverNow ? Math.max(0, (Date.parse(d.serverNow) - Date.parse(d.clockAt)) / 1000) : 0;
  const left = Math.max(0, Number(m[1]) * 60 + Number(m[2]) - Math.floor(age + (now - receivedAt) / 1000));
  return `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
}

const mine = (g: Game) => (g.side === 'home' ? g.home : g.away);
const other = (g: Game) => (g.side === 'home' ? g.away : g.home);
const timeFmt = (iso: string) => new Date(iso).toLocaleTimeString('fr-CA', { hour: 'numeric', minute: '2-digit' });
const dayFmt = (iso: string) => new Date(iso).toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const KIND: Record<string, string> = { PRESAISON: 'Pré-saison', SERIES: 'Séries', SAISON: '', AUTRE: '' };

const Logo = TeamLogo;

const suffix = (g: Game) => (g.outcome && g.outcome !== 'Final' ? (g.outcome.includes('tirs') ? ' (TB)' : ' (Pr.)') : '');

/** Contenu de la pastille : logos des deux équipes et score (sur téléphone, on ne garde que ça). */
function pillBody(g: Game): { body: JSX.Element; tone: 'live' | 'win' | 'loss' | 'soon' } {
  const m = mine(g), o = other(g);
  if (g.state === 'LIVE' || g.state === 'FINAL') {
    return {
      tone: g.state === 'LIVE' ? 'live' : g.won ? 'win' : 'loss',
      body: <>{g.state === 'FINAL' && <span className="mtl-opt">Final · </span>}<Logo abbrev={m.abbrev} name={m.name} /> <strong className="mtl-num">{m.score ?? 0}</strong>–<strong className="mtl-num">{o.score ?? 0}</strong> <Logo abbrev={o.abbrev} name={o.name} />{g.state === 'FINAL' && suffix(g) && <small>{suffix(g)}</small>}</>,
    };
  }
  const start = new Date(g.startUtc);
  const when = sameDay(start, new Date()) ? timeFmt(g.startUtc) : `${dayFmt(g.startUtc)} ${timeFmt(g.startUtc)}`;
  return { tone: 'soon', body: <><Logo abbrev={m.abbrev} name={m.name} /> <span className="muted">{g.side === 'home' ? 'vs' : '@'}</span> <Logo abbrev={o.abbrev} name={o.name} /> <small className="mtl-when">{when}</small></> };
}

function GameRow({ g }: { g: Game }) {
  const m = mine(g), o = other(g);
  return (
    <div className="mtl-row">
      <span className="muted">{dayFmt(g.startUtc)}</span>
      <span className="mtl-team"><span className="muted">{g.side === 'home' ? 'vs' : '@'}</span> <Logo abbrev={o.abbrev} name={o.name} size={16} /> {o.name}{KIND[g.kind] ? <em className="muted"> · {KIND[g.kind]}</em> : null}</span>
      {g.state === 'FINAL'
        ? <strong className={g.won ? 'mtl-w' : 'mtl-l'}>{g.won ? 'V' : 'D'} {m.score}–{o.score}{suffix(g)}</strong>
        : <span className="muted">{timeFmt(g.startUtc)}{g.tv.length ? ` · ${g.tv.slice(0, 2).join(', ')}` : ''}</span>}
    </div>
  );
}

/** Score des Canadiens de Montréal à chaque match (données de la LNH) : une pastille dans l'en-tête, et au clic le détail, les derniers résultats et les prochains matchs. */
export default function CanadiensPill() {
  const enabled = useEventTheme((s) => s.mtl);
  const sound = useEventTheme((s) => s.mtlSound);
  const inferredRef = useRef(false);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState(false);
  const [receivedAt, setReceivedAt] = useState(0);
  const [inferred, setInferred] = useState(false);
  const sample = useRef<{ key: string; secs: number; at: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const prev = useRef<{ id: number; score: number; at: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  /** Interroge le serveur ; renvoie dans combien de temps recommencer (20 s pendant un match ou juste avant, sinon 5 min). */
  const load = useCallback(async (): Promise<number> => {
    try {
      const d = (await api.get('/sports/canadiens')).data as Data;
      setData(d);
      setReceivedAt(Date.now());
      // La LNH indique « arrêté » pendant les entractes et parfois en retard : si le chrono a baissé entre deux lectures, c'est qu'il tourne.
      const c = d.live?.clock;
      const t = c && /^(\d+):(\d{2})$/.exec(c.remaining);
      if (d.live && c && t && d.clockAt) {
        const secs = Number(t[1]) * 60 + Number(t[2]), key = `${d.live.id}:${d.live.period}`, p = sample.current;
        if (!p || p.key !== key) setInferred(false);
        else if (p.at !== d.clockAt) setInferred(secs < p.secs ? true : secs === p.secs && !c.running && !c.intermission ? false : inferredRef.current);
        if (!p || p.at !== d.clockAt) sample.current = { key, secs, at: d.clockAt };
      } else { sample.current = null; setInferred(false); }
      const g = d.live;
      if (g) {
        const score = mine(g).score ?? 0;
        if (prev.current && prev.current.id === g.id && score > prev.current.score) { setGoal(true); if (soundRef.current && Date.now() - prev.current.at < 60_000) playGoalHorn(); /* pas de sirène pour un but marqué pendant que l'onglet dormait */ window.setTimeout(() => setGoal(false), 9000); }
        prev.current = { id: g.id, score, at: Date.now() };
      } else prev.current = null;
      const f = d.featured;
      return f && (f.state === 'LIVE' || (f.state !== 'FINAL' && new Date(f.startUtc).getTime() - Date.now() < 3600_000)) ? (f.state === 'LIVE' ? 5_000 : 20_000) : 5 * 60_000;
    } catch { return 60_000; /* la LNH ou le serveur ne répond pas : on garde ce qu'on a et on réessaie */ }
  }, []);

  useEffect(() => { if (enabled && sound) primeGoalHorn(); }, [enabled, sound]);

  useEffect(() => {
    if (!enabled) return;
    let timer: number;
    let delay = 5 * 60_000;
    const tick = async () => {
      if (!document.hidden) delay = await load();
      timer = window.setTimeout(tick, delay);
    };
    tick();
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [enabled, load]);

  inferredRef.current = inferred;
  const clk = data?.featured?.clock;
  const moving = !!(clk && (clk.running || clk.intermission || inferred));
  const ticking = enabled && data?.featured?.state === 'LIVE' && moving;
  useEffect(() => {
    if (!ticking) return;
    const t = window.setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000);
    return () => clearInterval(t);
  }, [ticking]);

  if (!enabled || !data || !data.enabled || !data.available || !data.featured) return null;
  const g = data.featured;
  const { body, tone } = pillBody(g);
  const m = mine(g), o = other(g);

  return (
    <>
      <button ref={btn} type="button" className={`mtl-pill ${tone}${goal ? ' goal' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} title="Canadiens de Montréal : score et calendrier">
        {tone === 'live' && <i className="mtl-dot" aria-hidden="true" />}
        {goal ? <strong className="mtl-but">BUT !</strong> : null}{body}
        {g.state === 'LIVE' && g.period && <small className="mtl-per">{g.clock?.intermission ? 'Entr.' : g.period.replace(' période', '')} {clockLeft(g, data, receivedAt, now, moving)}</small>}
      </button>
      <HeaderPopover open={open} anchorRef={btn} onClose={close} width={380} label="Canadiens de Montréal">
        <div className="hp-head"><strong>🏒 Canadiens de Montréal</strong>{data.stale && <span className="muted" style={{ fontSize: 11.5 }}>données en attente de la LNH</span>}</div>
        <div style={{ padding: '10px 14px', overflowY: 'auto' }}>
          <div className="mtl-card">
            <div className="muted" style={{ fontSize: 12 }}>
              {g.state === 'LIVE' ? `En direct · ${g.clock?.intermission ? 'Entracte' : g.period ?? ''} ${clockLeft(g, data, receivedAt, now, moving)}` : g.state === 'FINAL' ? (g.outcome ?? 'Final') : 'À venir'}
              {KIND[g.kind] ? ` · ${KIND[g.kind]}` : ''}
            </div>
            <div className="mtl-score">
              <span className="mtl-team"><Logo abbrev={m.abbrev} name={m.name} size={30} /> {m.name}</span><strong>{g.state === 'FUT' || g.state === 'PRE' ? '–' : m.score ?? 0}</strong>
              <span className="mtl-team"><Logo abbrev={o.abbrev} name={o.name} size={30} /> {o.name}</span><strong>{g.state === 'FUT' || g.state === 'PRE' ? '–' : o.score ?? 0}</strong>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {g.state === 'FUT' || g.state === 'PRE' ? `${dayFmt(g.startUtc)} à ${timeFmt(g.startUtc)}` : g.state === 'LIVE' && m.sog !== null ? `Tirs au but : ${m.abbrev} ${m.sog} – ${o.sog ?? 0} ${o.abbrev}` : ''}
              {g.venue ? ` · ${g.venue}` : ''}{g.tv.length ? ` · ${g.tv.slice(0, 3).join(', ')}` : ''}
            </div>
          </div>
          {data.last.length > 0 && <><div className="mtl-sub">Derniers résultats</div>{data.last.map((x) => <GameRow key={x.id} g={x} />)}</>}
          {data.next.length > 0 && <><div className="mtl-sub">Prochains matchs</div>{data.next.filter((x) => x.id !== g.id || g.state === 'FINAL').map((x) => <GameRow key={x.id} g={x} />)}</>}
          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Données : LNH. Le chrono avance en direct ; score mis à jour toutes les 5 secondes pendant un match.</div>
        </div>
      </HeaderPopover>
    </>
  );
}

