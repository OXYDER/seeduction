import { useEffect, useMemo, useState } from 'react';
import { addDays, dayKey, hm, keyLabel, keyOf, longDate, parseKey, weekStart } from '../lib/liveTime';

export interface LiveEvent { title: string; description: string | null; posterUrl: string | null; color: string | null; start: string; end: string; live: boolean }
export type CalendarView = 'month' | 'week' | 'list';

interface Props {
  events: LiveEvent[];
  tz: string;
  now: number;
  view: CalendarView;
  mondayFirst: boolean;
  showEndTime: boolean;
  colors: { today: string; event: string; live: string };
}

/** Vrai sur un écran étroit (téléphone) : le mois montre des pastilles plutôt que des titres illisibles. */
function useNarrow() {
  const q = '(max-width: 640px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q); const f = () => setNarrow(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return narrow;
}

const VIEW_LABEL: Record<CalendarView, string> = { month: 'Mois', week: 'Semaine', list: 'Liste' };

/** Calendrier des diffusions de la page Direct : mois, semaine ou liste, la journée en cours dans sa propre couleur. */
export default function LiveCalendar({ events, tz, now, view: defaultView, mondayFirst, showEndTime, colors }: Props) {
  const today = dayKey(now, tz);
  const [view, setView] = useState<CalendarView>(defaultView);
  const [cursor, setCursor] = useState(today);
  const [selected, setSelected] = useState<LiveEvent | null>(null);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const narrow = useNarrow();

  const byDay = useMemo(() => {
    const map = new Map<string, LiveEvent[]>();
    for (const e of events) {
      const k = dayKey(e.start, tz);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return map;
  }, [events, tz]);

  const colorOf = (e: LiveEvent) => (e.live ? colors.live : e.color || colors.event);
  const isPast = (e: LiveEvent) => new Date(e.end).getTime() <= now;
  const when = (e: LiveEvent) => `${hm(e.start, tz)}${showEndTime ? ` – ${hm(e.end, tz)}` : ''}`;

  const chip = (e: LiveEvent, i: number, compact = false) => (
    <button
      key={`${e.start}-${i}`}
      type="button"
      onClick={() => setSelected(e)}
      title={`${e.title} · ${when(e)}`}
      style={{
        display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', margin: 0,
        padding: compact ? '2px 4px' : '6px 8px', borderRadius: 6, fontSize: compact ? 11 : 13, lineHeight: 1.3,
        background: `${colorOf(e)}33`, borderLeft: `3px solid ${colorOf(e)}`, color: 'var(--text)',
        opacity: isPast(e) ? 0.5 : 1, overflow: 'hidden', whiteSpace: 'normal',
        ...(compact ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const } : {}),
      }}
    >
      {e.live && '🔴 '}<strong>{hm(e.start, tz)}</strong> {e.title}
      {!compact && showEndTime && <span className="muted"> · jusqu'à {hm(e.end, tz)}</span>}
    </button>
  );

  // Cases du mois : de la première semaine qui touche le 1er jusqu'à la dernière semaine du mois.
  const { y, m } = parseKey(cursor);
  const monthCells = useMemo(() => {
    const first = keyOf(y, m, 1);
    const start = weekStart(first, mondayFirst);
    const last = keyOf(y, m + 1, 0);
    const cells: string[] = [];
    for (let k = start; cells.length < 42; k = addDays(k, 1)) {
      cells.push(k);
      if (cells.length % 7 === 0 && k >= last) break;
    }
    return cells;
  }, [y, m, mondayFirst]);
  const weekCells = useMemo(() => { const s = weekStart(cursor, mondayFirst); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); }, [cursor, mondayFirst]);
  const dayNames = weekCells.map((k) => keyLabel(k, { weekday: 'short' }));

  const move = (dir: number) => {
    if (view === 'month') setCursor(keyOf(y, m + dir, 1));
    else if (view === 'week') setCursor(addDays(cursor, 7 * dir));
  };
  const title = view === 'month'
    ? keyLabel(keyOf(y, m, 1), { month: 'long', year: 'numeric' })
    : view === 'week' ? `Semaine du ${keyLabel(weekCells[0], { day: 'numeric', month: 'long' })}` : 'Prochaines diffusions';

  const dayStyle = (k: string): React.CSSProperties => (k === today
    ? { background: `${colors.today}26`, border: `2px solid ${colors.today}` }
    : { background: 'var(--bg-panel-raised)', border: '1px solid var(--border)' });

  const upcomingDays = [...byDay.keys()].filter((k) => k >= today).sort();

  return (
    <div className="panel" style={{ display: 'grid', gap: 10 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          {view !== 'list' && <button type="button" className="secondary" onClick={() => move(-1)} aria-label="Précédent">‹</button>}
          <strong style={{ minWidth: 150, textAlign: 'center' }}>{title}</strong>
          {view !== 'list' && <button type="button" className="secondary" onClick={() => move(1)} aria-label="Suivant">›</button>}
          {view !== 'list' && cursor !== today && <button type="button" className="secondary" onClick={() => setCursor(today)}>Aujourd'hui</button>}
        </div>
        <div className="row" style={{ gap: 4 }}>
          {(Object.keys(VIEW_LABEL) as CalendarView[]).map((v) => (
            <button key={v} type="button" className={v === view ? undefined : 'secondary'} onClick={() => setView(v)}>{VIEW_LABEL[v]}</button>
          ))}
        </div>
      </div>

      {view === 'month' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
          {dayNames.map((n) => <div key={n} className="muted" style={{ fontSize: 12, textAlign: 'center' }}>{n}</div>)}
          {monthCells.map((k) => {
            const list = byDay.get(k) ?? [];
            const out = parseKey(k).m !== m;
            return (
              <div
                key={k}
                onClick={narrow && list.length ? () => setPickedDay(k === pickedDay ? null : k) : undefined}
                style={{
                  ...dayStyle(k), borderRadius: 8, minHeight: narrow ? 46 : 74, padding: 4, display: 'grid', alignContent: 'start', gap: 3, opacity: out ? 0.45 : 1, minWidth: 0,
                  cursor: narrow && list.length ? 'pointer' : undefined, outline: k === pickedDay ? '2px solid var(--text-dim)' : undefined,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: k === today ? 800 : 500, color: k === today ? colors.today : undefined }}>
                  {parseKey(k).d}{k === today && !narrow && <span style={{ fontSize: 10, marginLeft: 4 }}>aujourd'hui</span>}
                </div>
                {narrow ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {list.map((e, i) => <span key={i} title={e.title} style={{ width: 8, height: 8, borderRadius: 4, background: colorOf(e), opacity: isPast(e) ? 0.5 : 1 }} />)}
                  </div>
                ) : (
                  <>
                    {list.slice(0, 3).map((e, i) => chip(e, i, true))}
                    {list.length > 3 && <span className="muted" style={{ fontSize: 11 }}>+{list.length - 3} autre(s)</span>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view === 'month' && narrow && pickedDay && (
        <div style={{ display: 'grid', gap: 4 }}>
          <strong style={{ fontSize: 13.5, color: pickedDay === today ? colors.today : undefined }}>{keyLabel(pickedDay, { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
          {(byDay.get(pickedDay) ?? []).map((e, i) => chip(e, i))}
        </div>
      )}
      {view === 'month' && narrow && !pickedDay && <span className="muted" style={{ fontSize: 12 }}>Touche une journée pour voir ses diffusions.</span>}

      {view === 'week' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6 }}>
          {weekCells.map((k) => (
            <div key={k} style={{ ...dayStyle(k), borderRadius: 8, padding: 6, display: 'grid', alignContent: 'start', gap: 4, minHeight: 90 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: k === today ? colors.today : undefined }}>
                {keyLabel(k, { weekday: 'long', day: 'numeric' })}{k === today && ' · aujourd\'hui'}
              </div>
              {(byDay.get(k) ?? []).map((e, i) => chip(e, i))}
              {!(byDay.get(k) ?? []).length && <span className="muted" style={{ fontSize: 12 }}>—</span>}
            </div>
          ))}
        </div>
      )}

      {view === 'list' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {upcomingDays.length === 0 && <span className="muted">Aucune diffusion à venir.</span>}
          {upcomingDays.map((k) => (
            <div key={k} style={{ ...dayStyle(k), borderRadius: 8, padding: 8, display: 'grid', gap: 4 }}>
              <div style={{ fontWeight: 700, color: k === today ? colors.today : undefined }}>
                {keyLabel(k, { weekday: 'long', day: 'numeric', month: 'long' })}{k === today && ' · aujourd\'hui'}
              </div>
              {(byDay.get(k) ?? []).map((e, i) => chip(e, i))}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div style={{ borderLeft: `4px solid ${colorOf(selected)}`, padding: '8px 12px', background: 'var(--bg-panel-raised)', borderRadius: 8, display: 'grid', gap: 4 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
            <strong>{selected.live && '🔴 '}{selected.title}</strong>
            <button type="button" className="secondary" onClick={() => setSelected(null)} aria-label="Fermer">✕</button>
          </div>
          <span>{longDate(selected.start, tz)} · {when(selected)}</span>
          {selected.description && <span className="muted" style={{ whiteSpace: 'pre-line' }}>{selected.description}</span>}
          {isPast(selected) && <span className="muted" style={{ fontSize: 12 }}>Diffusion passée</span>}
        </div>
      )}
    </div>
  );
}
