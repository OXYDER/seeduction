import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface Channel {
  id: string; name: string; slug: string; description: string | null; readRole: string | null; writeRole: string | null;
  slowModeSeconds: number; position: number; archived: boolean; messageCount: number;
}

const ROLES: { value: string; label: string }[] = [
  { value: '', label: 'Tout le monde' },
  { value: 'MODERATOR', label: 'Modérateurs et plus' },
  { value: 'ADMIN', label: 'Administrateurs et plus' },
  { value: 'OWNER', label: 'Propriétaire seulement' },
];
const roleLabel = (v: string | null) => ROLES.find((r) => r.value === (v ?? ''))?.label ?? v ?? '';

const emptyForm = { name: '', description: '', readRole: '', writeRole: '', slowModeSeconds: 0 };

/** Canaux publics du Messenger : créer, régler qui peut lire / écrire, mode lent, ordre, archiver (administrateurs). */
export function ChannelsAdmin() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = () => api.get('/messenger/admin/channels').then((r) => setChannels(r.data)).catch((e) => setError(e.response?.data?.message ?? 'Impossible de charger les canaux'));
  useEffect(() => { load(); }, []);

  function reset() { setForm(emptyForm); setEditingId(null); }

  async function save() {
    setError(''); setMessage('');
    if (!form.name.trim()) { setError('Donne un nom au canal'); return; }
    const body = { ...form, readRole: form.readRole || null, writeRole: form.writeRole || null, slowModeSeconds: Number(form.slowModeSeconds) || 0 };
    try {
      if (editingId) await api.patch(`/messenger/admin/channels/${editingId}`, body);
      else await api.post('/messenger/admin/channels', body);
      setMessage(editingId ? '✓ Canal modifié' : '✓ Canal créé — il apparaît tout de suite chez les membres connectés');
      reset(); load();
    } catch (err: any) { setError(err.response?.data?.message ?? 'Enregistrement impossible'); }
  }

  async function patch(c: Channel, data: Partial<Channel>) {
    setError('');
    try { await api.patch(`/messenger/admin/channels/${c.id}`, data); load(); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Modification impossible'); }
  }

  async function remove(c: Channel) {
    if (!window.confirm(`Supprimer définitivement le canal « ${c.name} » et ses ${c.messageCount} message(s) ?`)) return;
    setError('');
    try { await api.delete(`/messenger/admin/channels/${c.id}`); load(); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Suppression impossible'); }
  }

  function startEdit(c: Channel) {
    setEditingId(c.id);
    setForm({ name: c.name, description: c.description ?? '', readRole: c.readRole ?? '', writeRole: c.writeRole ?? '', slowModeSeconds: c.slowModeSeconds });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <h3>{editingId ? '✏️ Modifier le canal' : '💬 Nouveau canal public'}</h3>
        <p className="muted">
          Un canal est un salon ouvert à tous les membres (ou réservé selon le rôle). Les messages, réactions, réponses, @mentions et épingles marchent comme
          dans les autres conversations ; la modération peut supprimer n'importe quel message.
        </p>
        <div className="grid" style={{ gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <input placeholder="Nom (ex. Films, Aide, Staff…)" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Description (facultative)" value={form.description} maxLength={300} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <label className="muted">Qui peut <strong>lire</strong>
            <select value={form.readRole} onChange={(e) => setForm({ ...form, readRole: e.target.value })}>{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
          </label>
          <label className="muted">Qui peut <strong>écrire</strong> (« Annonces » = réservé au staff)
            <select value={form.writeRole} onChange={(e) => setForm({ ...form, writeRole: e.target.value })}>{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
          </label>
          <label className="muted">Mode lent (secondes entre deux messages, 0 = aucun)
            <input type="number" min={0} max={3600} value={form.slowModeSeconds} onChange={(e) => setForm({ ...form, slowModeSeconds: Number(e.target.value) })} />
          </label>
        </div>
        {error && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
        {message && <div className="muted" style={{ color: 'var(--success)', marginTop: 8 }}>{message}</div>}
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" onClick={save}>{editingId ? 'Enregistrer' : 'Créer le canal'}</button>
          {editingId && <button type="button" className="secondary" onClick={reset}>Annuler</button>}
        </div>
      </div>

      <div className="panel">
        <h3>Canaux ({channels.length})</h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Ordre</th><th>Canal</th><th>Lecture</th><th>Écriture</th><th>Mode lent</th><th>Messages</th><th></th></tr></thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c.id} style={c.archived ? { opacity: 0.55 } : undefined}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="secondary" title="Monter" onClick={() => patch(c, { position: c.position - 1 })}>▲</button>{' '}
                    <button type="button" className="secondary" title="Descendre" onClick={() => patch(c, { position: c.position + 1 })}>▼</button>
                  </td>
                  <td><strong># {c.name}</strong>{c.archived && <span className="badge" style={{ marginLeft: 6 }}>archivé</span>}<div className="muted" style={{ fontSize: 12 }}>{c.description}</div></td>
                  <td className="muted">{roleLabel(c.readRole)}</td>
                  <td className="muted">{roleLabel(c.writeRole)}</td>
                  <td className="muted">{c.slowModeSeconds ? `${c.slowModeSeconds} s` : '—'}</td>
                  <td className="muted">{c.messageCount}</td>
                  <td className="row" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" className="secondary" onClick={() => startEdit(c)}>Éditer</button>
                    {c.slug !== 'general' && <button type="button" className="secondary" onClick={() => patch(c, { archived: !c.archived })}>{c.archived ? 'Désarchiver' : 'Archiver'}</button>}
                    {c.slug !== 'general' && <button type="button" className="danger" onClick={() => remove(c)}>Supprimer</button>}
                  </td>
                </tr>
              ))}
              {channels.length === 0 && <tr><td className="muted" colSpan={7}>Aucun canal pour l'instant.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
