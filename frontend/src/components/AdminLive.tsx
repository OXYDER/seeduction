import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import AdminLivePage, { LivePageCfg } from './AdminLivePage';
import AdminLiveInteractions from './AdminLiveInteractions';

interface Cfg { enabled: boolean; controlUrl: string; playbackUrl: string; onDemand: boolean; timezone: string; transcode: 'copy' | 'audio' | 'full'; secretSet: boolean; page: LivePageCfg }
interface Stream { id: string; name: string; url: string; enabled: boolean }
interface Slot { id: string; streamId: string; title: string | null; description: string | null; posterUrl: string | null; color: string | null; startsAt: string; durationMin: number; repeat: 'NONE' | 'DAILY' | 'WEEKLY'; repeatUntil: string | null; enabled: boolean; stream: { id: string; name: string } }
interface Occ { slotId: string; streamName: string; title: string | null; start: string; end: string }
interface Overview { config: Cfg; streams: Stream[]; slots: Slot[]; now: (Occ & { streamId: string }) | null; next: Occ[]; relay: { lastPushAt: string | null; lastOk: boolean | null; lastError: string | null; pushed: string | null } }

const REPEAT_LABEL = { NONE: 'Une seule fois', DAILY: 'Tous les jours', WEEKLY: 'Chaque semaine' } as const;
const fmt = (iso: string) => new Date(iso).toLocaleString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const hm = (iso: string) => new Date(iso).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
/** Valeur par défaut d'un champ « date et heure » : l'heure ronde qui vient, à l'heure du navigateur. */
/** ISO → valeur d'un champ « date et heure » (heure du navigateur). */
const toLocalInput = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const nextHour = () => { const d = new Date(Date.now() + 3600_000); d.setMinutes(0, 0, 0); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const hostOf = (url: string) => { try { return new URL(url).host; } catch { return url.slice(0, 30); } };
const DURATIONS = [[30, '30 min'], [60, '1 h'], [90, '1 h 30'], [120, '2 h'], [180, '3 h'], [240, '4 h']] as const;

/** Admin > Direct : le relais, les flux (adresses de ton Dispatcharr) et le calendrier qui décide quel flux est diffusé à quel moment. */
export default function AdminLive() {
  const [data, setData] = useState<Overview | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get('/admin/live').then((r) => setData(r.data)).catch(() => setErr('Chargement impossible')), []);
  useEffect(() => { void load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const [cfg, setCfg] = useState<(Cfg & { secret: string }) | null>(null);
  useEffect(() => { if (data && !cfg) setCfg({ ...data.config, secret: '' }); }, [data, cfg]);

  const [sName, setSName] = useState('');
  const [sUrl, setSUrl] = useState('');
  const [edit, setEdit] = useState<{ id: string; name: string; url: string } | null>(null);
  const emptySlot = () => ({ streamId: '', title: '', description: '', posterUrl: '', color: '', startsAt: nextHour(), durationMin: 120, repeat: 'NONE' as Slot['repeat'], repeatUntil: '' });
  const [slot, setSlot] = useState(emptySlot);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const editSlot = (s: Slot) => {
    setEditingSlot(s.id);
    setSlot({
      streamId: s.streamId, title: s.title ?? '', description: s.description ?? '', posterUrl: s.posterUrl ?? '', color: s.color ?? '',
      startsAt: toLocalInput(s.startsAt), durationMin: s.durationMin, repeat: s.repeat, repeatUntil: s.repeatUntil ? toLocalInput(s.repeatUntil).slice(0, 10) : '',
    });
  };

  async function run(fn: () => Promise<any>, ok: string) {
    setMsg(''); setErr('');
    try { await fn(); setMsg(ok); await load(); } catch (e: any) { setErr(e.response?.data?.message ?? 'Erreur'); }
  }

  if (!data || !cfg) return err ? <p style={{ color: 'var(--danger)' }}>{err}</p> : <p className="muted">Chargement…</p>;
  const streamId = slot.streamId || data.streams[0]?.id || '';

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="panel" style={{ display: 'grid', gap: 8 }}>
        <h2 style={{ margin: 0 }}>📡 Directs planifiés</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Tu enregistres tes flux (les adresses de ton Dispatcharr) et un calendrier : le site dit au serveur relais quel flux diffuser à chaque moment, et les membres le regardent sur la page <a href="/direct">Direct</a>.
          Les adresses de tes flux ne sont jamais montrées aux membres.
        </p>
        <div style={{ fontWeight: 700 }}>
          {data.now ? <>🔴 En ce moment : {data.now.title ?? data.now.streamName} <span className="muted" style={{ fontWeight: 400 }}>· jusqu'à {hm(data.now.end)}</span></> : <span className="muted">⚪ Aucune diffusion en ce moment.</span>}
        </div>
        {(msg || err) && <div style={{ color: err ? 'var(--danger)' : 'var(--success)' }}>{err || msg}</div>}
      </div>

      <div className="panel" style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0 }}>1. Le relais</h3>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Ces trois informations sont affichées à la fin de l'installation du relais (ou avec <code>sudo bash installer-relais.sh --infos</code> sur le serveur relais).</p>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Directs activés</label>
        <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Adresse de contrôle
          <input value={cfg.controlUrl} onChange={(e) => setCfg({ ...cfg, controlUrl: e.target.value })} placeholder="https://relais.exemple.com/controle" />
        </label>
        <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Secret
          <input type="password" autoComplete="new-password" value={cfg.secret} onChange={(e) => setCfg({ ...cfg, secret: e.target.value })} placeholder={cfg.secretSet ? '(enregistré : laisse vide pour le garder)' : 'Colle le secret du relais'} />
        </label>
        <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Adresse du flux que les membres regardent
          <input value={cfg.playbackUrl} onChange={(e) => setCfg({ ...cfg, playbackUrl: e.target.value })} placeholder="https://relais.exemple.com/live/…/index.m3u8" />
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={cfg.onDemand} onChange={(e) => setCfg({ ...cfg, onDemand: e.target.checked })} style={{ marginTop: 3 }} />
          <span>Se connecter à ton Dispatcharr seulement quand quelqu'un regarde<br /><span className="muted" style={{ fontSize: 12 }}>Recommandé : rien ne sort de chez toi tant que personne ne regarde (quelques secondes d'attente pour le premier spectateur). Décoché : le relais reste connecté pendant tout le créneau.</span></span>
        </label>
        <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Compatibilité navigateur
          <select value={cfg.transcode} onChange={(e) => setCfg({ ...cfg, transcode: e.target.value as Cfg['transcode'] })} style={{ maxWidth: 420 }}>
            <option value="audio">Convertir le son seulement (AAC) : recommandé</option>
            <option value="copy">Copier tel quel (le plus léger)</option>
            <option value="full">Convertir l'image et le son (H.264 + AAC)</option>
          </select>
          <span className="muted" style={{ fontSize: 12 }}>Un navigateur lit l'image en H.264 et le son en AAC. Un navigateur lit mal l'AC3, l'E-AC3 ou le DTS : « le son seulement » règle le plus souvent l'absence de son. Si l'image reste noire, choisis « l'image et le son », qui demande beaucoup plus de processeur sur le relais (environ 1 à 4 cœurs par flux selon la taille de l'image).</span>
        </label>
        <label style={{ display: 'grid', gap: 3, fontSize: 13, maxWidth: 280 }}>Fuseau horaire des répétitions
          <input value={cfg.timezone} onChange={(e) => setCfg({ ...cfg, timezone: e.target.value })} />
        </label>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => run(async () => { const { secret, secretSet, page, ...body } = cfg; const r = await api.put('/admin/live/config', { ...body, secret }); setCfg({ ...r.data, secret: '' }); }, '✓ Réglages enregistrés')}>Enregistrer</button>
          <button type="button" className="secondary" onClick={() => run(async () => { const r = (await api.post('/admin/live/test')).data; if (!r.ok) throw { response: { data: { message: `Relais injoignable : ${r.error}` } } }; }, '✓ Le relais répond et accepte le secret')}>Tester le relais</button>
          <button type="button" className="secondary" onClick={() => run(() => api.post('/admin/live/sync'), '✓ État envoyé au relais')}>Renvoyer l'état maintenant</button>
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          Dernier envoi au relais : {data.relay.lastPushAt ? `${new Date(data.relay.lastPushAt).toLocaleTimeString('fr-CA')} · ${data.relay.lastOk ? `✓ (${data.relay.pushed})` : `✗ ${data.relay.lastError}`}` : 'aucun pour l\'instant'}
        </div>
      </div>

      <AdminLiveInteractions />

      <div className="panel" style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0 }}>2. Tes flux</h3>
        {data.streams.length === 0 && <p className="muted" style={{ margin: 0 }}>Aucun flux. Ajoute le premier ci-dessous (par exemple l'adresse d'un canal de Dispatcharr).</p>}
        {data.streams.map((s) => edit?.id === s.id ? (
          <div key={s.id} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} style={{ width: 180 }} />
            <input value={edit.url} onChange={(e) => setEdit({ ...edit, url: e.target.value })} style={{ flex: 1, minWidth: 260 }} />
            <button type="button" onClick={() => run(async () => { await api.put(`/admin/live/streams/${s.id}`, { name: edit.name, url: edit.url }); setEdit(null); }, '✓ Flux modifié')}>OK</button>
            <button type="button" className="secondary" onClick={() => setEdit(null)}>Annuler</button>
          </div>
        ) : (
          <div key={s.id} className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <strong style={{ minWidth: 140 }}>{s.name}</strong>
            <span className="muted" style={{ fontSize: 12.5 }}>{hostOf(s.url)}/…</span>
            <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={s.enabled} onChange={(e) => run(() => api.put(`/admin/live/streams/${s.id}`, { enabled: e.target.checked }), '✓ Flux mis à jour')} /> Actif</label>
            <button type="button" className="secondary" onClick={() => setEdit({ id: s.id, name: s.name, url: s.url })}>Modifier</button>
            <button type="button" className="secondary" onClick={() => window.confirm(`Supprimer le flux « ${s.name} » et ses créneaux du calendrier ?`) && run(() => api.delete(`/admin/live/streams/${s.id}`), '✓ Flux supprimé')}>Supprimer</button>
          </div>
        ))}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input value={sName} onChange={(e) => setSName(e.target.value)} placeholder="Nom (ex. Podcast du mardi)" style={{ width: 200 }} />
          <input value={sUrl} onChange={(e) => setSUrl(e.target.value)} placeholder="http://100.x.y.z:9191/proxy/ts/stream/…" style={{ flex: 1, minWidth: 260 }} />
          <button type="button" onClick={() => run(async () => { await api.post('/admin/live/streams', { name: sName, url: sUrl }); setSName(''); setSUrl(''); }, '✓ Flux ajouté')}>Ajouter le flux</button>
        </div>
      </div>

      <div className="panel" style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0 }}>3. Calendrier</h3>
        {data.streams.length === 0 ? <p className="muted" style={{ margin: 0 }}>Ajoute d'abord un flux.</p> : (
          <div id="live-slot-form" style={{ display: 'grid', gap: 8 }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Flux
                <select value={streamId} onChange={(e) => setSlot({ ...slot, streamId: e.target.value })}>{data.streams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </label>
              <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Début
                <input type="datetime-local" value={slot.startsAt} onChange={(e) => setSlot({ ...slot, startsAt: e.target.value })} />
              </label>
              <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Durée
                <select value={slot.durationMin} onChange={(e) => setSlot({ ...slot, durationMin: Number(e.target.value) })}>
                  {DURATIONS.map(([m, l]) => <option key={m} value={m}>{l}</option>)}
                  {!DURATIONS.some(([m]) => m === slot.durationMin) && <option value={slot.durationMin}>{slot.durationMin} min</option>}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Répétition
                <select value={slot.repeat} onChange={(e) => setSlot({ ...slot, repeat: e.target.value as Slot['repeat'] })}>{Object.entries(REPEAT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </label>
              {slot.repeat !== 'NONE' && (
                <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Jusqu'au (facultatif)
                  <input type="date" value={slot.repeatUntil} onChange={(e) => setSlot({ ...slot, repeatUntil: e.target.value })} />
                </label>
              )}
              <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Titre affiché (facultatif)
                <input value={slot.title} onChange={(e) => setSlot({ ...slot, title: e.target.value })} placeholder="Nom du flux par défaut" style={{ width: 200 }} />
              </label>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 3, fontSize: 13, flex: 1, minWidth: 240 }}>Description (facultatif, affichée aux membres)
                <textarea rows={2} value={slot.description} onChange={(e) => setSlot({ ...slot, description: e.target.value })} maxLength={500} />
              </label>
              <label style={{ display: 'grid', gap: 3, fontSize: 13, flex: 1, minWidth: 220 }}>Image de l'écran avant la diffusion (facultatif)
                <input value={slot.posterUrl} onChange={(e) => setSlot({ ...slot, posterUrl: e.target.value })} placeholder="https://… ou /api/covers/…" />
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={!!slot.color} onChange={(e) => setSlot({ ...slot, color: e.target.checked ? '#7c3aed' : '' })} /> Couleur à lui
                {slot.color && <input type="color" value={slot.color} onChange={(e) => setSlot({ ...slot, color: e.target.value })} style={{ width: 36, height: 26, padding: 0, border: 'none', background: 'none' }} />}
              </label>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => run(async () => {
                const body = {
                  streamId, title: slot.title || null, description: slot.description || null, posterUrl: slot.posterUrl || null, color: slot.color || null,
                  startsAt: new Date(slot.startsAt).toISOString(), durationMin: slot.durationMin, repeat: slot.repeat,
                  repeatUntil: slot.repeat !== 'NONE' && slot.repeatUntil ? new Date(`${slot.repeatUntil}T23:59:59`).toISOString() : null,
                };
                if (editingSlot) await api.put(`/admin/live/slots/${editingSlot}`, body); else await api.post('/admin/live/slots', body);
                setEditingSlot(null);
                setSlot(emptySlot());
              }, editingSlot ? '✓ Créneau modifié' : '✓ Créneau ajouté')}>{editingSlot ? 'Enregistrer les modifications' : 'Ajouter au calendrier'}</button>
              {editingSlot && <button type="button" className="secondary" onClick={() => { setEditingSlot(null); setSlot(emptySlot()); }}>Annuler</button>}
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>Les heures sont celles de ton navigateur. Une diffusion répétée garde la même heure locale toute l'année (changement d'heure compris). Si deux créneaux se chevauchent, le plus récent remplace l'autre.</p>
          </div>
        )}

        {data.slots.length > 0 && (
          <table style={{ width: '100%', fontSize: 13.5 }}>
            <thead><tr style={{ textAlign: 'left' }}><th>Flux</th><th>Début</th><th>Durée</th><th>Répétition</th><th></th></tr></thead>
            <tbody>
              {data.slots.map((s) => (
                <tr key={s.id} style={s.enabled ? undefined : { opacity: 0.5 }}>
                  <td>{s.color && <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: s.color, marginRight: 6 }} />}{s.title ? `${s.title} ` : ''}<span className="muted">({s.stream.name})</span>{s.description && <div className="muted" style={{ fontSize: 12 }}>{s.description}</div>}</td>
                  <td>{fmt(s.startsAt)}</td>
                  <td>{s.durationMin >= 60 ? `${Math.floor(s.durationMin / 60)} h${s.durationMin % 60 ? ` ${s.durationMin % 60}` : ''}` : `${s.durationMin} min`}</td>
                  <td>{REPEAT_LABEL[s.repeat]}{s.repeatUntil ? ` jusqu'au ${new Date(s.repeatUntil).toLocaleDateString('fr-CA')}` : ''}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" className="secondary" onClick={() => { editSlot(s); document.getElementById('live-slot-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>Modifier</button>{' '}
                    <button type="button" className="secondary" onClick={() => run(() => api.put(`/admin/live/slots/${s.id}`, { enabled: !s.enabled }), s.enabled ? '✓ Créneau désactivé' : '✓ Créneau réactivé')}>{s.enabled ? 'Désactiver' : 'Réactiver'}</button>{' '}
                    <button type="button" className="secondary" onClick={() => window.confirm('Supprimer ce créneau ?') && run(() => api.delete(`/admin/live/slots/${s.id}`), '✓ Créneau supprimé')}>Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {data.next.length > 0 && (
          <div>
            <strong style={{ fontSize: 13 }}>Prochaines diffusions (14 jours)</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13.5 }}>
              {data.next.map((o, i) => <li key={`${o.slotId}-${i}`}>{fmt(o.start)} → {hm(o.end)} · {o.title ?? o.streamName}{o.title ? <span className="muted"> ({o.streamName})</span> : null}</li>)}
            </ul>
          </div>
        )}
      </div>

      <AdminLivePage initial={cfg.page} onSaved={(page) => setCfg({ ...cfg, page })} />
    </div>
  );
}
