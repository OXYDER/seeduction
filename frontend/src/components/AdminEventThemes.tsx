import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { ART, type EventId } from '../lib/eventArt';
import { useEventDecor, useEventTheme } from '../store/eventTheme';
import { EventSprite } from './EventDecor';

interface Schedule { enabled: boolean; from: string; to: string; easterBefore: number; easterAfter: number }
interface Config { enabled: boolean; particles: boolean; timezone: string; events: Record<EventId, Schedule>; force: { id: EventId | null; until: string | null }; countdown: { enabled: boolean; daysBefore: number } }
interface Info { id: EventId; name: string; icon: string; blurb: string; defaults: Schedule; window: { start: string; end: string; running: boolean } }
interface Data { config: Config; active: { id: EventId | null; name: string | null; source: 'forced' | 'schedule' | null; until: string | null }; events: Info[] }

const errorOf = (e: any) => e?.response?.data?.message ?? 'Action impossible';
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const mmdd = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${d}${d === 1 ? 'er' : ''} ${MONTHS[m - 1]}`; };
const daysUntil = (iso: string) => Math.round((new Date(`${iso}T12:00:00`).getTime() - Date.now()) / 86400_000);
/** « MM-JJ » ⇄ champ date (l'année n'a pas d'importance : la période revient chaque année). */
const toDateInput = (m: string) => `2028-${m}`;
const fromDateInput = (v: string) => v.slice(5);

/** Administration des thèmes d'événements : calendrier annuel, aperçu pour soi seul, activation immédiate pour tout le monde. */
export default function AdminEventThemes() {
  const [data, setData] = useState<Data | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hours, setHours] = useState<Record<string, string>>({});
  const [sports, setSports] = useState<{ enabled: boolean } | null>(null);
  const decor = useEventDecor();
  const preview = useEventTheme((s) => s.preview);
  const setPreview = useEventTheme((s) => s.setPreview);
  const reload = useEventTheme((s) => s.load);

  const load = useCallback(async () => {
    try { const r = (await api.get('/event-themes/admin')).data as Data; setData(r); setCfg((c) => (c && dirty ? c : r.config)); } catch (e) { setErr(errorOf(e)); }
  }, [dirty]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/sports/admin').then((r) => setSports(r.data)).catch(() => undefined); }, []);

  async function toggleSports(enabled: boolean) {
    try { setSports((await api.put('/sports/admin', { enabled })).data); setMsg(enabled ? '✓ Score des Canadiens activé.' : '✓ Score des Canadiens désactivé.'); } catch (e) { setErr(errorOf(e)); }
  }

  async function save() {
    if (!cfg) return;
    setBusy(true); setErr('');
    try {
      const r = (await api.put('/event-themes/admin', { enabled: cfg.enabled, particles: cfg.particles, events: cfg.events, countdown: cfg.countdown })).data as Data;
      setData(r); setCfg(r.config); setDirty(false); setMsg('✓ Calendrier enregistré.'); reload();
    } catch (e) { setErr(errorOf(e)); } finally { setBusy(false); }
  }
  async function force(id: EventId | null, h: number | null) {
    setBusy(true); setErr('');
    try { const r = (await api.post('/event-themes/admin/force', { id, hours: h })).data as Data; setData(r); setMsg(id ? `✓ ${ART[id].name} activé pour tout le monde${h ? ` pendant ${h} h` : ' jusqu\'à ce que tu l\'arrêtes'}.` : '✓ Activation immédiate arrêtée : retour au calendrier.'); reload(); }
    catch (e) { setErr(errorOf(e)); } finally { setBusy(false); }
  }
  const edit = (id: EventId, patch: Partial<Schedule>) => { if (!cfg) return; setCfg({ ...cfg, events: { ...cfg.events, [id]: { ...cfg.events[id], ...patch } } }); setDirty(true); };

  if (!data || !cfg) return <p className="muted">{err || 'Chargement…'}</p>;
  const act = data.active;

  return (
    <div className="grid" style={{ gap: 14 }}>
      {!decor.id && <EventSprite />}
      {msg && <div className="panel" style={{ borderColor: 'var(--success)', color: 'var(--success)' }}>{msg}</div>}
      {err && <div className="panel" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>{err}</div>}

      <div className="panel" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <strong style={{ fontSize: 16 }}>{act.id ? `En ce moment : ${act.name}` : 'Aucun thème en ce moment'}</strong>
          <div className="muted" style={{ fontSize: 13 }}>
            {act.id ? (act.source === 'forced' ? `Activé à la main${act.until ? ` jusqu'au ${new Date(act.until).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })}` : ' (jusqu\'à ce que tu l\'arrêtes)'}.` : 'Selon le calendrier ci-dessous.') : 'Le site garde son apparence normale jusqu\'au prochain événement du calendrier.'}
          </div>
        </div>
        {act.source === 'forced' && <button type="button" className="secondary" onClick={() => force(null, null)} disabled={busy}>⏹ Arrêter l'activation immédiate</button>}
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.enabled} onChange={(e) => { setCfg({ ...cfg, enabled: e.target.checked }); setDirty(true); }} /> Thèmes d'événements activés</label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }} title="Chaque membre peut aussi les couper chez lui (🎨 en haut de l'écran)"><input type="checkbox" checked={cfg.particles} onChange={(e) => { setCfg({ ...cfg, particles: e.target.checked }); setDirty(true); }} /> Particules animées</label>
      </div>

      <div className="panel" style={{ display: 'grid', gap: 10 }}>
        <strong>Autres animations</strong>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.countdown.enabled} onChange={(e) => { setCfg({ ...cfg, countdown: { ...cfg.countdown, enabled: e.target.checked } }); setDirty(true); }} /> 🎆 Compte à rebours du Jour de l'An</label>
          <span style={{ fontSize: 13 }}>à partir de <input type="number" min={1} max={120} value={cfg.countdown.daysBefore} onChange={(e) => { setCfg({ ...cfg, countdown: { ...cfg.countdown, daysBefore: Number(e.target.value) || 1 } }); setDirty(true); }} style={{ width: 70 }} aria-label="Jours avant minuit" /> jours avant minuit</span>
          <span className="muted" style={{ fontSize: 12.5 }}>Les dix dernières secondes s'affichent en grand, puis « Bonne année ! » et des confettis à minuit pile ({cfg.timezone}).</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={sports?.enabled ?? true} onChange={(e) => toggleSports(e.target.checked)} /> 🏒 Score des Canadiens de Montréal</label>
          <span className="muted" style={{ fontSize: 12.5 }}>Pastille dans l'en-tête à chaque match (en direct, résultat, prochain match), d'après les données publiques de la LNH. Chaque membre peut la masquer chez lui (🎨).</span>
        </div>
      </div>

      {preview && (
        <div className="panel" style={{ borderColor: 'var(--border-gold)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span>👁️ Aperçu en cours : <strong>{ART[preview].name}</strong> (toi seul le vois).</span>
          <button type="button" className="secondary" onClick={() => setPreview(null)}>Arrêter l'aperçu</button>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {data.events.map((ev) => {
          const art = ART[ev.id], s = cfg.events[ev.id];
          const w = ev.window;
          const days = daysUntil(w.start);
          const isForced = act.source === 'forced' && act.id === ev.id;
          return (
            <div key={ev.id} className="panel" style={{ display: 'grid', gap: 10, borderColor: act.id === ev.id ? 'var(--border-gold)' : undefined, opacity: s.enabled ? 1 : 0.6 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <svg width="54" height="54" aria-hidden="true"><use href={`#${art.mascot}`} /></svg>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: 15 }}>{ev.icon} {ev.name}</strong>
                  <div className="muted" style={{ fontSize: 12.5 }}>{ev.blurb}</div>
                </div>
                <label title="Activer cet événement dans le calendrier" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={s.enabled} onChange={(e) => edit(ev.id, { enabled: e.target.checked })} /> Actif</label>
              </div>
              <div style={{ display: 'flex', gap: 6 }} aria-hidden="true">{art.icons.map((i, k) => <svg key={k} width="24" height="24"><use href={`#${i}`} /></svg>)}{art.garland.slice(0, 3).map((g, k) => <svg key={`g${k}`} width="22" height="22" style={g.color ? { color: g.color } : undefined}><use href={`#${g.sym}`} /></svg>)}</div>
              {ev.id === 'paques' ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                  <span>La date change chaque année :</span>
                  <input type="number" min={0} max={30} value={s.easterBefore} onChange={(e) => edit(ev.id, { easterBefore: Number(e.target.value) })} style={{ width: 62 }} aria-label="Jours avant Pâques" /> jours avant
                  <input type="number" min={0} max={30} value={s.easterAfter} onChange={(e) => edit(ev.id, { easterAfter: Number(e.target.value) })} style={{ width: 62 }} aria-label="Jours après Pâques" /> jours après le dimanche
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                  Du <input type="date" value={toDateInput(s.from)} onChange={(e) => e.target.value && edit(ev.id, { from: fromDateInput(e.target.value) })} aria-label="Début" />
                  au <input type="date" value={toDateInput(s.to)} onChange={(e) => e.target.value && edit(ev.id, { to: fromDateInput(e.target.value) })} aria-label="Fin" />
                  <span className="muted" style={{ fontSize: 11.5 }}>chaque année</span>
                </div>
              )}
              <div className="muted" style={{ fontSize: 12.5 }}>
                {w.running ? `En cours : du ${mmdd(w.start)} au ${mmdd(w.end)}.` : `Prochaine période : du ${mmdd(w.start)} au ${mmdd(w.end)} (dans ${days} jour${days > 1 ? 's' : ''}).`}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" className="secondary" onClick={() => setPreview(preview === ev.id ? null : ev.id)}>{preview === ev.id ? '⏹ Arrêter l\'aperçu' : '👁️ Aperçu'}</button>
                <select value={hours[ev.id] ?? '24'} onChange={(e) => setHours({ ...hours, [ev.id]: e.target.value })} aria-label="Durée">
                  <option value="1">1 heure</option><option value="24">24 heures</option><option value="168">7 jours</option><option value="0">Jusqu'à l'arrêt</option>
                </select>
                <button type="button" onClick={() => force(ev.id, Number(hours[ev.id] ?? '24') || null)} disabled={busy || isForced}>{isForced ? '⚡ Actif pour tous' : '⚡ Activer maintenant pour tous'}</button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={save} disabled={busy || !dirty}>Enregistrer le calendrier</button>
        {dirty && <span className="muted" style={{ fontSize: 13 }}>Modifications non enregistrées.</span>}
        <span className="muted" style={{ fontSize: 12.5, marginLeft: 'auto' }}>Fuseau : {cfg.timezone}. Quand deux périodes se chevauchent, la première de la liste l'emporte.</span>
      </div>
    </div>
  );
}
