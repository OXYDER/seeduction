import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';

interface Invite {
  id: string; code: string; label: string | null; generic: boolean; createdAt: string; startsAt: string | null; expiresAt: string | null;
  maxUses: number; useCount: number; perIpOnce: boolean; disabled: boolean; createdBy: { id: string; username: string };
  status: 'active' | 'scheduled' | 'expired' | 'exhausted' | 'disabled';
}
interface InviteUse { id: string; ip: string | null; createdAt: string; user: { id: string; username: string; email: string } | null }

const DURATIONS: { label: string; hours: number | null }[] = [
  { label: '1 heure', hours: 1 }, { label: '24 heures', hours: 24 }, { label: '7 jours', hours: 168 }, { label: '30 jours', hours: 720 }, { label: 'Sans limite', hours: null },
];
const STATUS_LABEL: Record<Invite['status'], string> = { active: 'Actif', scheduled: 'Programmé', expired: 'Expiré', exhausted: 'Épuisé', disabled: 'Désactivé' };
const dt = (iso: string) => new Date(iso).toLocaleString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
/** Valeur d'un champ datetime-local (heure locale) pour « maintenant + X heures ». */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** Admin > Invitations : codes génériques avec durée, nombre d'inscriptions, début programmé et limite d'une inscription par IP. */
export function InvitesAdmin() {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [includeMembers, setIncludeMembers] = useState(false);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [error, setError] = useState('');
  const [created, setCreated] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [openUses, setOpenUses] = useState<string | null>(null);
  const [uses, setUses] = useState<InviteUse[]>([]);
  const [copied, setCopied] = useState('');

  // Modification d'un code existant
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ code: '', label: '', startsAt: '', expiresAt: '', maxUses: 1, perIpOnce: false });
  const [editError, setEditError] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  // Formulaire
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [duration, setDuration] = useState<number | null | 'custom'>(168);
  const [customEnd, setCustomEnd] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [maxUses, setMaxUses] = useState(1);
  const [perIpOnce, setPerIpOnce] = useState(false);
  const [count, setCount] = useState(1);

  const load = useCallback(() => {
    api.get('/admin/invites', { params: { members: includeMembers ? 1 : 0 } }).then((r) => setInvites(r.data)).catch((e) => setError(e.response?.data?.message ?? 'Chargement impossible'));
  }, [includeMembers]);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setCreated([]); setBusy(true);
    try {
      const start = scheduled && startsAt ? new Date(startsAt) : null;
      let expiresAt: string | null = null;
      if (duration === 'custom') expiresAt = customEnd ? new Date(customEnd).toISOString() : null;
      else if (duration !== null) expiresAt = new Date((start ?? new Date()).getTime() + duration * 3600_000).toISOString();
      const { data } = await api.post('/admin/invites', {
        code: code.trim() || undefined, label, startsAt: start ? start.toISOString() : null, expiresAt, maxUses, perIpOnce, count: code.trim() ? 1 : count,
      });
      setCreated(data.codes);
      setCode('');
      load();
    } catch (err: any) { setError(err.response?.data?.message ?? 'Création impossible'); }
    finally { setBusy(false); }
  }

  async function patch(i: Invite, body: Record<string, any>) {
    setError('');
    try { await api.patch(`/admin/invites/${i.id}`, body); load(); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
  }

  async function remove(i: Invite) {
    if (!window.confirm(`Supprimer le code ${i.code} ? Les comptes déjà créés ne sont pas touchés.`)) return;
    try { await api.delete(`/admin/invites/${i.id}`); load(); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Suppression impossible'); }
  }

  async function toggleUses(i: Invite) {
    if (openUses === i.id) { setOpenUses(null); return; }
    setOpenUses(i.id); setUses([]);
    api.get(`/admin/invites/${i.id}/uses`).then((r) => setUses(r.data)).catch(() => {});
  }

  function startEdit(i: Invite) {
    if (editing === i.id) { setEditing(null); return; }
    setEditing(i.id); setEditError('');
    setEdit({ code: i.code, label: i.label ?? '', startsAt: i.startsAt ? localInput(new Date(i.startsAt)) : '', expiresAt: i.expiresAt ? localInput(new Date(i.expiresAt)) : '', maxUses: i.maxUses, perIpOnce: i.perIpOnce });
  }

  async function saveEdit(i: Invite) {
    setEditError(''); setEditBusy(true);
    try {
      const body: Record<string, any> = {
        label: edit.label, maxUses: edit.maxUses, perIpOnce: edit.perIpOnce,
        startsAt: edit.startsAt ? new Date(edit.startsAt).toISOString() : null,
        expiresAt: edit.expiresAt ? new Date(edit.expiresAt).toISOString() : null,
      };
      if (i.generic && edit.code !== i.code) body.code = edit.code;
      await api.patch(`/admin/invites/${i.id}`, body);
      setEditing(null);
      load();
    } catch (err: any) { setEditError(err.response?.data?.message ?? 'Modification impossible'); }
    finally { setEditBusy(false); }
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => { setCopied(text); setTimeout(() => setCopied(''), 1500); }).catch(() => {});
  }

  const link = (c: string) => `${window.location.origin}/register?code=${encodeURIComponent(c)}`;
  const shown = (invites ?? []).filter((i) => filter === 'all' || i.status === 'active' || i.status === 'scheduled');

  return (
    <div className="grid">
      <form className="panel" onSubmit={create} style={{ display: 'grid', gap: 14 }}>
        <h3 style={{ margin: 0 }}>Nouveau code d'invitation</h3>

        <div className="inv-grid">
          <label>
            <span className="muted">Code (laisse vide pour un code aléatoire)</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} placeholder="ex : FAMILLE2026" maxLength={32} />
          </label>
          <label>
            <span className="muted">Note interne (facultatif)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex : amis du hockey" maxLength={80} />
          </label>
        </div>

        <div>
          <div className="muted" style={{ marginBottom: 6 }}>Valide pendant</div>
          <div className="inv-chips">
            {DURATIONS.map((d) => <button key={d.label} type="button" className={`secondary${duration === d.hours ? ' on' : ''}`} onClick={() => setDuration(d.hours)}>{d.label}</button>)}
            <button type="button" className={`secondary${duration === 'custom' ? ' on' : ''}`} onClick={() => setDuration('custom')}>Date précise…</button>
          </div>
          {duration === 'custom' && <input type="datetime-local" value={customEnd} min={localInput(new Date())} onChange={(e) => setCustomEnd(e.target.value)} style={{ marginTop: 8 }} />}
          <label className="inv-check">
            <input type="checkbox" checked={scheduled} onChange={(e) => { setScheduled(e.target.checked); if (e.target.checked && !startsAt) setStartsAt(localInput(new Date(Date.now() + 3600_000))); }} />
            Programmer le début (le code ne fonctionne qu'à partir de…)
          </label>
          {scheduled && <input type="datetime-local" value={startsAt} min={localInput(new Date())} onChange={(e) => setStartsAt(e.target.value)} />}
          {scheduled && duration !== 'custom' && duration !== null && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>La durée compte à partir du début programmé.</div>}
        </div>

        <div className="inv-grid">
          <label>
            <span className="muted">Nombre de comptes créables avec ce code</span>
            <input type="number" min={1} max={1000} value={maxUses} onChange={(e) => setMaxUses(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))} />
          </label>
          {!code.trim() && (
            <label>
              <span className="muted">Nombre de codes à créer (aléatoires)</span>
              <input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
            </label>
          )}
        </div>

        <label className="inv-check">
          <input type="checkbox" checked={perIpOnce} onChange={(e) => setPerIpOnce(e.target.checked)} />
          <span><strong>Une seule inscription par adresse IP</strong> <span className="muted">— chaque IP ne peut créer qu'un compte avec ce code (un foyer entier partage souvent la même IP).</span></span>
        </label>

        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
        <div><button type="submit" disabled={busy || (duration === 'custom' && !customEnd)}>{busy ? 'Création…' : 'Créer'}</button></div>

        {created.length > 0 && (
          <div className="inv-created" role="status">
            <strong>✓ {created.length > 1 ? `${created.length} codes créés` : 'Code créé'}</strong>
            {created.map((c) => (
              <div key={c} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <code className="inv-code">{c}</code>
                <button type="button" className="secondary" onClick={() => copy(c)}>{copied === c ? '✓ Copié' : 'Copier le code'}</button>
                <button type="button" className="secondary" onClick={() => copy(link(c))}>{copied === link(c) ? '✓ Copié' : 'Copier le lien d\'inscription'}</button>
              </div>
            ))}
          </div>
        )}
      </form>

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Codes</h3>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className={`secondary${filter === 'open' ? ' on' : ''}`} onClick={() => setFilter('open')}>En service</button>
            <button type="button" className={`secondary${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>Tous</button>
            <label className="inv-check" style={{ margin: 0 }}><input type="checkbox" checked={includeMembers} onChange={(e) => setIncludeMembers(e.target.checked)} /> Inclure les codes des membres</label>
          </div>
        </div>

        {invites === null ? <p className="muted">Chargement…</p> : shown.length === 0 ? <p className="muted">Aucun code.</p> : (
          <div className="inv-list">
            {shown.map((i) => (
              <div key={i.id} className={`inv-row ${i.status}`}>
                <div className="inv-main">
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <code className="inv-code">{i.code}</code>
                    <span className={`inv-status ${i.status}`}>{STATUS_LABEL[i.status]}</span>
                    {i.perIpOnce && <span className="badge double" title="Une seule inscription par adresse IP">1 / IP</span>}
                    {!i.generic && <span className="muted" style={{ fontSize: 12 }}>code de {i.createdBy.username}</span>}
                    {i.label && <span className="muted">· {i.label}</span>}
                  </div>
                  <div className="muted inv-meta">
                    <span>👥 {i.useCount} / {i.maxUses}</span>
                    {i.startsAt && <span>▶ dès le {dt(i.startsAt)}</span>}
                    <span>{i.expiresAt ? `⏳ jusqu'au ${dt(i.expiresAt)}` : '⏳ sans limite de temps'}</span>
                    <span>créé {timeAgo(i.createdAt)} par {i.createdBy.username}</span>
                  </div>
                </div>
                <div className="inv-actions">
                  <button type="button" className="secondary" onClick={() => copy(link(i.code))}>{copied === link(i.code) ? '✓' : '🔗 Lien'}</button>
                  <button type="button" className="secondary" onClick={() => toggleUses(i)}>Inscriptions ({i.useCount})</button>
                  <button type="button" className={`secondary${editing === i.id ? ' on' : ''}`} onClick={() => startEdit(i)}>✏️ Modifier</button>
                  {i.status === 'expired' || i.status === 'active' || i.status === 'scheduled' || i.status === 'exhausted'
                    ? <>
                        <button type="button" className="secondary" onClick={() => patch(i, { expiresAt: new Date(Math.max(Date.now(), i.expiresAt ? new Date(i.expiresAt).getTime() : Date.now()) + 7 * 86400_000).toISOString() })}>+7 j</button>
                        {i.status === 'exhausted' && <button type="button" className="secondary" onClick={() => patch(i, { maxUses: i.useCount + 5 })}>+5 places</button>}
                        {i.status !== 'expired' && <button type="button" className="secondary" onClick={() => patch(i, { disabled: true })}>Désactiver</button>}
                      </>
                    : <button type="button" onClick={() => patch(i, { disabled: false })}>Réactiver</button>}
                  <button type="button" className="danger" onClick={() => remove(i)}>Supprimer</button>
                </div>
                {editing === i.id && (
                  <form className="inv-edit" onSubmit={(e) => { e.preventDefault(); void saveEdit(i); }}>
                    <div className="inv-grid">
                      <label>
                        <span className="muted">Code</span>
                        <input value={edit.code} disabled={!i.generic} maxLength={32} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} />
                      </label>
                      <label>
                        <span className="muted">Note interne</span>
                        <input value={edit.label} maxLength={80} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="ex : amis du hockey" />
                      </label>
                      <label>
                        <span className="muted">Valable à partir du (vide = tout de suite)</span>
                        <input type="datetime-local" value={edit.startsAt} onChange={(e) => setEdit({ ...edit, startsAt: e.target.value })} />
                      </label>
                      <label>
                        <span className="muted">Valable jusqu'au (vide = sans limite)</span>
                        <input type="datetime-local" value={edit.expiresAt} onChange={(e) => setEdit({ ...edit, expiresAt: e.target.value })} />
                      </label>
                      <label>
                        <span className="muted">Inscriptions permises (déjà {i.useCount})</span>
                        <input type="number" min={Math.max(1, i.useCount)} max={1000} value={edit.maxUses} onChange={(e) => setEdit({ ...edit, maxUses: Math.max(1, Math.min(1000, Number(e.target.value) || 1)) })} />
                      </label>
                    </div>
                    <label className="inv-check">
                      <input type="checkbox" checked={edit.perIpOnce} onChange={(e) => setEdit({ ...edit, perIpOnce: e.target.checked })} />
                      <span>Une seule inscription par adresse IP <span className="muted">(ne s'applique qu'aux nouvelles inscriptions)</span></span>
                    </label>
                    {i.generic && edit.code !== i.code && <div className="muted" style={{ color: '#ffb347' }}>⚠️ Changer le texte du code : l'ancien code et les liens d'inscription déjà envoyés ne fonctionneront plus.</div>}
                    {editError && <div style={{ color: 'var(--danger)' }}>{editError}</div>}
                    <div className="row" style={{ gap: 8 }}>
                      <button type="submit" disabled={editBusy || edit.code.length < 4}>{editBusy ? 'Enregistrement…' : 'Enregistrer'}</button>
                      <button type="button" className="secondary" onClick={() => setEditing(null)}>Annuler</button>
                    </div>
                  </form>
                )}
                {openUses === i.id && (
                  <div className="inv-uses">
                    {uses.length === 0 ? <span className="muted">Aucune inscription pour le moment.</span> : (
                      <table>
                        <thead><tr><th>Membre</th><th>Courriel</th><th>Adresse IP</th><th>Date</th></tr></thead>
                        <tbody>{uses.map((u) => <tr key={u.id}><td>{u.user?.username ?? '(supprimé)'}</td><td>{u.user?.email ?? ''}</td><td><code>{u.ip ?? '?'}</code></td><td>{dt(u.createdAt)}</td></tr>)}</tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
