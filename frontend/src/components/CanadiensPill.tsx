import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useEventTheme } from '../store/eventTheme';
import HeaderPopover from './HeaderPopover';

interface Side { abbrev: string; name: string; score: number | null; sog: number | null }
interface Game {
  id: number; date: string; startUtc: string; state: 'FUT' | 'PRE' | 'LIVE' | 'FINAL' | 'PPD'; kind: string; home: Side; away: Side; venue: string | null; tv: string[];
  period: string | null; clock: { remaining: string; running: boolean; intermission: boolean } | null; outcome: string | null; won: boolean | null; side: 'home' | 'away';
}
interface Data { enabled: boolean; available?: boolean; stale?: boolean; live: Game | null; featured: Game | null; last: Game[]; next: Game[]; updatedAt?: string }

const mine = (g: Game) => (g.side === 'home' ? g.home : g.away);
const other = (g: Game) => (g.side === 'home' ? g.away : g.home);
const timeFmt = (iso: string) => new Date(iso).toLocaleTimeString('fr-CA', { hour: 'numeric', minute: '2-digit' });
const dayFmt = (iso: string) => new Date(iso).toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const KIND: Record<string, string> = { PRESAISON: 'Pré-saison', SERIES: 'Séries', SAISON: '', AUTRE: '' };

/** Texte court de l'en-tête. */
function pillText(g: Game): { text: string; tone: 'live' | 'win' | 'loss' | 'soon' } {
  const m = mine(g), o = other(g);
  if (g.state === 'LIVE') return { text: `${m.abbrev} ${m.score ?? 0} – ${o.score ?? 0} ${o.abbrev}`, tone: 'live' };
  if (g.state === 'FINAL') return { text: `Final · ${m.abbrev} ${m.score ?? 0} – ${o.score ?? 0} ${o.abbrev}${g.outcome && g.outcome !== 'Final' ? ` ${g.outcome.includes('tirs') ? '(TB)' : '(Pr.)'}` : ''}`, tone: g.won ? 'win' : 'loss' };
  const start = new Date(g.startUtc);
  const when = sameDay(start, new Date()) ? timeFmt(g.startUtc) : `${dayFmt(g.startUtc)} ${timeFmt(g.startUtc)}`;
  return { text: `${g.side === 'home' ? `${m.abbrev} vs ${o.abbrev}` : `${m.abbrev} @ ${o.abbrev}`} · ${when}`, tone: 'soon' };
}

function GameRow({ g }: { g: Game }) {
  const m = mine(g), o = other(g);
  return (
    <div className="mtl-row">
      <span className="muted">{dayFmt(g.startUtc)}</span>
      <span>{g.side === 'home' ? 'vs' : '@'} {o.name}{KIND[g.kind] ? <em className="muted"> · {KIND[g.kind]}</em> : null}</span>
      {g.state === 'FINAL'
        ? <strong className={g.won ? 'mtl-w' : 'mtl-l'}>{g.won ? 'V' : 'D'} {m.score}–{o.score}{g.outcome && g.outcome !== 'Final' ? (g.outcome.includes('tirs') ? ' (TB)' : ' (Pr.)') : ''}</strong>
        : <span className="muted">{timeFmt(g.startUtc)}{g.tv.length ? ` · ${g.tv.slice(0, 2).join(', ')}` : ''}</span>}
    </div>
  );
}

/** Score des Canadiens de Montréal à chaque match (données de la LNH) : une pastille dans l'en-tête, et au clic le détail, les derniers résultats et les prochains matchs. */
export default function CanadiensPill() {
  const enabled = useEventTheme((s) => s.mtl);
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState(false);
  const prev = useRef<{ id: number; score: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  /** Interroge le serveur ; renvoie dans combien de temps recommencer (20 s pendant un match ou juste avant, sinon 5 min). */
  const load = useCallback(async (): Promise<number> => {
    try {
      const d = (await api.get('/sports/canadiens')).data as Data;
      setData(d);
      const g = d.live;
      if (g) {
        const score = mine(g).score ?? 0;
        if (prev.current && prev.current.id === g.id && score > prev.current.score) { setGoal(true); window.setTimeout(() => setGoal(false), 9000); }
        prev.current = { id: g.id, score };
      } else prev.current = null;
      const f = d.featured;
      return f && (f.state === 'LIVE' || (f.state !== 'FINAL' && new Date(f.startUtc).getTime() - Date.now() < 3600_000)) ? 20_000 : 5 * 60_000;
    } catch { return 60_000; /* la LNH ou le serveur ne répond pas : on garde ce qu'on a et on réessaie */ }
  }, []);

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

  if (!enabled || !data || !data.enabled || !data.available || !data.featured) return null;
  const g = data.featured;
  const { text, tone } = pillText(g);
  const m = mine(g), o = other(g);

  return (
    <>
      <button ref={btn} type="button" className={`mtl-pill ${tone}${goal ? ' goal' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} title="Canadiens de Montréal : score et calendrier">
        {tone === 'live' && <i className="mtl-dot" aria-hidden="true" />}
        <span aria-hidden="true">🏒</span> {goal ? <strong>BUT ! </strong> : null}{text}
        {g.state === 'LIVE' && g.period && <small>{g.clock?.intermission ? 'Entracte' : g.period.replace(' période', '')} {g.clock?.remaining}</small>}
      </button>
      <HeaderPopover open={open} anchorRef={btn} onClose={close} width={380} label="Canadiens de Montréal">
        <div className="hp-head"><strong>🏒 Canadiens de Montréal</strong>{data.stale && <span className="muted" style={{ fontSize: 11.5 }}>données en attente de la LNH</span>}</div>
        <div style={{ padding: '10px 14px', overflowY: 'auto' }}>
          <div className="mtl-card">
            <div className="muted" style={{ fontSize: 12 }}>
              {g.state === 'LIVE' ? `En direct · ${g.clock?.intermission ? 'Entracte' : g.period ?? ''} ${g.clock?.remaining ?? ''}` : g.state === 'FINAL' ? (g.outcome ?? 'Final') : 'À venir'}
              {KIND[g.kind] ? ` · ${KIND[g.kind]}` : ''}
            </div>
            <div className="mtl-score">
              <span>{m.name}</span><strong>{g.state === 'FUT' || g.state === 'PRE' ? '–' : m.score ?? 0}</strong>
              <span>{o.name}</span><strong>{g.state === 'FUT' || g.state === 'PRE' ? '–' : o.score ?? 0}</strong>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {g.state === 'FUT' || g.state === 'PRE' ? `${dayFmt(g.startUtc)} à ${timeFmt(g.startUtc)}` : g.state === 'LIVE' && m.sog !== null ? `Tirs au but : ${m.abbrev} ${m.sog} – ${o.sog ?? 0} ${o.abbrev}` : ''}
              {g.venue ? ` · ${g.venue}` : ''}{g.tv.length ? ` · ${g.tv.slice(0, 3).join(', ')}` : ''}
            </div>
          </div>
          {data.last.length > 0 && <><div className="mtl-sub">Derniers résultats</div>{data.last.map((x) => <GameRow key={x.id} g={x} />)}</>}
          {data.next.length > 0 && <><div className="mtl-sub">Prochains matchs</div>{data.next.filter((x) => x.id !== g.id || g.state === 'FINAL').map((x) => <GameRow key={x.id} g={x} />)}</>}
          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Données : LNH. Mises à jour toutes les 20 secondes pendant un match.</div>
        </div>
      </HeaderPopover>
    </>
  );
}

