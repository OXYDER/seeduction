import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { bbcodeToHtml } from '../lib/bbcode';
import { useCountdown } from '../components/FreeleechCalendar';

interface Ev { id: string; title: string; message: string | null; startsAt: string; endsAt: string }

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const DAYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const when = (iso: string) => new Date(iso).toLocaleString('fr-CA', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const shortWhen = (iso: string) => new Date(iso).toLocaleString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dur = (a: string, b: string) => {
  const h = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 3_600_000);
  return h >= 48 ? `${Math.round(h / 24)} jours` : `${h} h`;
};

function Countdown({ to, prefix }: { to: string; prefix: string }) {
  const c = useCountdown(to);
  return <span className="fl-count">{prefix} {c}</span>;
}

/** Calendrier complet des freeleech globaux : un mois à la fois (jours et mois), avec les périodes passées, en cours et à venir. */
export default function FreeleechCalendarPage() {
  const today = day0(new Date());
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<Date | null>(today);
  const [open, setOpen] = useState<string | null>(null);

  // Grille : du lundi précédant le 1er au dimanche suivant la fin du mois.
  const start = useMemo(() => { const first = new Date(month.getFullYear(), month.getMonth(), 1); return addDays(first, -((first.getDay() + 6) % 7)); }, [month]);
  const end = useMemo(() => { const last = new Date(month.getFullYear(), month.getMonth() + 1, 0); return addDays(last, 6 - ((last.getDay() + 6) % 7) + 1); }, [month]);
  const cells = useMemo(() => { const out: Date[] = []; for (let d = start; d < end; d = addDays(d, 1)) out.push(d); return out; }, [start, end]);

  useEffect(() => {
    setEvents(null);
    api.get('/bonus/freeleech/calendar', { params: { from: start.toISOString(), to: end.toISOString() } }).then((r) => { setEvents(r.data.events); setManual(r.data.until && !r.data.activeEventId ? r.data.until : null); }).catch(() => setEvents([]));
  }, [start, end]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const status = (e: Ev): 'live' | 'soon' | 'past' => (new Date(e.endsAt).getTime() <= now ? 'past' : new Date(e.startsAt).getTime() <= now ? 'live' : 'soon');
  const eventsOn = (d: Date) => (events ?? []).filter((e) => new Date(e.startsAt) < addDays(d, 1) && new Date(e.endsAt) > d);
  const shown = selected ? eventsOn(selected) : [];
  const monthEvents = (events ?? []).filter((e) => new Date(e.startsAt) < new Date(month.getFullYear(), month.getMonth() + 1, 1) && new Date(e.endsAt) > month);
  const years = useMemo(() => { const y = today.getFullYear(); return [y - 1, y, y + 1, y + 2]; }, [today]);

  const go = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <div className="grid">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>🗓️ Calendrier freeleech</h1>
        <Link to="/bonus" className="secondary" style={{ padding: '8px 14px' }}>← Boutique bonus</Link>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Pendant un freeleech global, aucun téléchargement ne compte dans ton ratio. Consulte ici les périodes passées, en cours et à venir (heure de ton appareil).
      </p>

      {manual && new Date(manual).getTime() > now && (
        <div className="fl-item live">
          <div><strong>🎉 Freeleech global</strong> <span className="fl-badge">EN COURS</span><div className="muted">Jusqu'au {when(manual)}</div></div>
          <Countdown to={manual} prefix="se termine dans" />
        </div>
      )}

      <div className="panel flcal-page">
        <div className="flcal-head">
          <button type="button" className="secondary" onClick={() => go(-1)} aria-label="Mois précédent">‹</button>
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <select value={month.getMonth()} onChange={(e) => setMonth(new Date(month.getFullYear(), Number(e.target.value), 1))} aria-label="Mois">
              {MONTHS.map((m, i) => <option key={m} value={i}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
            </select>
            <select value={month.getFullYear()} onChange={(e) => setMonth(new Date(Number(e.target.value), month.getMonth(), 1))} aria-label="Année">
              {[...new Set([...years, month.getFullYear()])].sort().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="button" className="secondary" onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(today); }}>Aujourd'hui</button>
          </div>
          <button type="button" className="secondary" onClick={() => go(1)} aria-label="Mois suivant">›</button>
        </div>

        <div className="flcal-grid" role="grid" aria-label={`${MONTHS[month.getMonth()]} ${month.getFullYear()}`}>
          {DAYS.map((d) => <div key={d} className="flcal-dow" role="columnheader">{d}</div>)}
          {cells.map((d) => {
            const evs = eventsOn(d);
            const inMonth = d.getMonth() === month.getMonth();
            const isToday = key(d) === key(today);
            const isSel = !!selected && key(d) === key(selected);
            const st = evs.length ? (evs.some((e) => status(e) === 'live') ? 'live' : evs.some((e) => status(e) === 'soon') ? 'soon' : 'past') : '';
            return (
              <button key={key(d)} type="button" role="gridcell" className={`flcal-day${inMonth ? '' : ' out'}${isToday ? ' today' : ''}${isSel ? ' sel' : ''}${st ? ` has ${st}` : ''}`}
                onClick={() => setSelected(d)} aria-label={`${d.getDate()} ${MONTHS[d.getMonth()]}${evs.length ? ` : ${evs.map((e) => e.title).join(', ')}` : ''}`}>
                <span className="flcal-num">{d.getDate()}</span>
                {evs.slice(0, 2).map((e) => <span key={e.id} className={`flcal-pill ${status(e)}`} title={e.title}>{e.title}</span>)}
                {evs.length > 2 && <span className="flcal-more">+{evs.length - 2}</span>}
              </button>
            );
          })}
        </div>
        <div className="flcal-legend muted">
          <span><i className="flcal-dot live" /> en cours</span> <span><i className="flcal-dot soon" /> à venir</span> <span><i className="flcal-dot past" /> passé</span>
          {events === null && <span> · chargement…</span>}
        </div>
      </div>

      {selected && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>{selected.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>
          {shown.length === 0 ? <p className="muted" style={{ margin: 0 }}>Aucun freeleech global ce jour-là.</p> : (
            <div className="fl-list">{shown.map((e) => <EventCard key={e.id} e={e} st={status(e)} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />)}</div>
          )}
        </div>
      )}

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Périodes de {MONTHS[month.getMonth()]} {month.getFullYear()}</h3>
        {events === null ? <p className="muted" style={{ margin: 0 }}>Chargement…</p> : monthEvents.length === 0 ? <p className="muted" style={{ margin: 0 }}>Aucun freeleech global prévu ce mois-ci.</p> : (
          <div className="fl-list">{monthEvents.map((e) => <EventCard key={e.id} e={e} st={status(e)} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />)}</div>
        )}
      </div>
    </div>
  );
}

function EventCard({ e, st, open, onToggle }: { e: Ev; st: 'live' | 'soon' | 'past'; open: boolean; onToggle: () => void }) {
  return (
    <div className={`fl-item${st === 'live' ? ' live' : ''}${st === 'past' ? ' past' : ''}`}>
      <div style={{ minWidth: 0 }}>
        <strong>{st === 'live' ? '🎉 ' : ''}{e.title}</strong> {st === 'live' && <span className="fl-badge">EN COURS</span>}
        <div className="muted">{when(e.startsAt)} → {shortWhen(e.endsAt)} · {dur(e.startsAt, e.endsAt)}</div>
        {e.message && (
          <>
            <button type="button" className="secondary fl-more" onClick={onToggle}>{open ? 'Masquer' : 'Détails'}</button>
            {open && <div className="bbcode-content" style={{ marginTop: 6 }} dangerouslySetInnerHTML={{ __html: bbcodeToHtml(e.message) }} />}
          </>
        )}
      </div>
      {st === 'live' && <Countdown to={e.endsAt} prefix="se termine dans" />}
      {st === 'soon' && <Countdown to={e.startsAt} prefix="dans" />}
    </div>
  );
}
