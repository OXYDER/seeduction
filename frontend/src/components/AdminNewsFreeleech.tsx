import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import WysiwygEditor from './WysiwygEditor';

const pad = (n: number) => String(n).padStart(2, '0');
/** Date -> valeur d'un champ datetime-local (heure locale du navigateur). */
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmt = (iso: string | Date) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

// ----------------------------------------------------------------------------- nouvelles

/** Nouvelles du site : publier, modifier, épingler, supprimer (éditeur complet). */
export function NewsAdmin() {
  const [items, setItems] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = () => api.get('/announcements/feed', { params: { page: 1, pageSize: 30 } }).then((r) => setItems(r.data.items));
  useEffect(() => { load(); }, []);

  function reset() {
    setEditingId(null); setTitle(''); setContent(''); setPinned(false); setEditorKey((k) => k + 1);
  }

  async function save() {
    setError(''); setMessage('');
    if (!title.trim() || !content.trim()) { setError('Titre et contenu requis'); return; }
    try {
      if (editingId) await api.patch(`/announcements/${editingId}`, { title, content, pinned });
      else await api.post('/announcements', { title, content, pinned });
      setMessage(editingId ? '✓ Nouvelle modifiée' : '✓ Nouvelle publiée (tous les membres sont notifiés)');
      reset();
      load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Enregistrement impossible');
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Supprimer cette nouvelle ?')) return;
    await api.delete(`/announcements/${id}`).catch(() => {});
    if (editingId === id) reset();
    load();
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <h3>{editingId ? '✏️ Modifier la nouvelle' : '📰 Publier une nouvelle'}</h3>
        <p className="muted">Les nouvelles apparaissent en haut de la page d'accueil et dans la section « Nouvelles ». À la publication, tous les membres reçoivent une notification.</p>
        <div className="grid" style={{ gap: 10 }}>
          <input placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          <WysiwygEditor key={editorKey} value={content} onChange={setContent} minHeight={260} placeholder="Contenu de la nouvelle..." />
          <label className="row muted" style={{ gap: 6 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> 📌 Épingler en haut
          </label>
          {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}
          {message && <div className="muted" style={{ color: 'var(--success)' }}>{message}</div>}
          <div className="row">
            <button type="button" onClick={save}>{editingId ? 'Enregistrer' : 'Publier'}</button>
            {editingId && <button type="button" className="secondary" onClick={reset}>Annuler</button>}
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Nouvelles publiées</h3>
        <table>
          <tbody>
            {items.map((n) => (
              <tr key={n.id}>
                <td>{n.pinned ? '📌 ' : ''}{n.title}<div className="muted" style={{ fontSize: 12 }}>{fmt(n.createdAt)}{n.author && ` · ${n.author.username}`}</div></td>
                <td className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="secondary" onClick={() => { setEditingId(n.id); setTitle(n.title); setContent(n.content); setPinned(n.pinned); setEditorKey((k) => k + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Éditer</button>
                  <button className="danger" onClick={() => remove(n.id)}>Supprimer</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td className="muted">Aucune nouvelle publiée.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------- freeleech

/** Freeleech global : lancement immédiat (durée ou date de fin au choix) et événements programmés sur un calendrier. */
export function FreeleechAdmin() {
  const [state, setState] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [hours, setHours] = useState('24');
  const [untilInput, setUntilInput] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Formulaire d'événement
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [text, setText] = useState('');
  const [announce, setAnnounce] = useState(true);
  const [editorKey, setEditorKey] = useState(0);

  // Calendrier
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const loadAll = () => {
    api.get('/bonus/freeleech').then((r) => setState(r.data)).catch(() => {});
    api.get('/bonus/events').then((r) => setEvents(r.data)).catch(() => {});
  };
  useEffect(loadAll, []);

  const fail = (err: any) => { setMessage(''); setError(err.response?.data?.message ?? 'Erreur'); };

  async function startNow(body: { hours?: number | null; until?: string | null }) {
    setError(''); setMessage('');
    try { await api.post('/bonus/freeleech', body); setMessage(body.hours === null && !body.until ? '✓ Freeleech arrêté' : '✓ Freeleech lancé'); loadAll(); } catch (err) { fail(err); }
  }

  function resetForm() {
    setEditingId(null); setTitle(''); setText(''); setStartsAt(''); setEndsAt(''); setAnnounce(true); setEditorKey((k) => k + 1);
  }

  function prefillDay(day: Date) {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0);
    const end = new Date(start.getTime() + 24 * 3600_000);
    setEditingId(null); setStartsAt(toLocalInput(start)); setEndsAt(toLocalInput(end));
  }

  function setDuration(h: number) {
    const start = startsAt ? new Date(startsAt) : new Date();
    if (!startsAt) setStartsAt(toLocalInput(start));
    setEndsAt(toLocalInput(new Date(start.getTime() + h * 3600_000)));
  }

  async function saveEvent() {
    setError(''); setMessage('');
    if (!title.trim() || !startsAt || !endsAt) { setError('Titre, début et fin requis'); return; }
    const body = { title, message: text, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() };
    try {
      if (editingId) await api.patch(`/bonus/events/${editingId}`, body);
      else await api.post('/bonus/events', { ...body, announce });
      setMessage(editingId ? '✓ Événement modifié' : '✓ Événement programmé');
      resetForm();
      loadAll();
    } catch (err) { fail(err); }
  }

  async function removeEvent(id: string) {
    if (!window.confirm('Supprimer cet événement ?')) return;
    try { await api.delete(`/bonus/events/${id}`); if (editingId === id) resetForm(); loadAll(); } catch (err) { fail(err); }
  }

  function editEvent(ev: any) {
    setEditingId(ev.id); setTitle(ev.title); setText(ev.message ?? ''); setStartsAt(toLocalInput(new Date(ev.startsAt))); setEndsAt(toLocalInput(new Date(ev.endsAt)));
    setEditorKey((k) => k + 1);
  }

  // Grille du mois (semaines du lundi au dimanche)
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [month]);

  const eventsOn = (day: Date) => {
    const from = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    const to = from + 24 * 3600_000;
    return events.filter((e) => new Date(e.startsAt).getTime() < to && new Date(e.endsAt).getTime() > from);
  };
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const upcoming = events.filter((e) => new Date(e.endsAt).getTime() > Date.now());
  const past = events.filter((e) => new Date(e.endsAt).getTime() <= Date.now()).reverse();

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <h3>🎉 Freeleech immédiat</h3>
        <p className="muted">Pendant un freeleech, les téléchargements de tous les membres ne comptent pas dans leur ratio (l'upload compte toujours).</p>
        {state?.until ? (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <strong style={{ color: 'var(--success)' }}>Actif jusqu'au {fmt(state.until)}{state.event ? ` (${state.event.title})` : ''}</strong>
            <button type="button" className="danger" onClick={() => startNow({ hours: null, until: null })}>Arrêter le freeleech manuel</button>
          </div>
        ) : <span className="muted">Aucun freeleech en cours.</span>}

        <div className="row" style={{ flexWrap: 'wrap', marginTop: 12 }}>
          <span className="muted">Durée :</span>
          <input type="number" min="1" max="744" value={hours} onChange={(e) => setHours(e.target.value)} style={{ width: 90 }} />
          <span className="muted">heure(s)</span>
          <button type="button" onClick={() => startNow({ hours: Number(hours) })}>Lancer</button>
          {[24, 48, 72, 168].map((h) => <button key={h} type="button" className="secondary" onClick={() => startNow({ hours: h })}>{h === 168 ? '1 semaine' : `${h} h`}</button>)}
        </div>
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
          <span className="muted">Ou jusqu'au :</span>
          <input type="datetime-local" value={untilInput} onChange={(e) => setUntilInput(e.target.value)} />
          <button type="button" disabled={!untilInput} onClick={() => startNow({ until: new Date(untilInput).toISOString() })}>Lancer jusqu'à cette date</button>
        </div>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>🗓️ Calendrier des événements</h3>
          <div className="row">
            <button type="button" className="secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
            <strong style={{ minWidth: 150, textAlign: 'center', textTransform: 'capitalize' }}>{month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</strong>
            <button type="button" className="secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
            <button type="button" className="secondary" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>Aujourd'hui</button>
          </div>
        </div>
        <p className="muted">Clique sur un jour pour préremplir un nouvel événement, ou sur un événement pour le modifier.</p>
        <div className="cal-grid">
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => <div key={d} className="cal-head">{d}</div>)}
          {days.map((day) => {
            const list = eventsOn(day);
            return (
              <div
                key={day.toISOString()}
                className={`cal-day${day.getMonth() !== month.getMonth() ? ' other' : ''}${sameDay(day, today) ? ' today' : ''}`}
                onClick={() => prefillDay(day)}
              >
                <div className="cal-num">{day.getDate()}</div>
                {list.slice(0, 2).map((ev) => (
                  <div key={ev.id} className="cal-event" title={`${ev.title}\n${fmt(ev.startsAt)} → ${fmt(ev.endsAt)}`} onClick={(e) => { e.stopPropagation(); editEvent(ev); }}>
                    {ev.title}
                  </div>
                ))}
                {list.length > 2 && <div className="muted" style={{ fontSize: 10 }}>+{list.length - 2}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h3>{editingId ? '✏️ Modifier l\'événement' : '➕ Programmer un événement freeleech'}</h3>
        <div className="grid" style={{ gap: 10 }}>
          <input placeholder="Titre (ex : Week-end freeleech de la fête du Canada)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          <div className="filter-grid">
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>Début</div>
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>Fin</div>
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <span className="muted">Durée rapide depuis le début :</span>
            {[24, 48, 72, 168].map((h) => <button key={h} type="button" className="secondary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setDuration(h)}>{h === 168 ? '1 semaine' : `${h} h`}</button>)}
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Message affiché aux membres (« Comment profiter de ce freeleech »)</div>
            <WysiwygEditor key={editorKey} value={text} onChange={setText} minHeight={200} placeholder="Explique l'événement, les règles, comment en profiter..." />
          </div>
          {!editingId && (
            <label className="row muted" style={{ gap: 6 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
              Publier aussi une nouvelle et notifier tous les membres
            </label>
          )}
          {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}
          {message && <div className="muted" style={{ color: 'var(--success)' }}>{message}</div>}
          <div className="row">
            <button type="button" onClick={saveEvent}>{editingId ? 'Enregistrer' : 'Programmer'}</button>
            {editingId && <button type="button" className="secondary" onClick={resetForm}>Annuler</button>}
            {editingId && <button type="button" className="danger" onClick={() => removeEvent(editingId)}>Supprimer</button>}
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Événements à venir et en cours ({upcoming.length})</h3>
        <table>
          <tbody>
            {upcoming.map((ev) => (
              <tr key={ev.id}>
                <td><strong>{ev.title}</strong><div className="muted" style={{ fontSize: 12 }}>{fmt(ev.startsAt)} → {fmt(ev.endsAt)}{new Date(ev.startsAt).getTime() <= Date.now() && ' · 🟢 en cours'}</div></td>
                <td className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="secondary" onClick={() => editEvent(ev)}>Éditer</button>
                  <button className="danger" onClick={() => removeEvent(ev.id)}>Supprimer</button>
                </td>
              </tr>
            ))}
            {upcoming.length === 0 && <tr><td className="muted">Aucun événement programmé.</td></tr>}
          </tbody>
        </table>
        {past.length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary className="muted" style={{ cursor: 'pointer' }}>Événements passés (60 derniers jours)</summary>
            <table>
              <tbody>
                {past.map((ev) => (
                  <tr key={ev.id}><td>{ev.title}<div className="muted" style={{ fontSize: 12 }}>{fmt(ev.startsAt)} → {fmt(ev.endsAt)}</div></td></tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>
    </div>
  );
}
