import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api/client';
import { useMessenger, statusOf } from '../../store/messenger';
import { STATUS_COLOR } from '../../lib/presence';
import Avatar from '../Avatar';
import SearchBox from '../SearchBox';

interface Friend { id: string; username: string; avatarUrl?: string | null }

/** Nouvelle discussion (un ami ou n'importe quel membre) ou nouveau groupe (amis seulement). */
export default function NewChatModal({ onClose, onOpened, initialTab = 'direct' }: { onClose: () => void; onOpened: (conversationId: string) => void; initialTab?: 'direct' | 'group' }) {
  const online = useMessenger((s) => s.online);
  const openDirect = useMessenger((s) => s.openDirect);
  const [tab, setTab] = useState<'direct' | 'group'>(initialTab);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('');
  const [member, setMember] = useState('');
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/friends').then((r) => setFriends(r.data.friends ?? [])).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const shown = useMemo(() => {
    const t = filter.trim().toLowerCase();
    const list = friends.filter((f) => !t || f.username.toLowerCase().includes(t));
    return list.sort((a, b) => Number(statusOf(online, b.id) !== 'OFFLINE') - Number(statusOf(online, a.id) !== 'OFFLINE') || a.username.localeCompare(b.username));
  }, [friends, filter, online]);

  async function chatWith(user: Friend) {
    setBusy(true);
    const conv = await openDirect(user, { window: false });
    setBusy(false);
    if (conv) { onOpened(conv.id); onClose(); }
  }

  async function createGroup() {
    if (!name.trim() || picked.size < 1) return;
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/messenger/groups', { name: name.trim(), memberIds: [...picked] });
      await useMessenger.getState().loadConversations();
      onOpened(data.id);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Création impossible');
    } finally { setBusy(false); }
  }

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return createPortal(
    <div className="msgr-modal-backdrop" onClick={onClose}>
      <div className="msgr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Nouvelle discussion">
        <div className="msgr-modal-head">
          <strong>✏️ Nouvelle discussion</strong>
          <button type="button" className="dm-icon-btn" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className={tab === 'direct' ? '' : 'secondary'} onClick={() => setTab('direct')}>Un membre</button>
          <button type="button" className={tab === 'group' ? '' : 'secondary'} onClick={() => setTab('group')}>👥 Nouveau groupe</button>
        </div>

        {tab === 'direct' && (
          <>
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Chercher n'importe quel membre</div>
              <SearchBox placeholder="Nom d'utilisateur…" value={member} onChange={setMember} scopes={['users']} onPickUser={(u) => chatWith({ id: u.id, username: u.username })} inputStyle={{ width: '100%' }} />
            </div>
            <div className="muted" style={{ fontSize: 12 }}>Ou un de tes amis</div>
            <input placeholder="Filtrer mes amis…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <div className="msgr-share-list">
              {!loaded && <p className="muted">Chargement…</p>}
              {loaded && shown.length === 0 && <p className="muted">Aucun ami pour l'instant — ajoute des membres depuis la page Amis, ou cherche un membre ci-dessus.</p>}
              {shown.map((f) => (
                <button key={f.id} type="button" className="msgr-share-item" disabled={busy} onClick={() => chatWith(f)}>
                  <span className="msgr-conv-avatar" style={{ width: 34, height: 34 }}>
                    <Avatar user={f} size={34} />
                    <span className="msgr-status-dot" style={{ background: STATUS_COLOR[statusOf(online, f.id)], width: 10, height: 10 }} />
                  </span>
                  <strong>{f.username}</strong>
                </button>
              ))}
            </div>
          </>
        )}

        {tab === 'group' && (
          <>
            <input placeholder="Nom du groupe" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
            <div className="muted" style={{ fontSize: 12 }}>Ajoute des amis ({picked.size} choisi{picked.size > 1 ? 's' : ''})</div>
            <input placeholder="Filtrer mes amis…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <div className="msgr-share-list">
              {loaded && shown.length === 0 && <p className="muted">Un groupe ne peut contenir que des amis : ajoute d'abord des membres depuis la page Amis.</p>}
              {shown.map((f) => (
                <label key={f.id} className="msgr-share-item">
                  <input type="checkbox" style={{ width: 'auto' }} checked={picked.has(f.id)} onChange={() => toggle(f.id)} />
                  <Avatar user={f} size={30} />
                  <strong>{f.username}</strong>
                </label>
              ))}
            </div>
            {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
            <button type="button" disabled={busy || !name.trim() || picked.size < 1} onClick={createGroup}>Créer le groupe</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
