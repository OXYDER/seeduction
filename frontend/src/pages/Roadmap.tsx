import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

interface Entry { hash: string; at: string; title: string; details: string[] }

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });

/** Journal des modifications du site : version courante, à venir (écrit par les administrateurs) et tout ce qui a été fait, avec date et heure. */
export default function Roadmap() {
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = ['ADMIN', 'OWNER'].includes(role ?? '');
  const [data, setData] = useState<{ version: string; build: number; updatedAt: string | null; items: Entry[]; hasMore: boolean; upcoming: string[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const load = (before?: string) => api.get('/roadmap', { params: { limit: 120, before } }).then((r) => {
    setData((prev) => (before && prev ? { ...r.data, items: [...prev.items, ...r.data.items] } : r.data));
  }).catch(() => setError('Journal indisponible'));
  useEffect(() => { void load(); }, []);

  const days = useMemo(() => {
    const out: { day: string; items: Entry[] }[] = [];
    for (const e of data?.items ?? []) {
      const d = dayLabel(e.at);
      if (out.length && out[out.length - 1].day === d) out[out.length - 1].items.push(e); else out.push({ day: d, items: [e] });
    }
    return out;
  }, [data]);

  async function saveUpcoming() {
    try {
      const items = draft.split('\n').map((l) => l.trim()).filter(Boolean);
      await api.put('/roadmap/upcoming', { items });
      setEditing(false);
      void load();
    } catch (err: any) { setError(err.response?.data?.message ?? 'Enregistrement impossible'); }
  }

  if (error) return <p className="muted">{error}</p>;
  if (!data) return <p className="muted">Chargement…</p>;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>🗺️ Roadmap et journal des modifications</h1>
        <Link to="/stats" className="secondary" style={{ padding: '6px 12px', borderRadius: 8 }}>← Statistiques</Link>
      </div>

      <div className="panel rm-version">
        <div><span className="muted">Version actuelle</span><div className="rm-big">v{data.version}</div></div>
        <div><span className="muted">Dernière mise à jour</span><div className="rm-big sm">{data.updatedAt ? `${dayLabel(data.updatedAt)} à ${timeLabel(data.updatedAt)}` : '—'}</div></div>
        <div className="muted" style={{ fontSize: 12 }}>Le numéro de version augmente à chaque modification mise en ligne ; ce journal se remplit tout seul.</div>
      </div>

      {(data.upcoming.length > 0 || canEdit) && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
            <h3 style={{ margin: 0 }}>🔜 À venir</h3>
            {canEdit && !editing && <button type="button" className="secondary" onClick={() => { setDraft(data.upcoming.join('\n')); setEditing(true); }}>✏️ Modifier</button>}
          </div>
          {editing ? (
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              <textarea rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Une idée ou une fonction prévue par ligne" />
              <div className="row" style={{ gap: 8 }}><button type="button" onClick={saveUpcoming}>Enregistrer</button><button type="button" className="secondary" onClick={() => setEditing(false)}>Annuler</button></div>
            </div>
          ) : data.upcoming.length === 0 ? <p className="muted">Rien d'annoncé pour l'instant.</p> : (
            <ul style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.7 }}>{data.upcoming.map((t, i) => <li key={i}>{t}</li>)}</ul>
          )}
        </div>
      )}

      <div className="rm-timeline">
        {days.map((d) => (
          <section key={d.day} className="rm-day">
            <h3>{d.day}</h3>
            {d.items.map((e) => (
              <article key={e.hash + e.at} className={`rm-entry${open === e.hash ? ' open' : ''}`}>
                <div className="rm-head" onClick={() => e.details.length && setOpen(open === e.hash ? null : e.hash)} role={e.details.length ? 'button' : undefined}>
                  <span className="rm-time">{timeLabel(e.at)}</span>
                  <span className="rm-title">{e.title}</span>
                  {e.details.length > 0 && <span className="rm-more">{open === e.hash ? '⌃' : '⌄'}</span>}
                </div>
                {open === e.hash && <ul className="rm-details">{e.details.map((l, i) => <li key={i}>{l}</li>)}</ul>}
              </article>
            ))}
          </section>
        ))}
        {days.length === 0 && <p className="muted">Aucune modification enregistrée pour l'instant.</p>}
      </div>
      {data.hasMore && <div><button type="button" className="secondary" onClick={() => void load(data.items[data.items.length - 1].at)}>Plus ancien</button></div>}
    </div>
  );
}
