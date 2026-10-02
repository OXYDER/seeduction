import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { bbcodeToHtml } from '../lib/bbcode';

const fmt = (iso: string) => new Date(iso).toLocaleString('fr-CA', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Décompte lisible : « 2 j 4 h », « 3 h 12 min », « 45 min 10 s ». Se met à jour tout seul. */
export function useCountdown(targetIso?: string | null): string | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!targetIso) return;
    const left = new Date(targetIso).getTime() - Date.now();
    const t = setInterval(() => setNow(Date.now()), left < 3600_000 ? 1000 : 20_000);
    return () => clearInterval(t);
  }, [targetIso]);
  if (!targetIso) return null;
  const ms = new Date(targetIso).getTime() - now;
  if (ms <= 0) return 'maintenant';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d} j ${h} h`;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  return `${m} min ${String(sec).padStart(2, '0')} s`;
}

function Countdown({ to, prefix }: { to: string; prefix: string }) {
  const c = useCountdown(to);
  return <span className="fl-count">{prefix} {c}</span>;
}

/** Calendrier des freeleech globaux : celui en cours (avec le temps restant) et ceux à venir (avec le décompte avant le départ). */
export default function FreeleechCalendar({ compact }: { compact?: boolean }) {
  const [state, setState] = useState<any>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api.get('/bonus/freeleech').then((r) => setState(r.data)).catch(() => {}); }, []);
  if (!state) return null;
  const upcoming: any[] = state.upcoming ?? [];
  if (!state.until && upcoming.length === 0) return null;

  return (
    <section className={`panel fl-cal${compact ? ' compact' : ''}`} aria-label="Calendrier freeleech">
      <h3 style={{ margin: 0 }}>🗓️ Calendrier freeleech</h3>
      <div className="fl-list">
        {state.until && (
          <div className="fl-item live">
            <div>
              <strong>🎉 {state.event?.title ?? 'Freeleech global'}</strong> <span className="fl-badge">EN COURS</span>
              <div className="muted">Jusqu'au {fmt(state.until)}</div>
            </div>
            <Countdown to={state.until} prefix="se termine dans" />
          </div>
        )}
        {upcoming.map((e) => (
          <div key={e.id} className="fl-item">
            <div style={{ minWidth: 0 }}>
              <strong>{e.title}</strong>
              <div className="muted">{fmt(e.startsAt)} → {fmt(e.endsAt)}</div>
              {e.message && (
                <>
                  <button type="button" className="secondary fl-more" onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? 'Masquer' : 'Détails'}</button>
                  {open === e.id && <div className="bbcode-content" style={{ marginTop: 6 }} dangerouslySetInnerHTML={{ __html: bbcodeToHtml(e.message) }} />}
                </>
              )}
            </div>
            <Countdown to={e.startsAt} prefix="dans" />
          </div>
        ))}
      </div>
    </section>
  );
}
