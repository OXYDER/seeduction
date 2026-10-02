import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { statusOf, useMessenger } from '../../store/messenger';
import { STATUS_COLOR, STATUS_LABEL } from '../../lib/presence';
import { formatBytes } from '../../lib/format';
import Avatar from '../Avatar';
import ConvAvatar from './ConvAvatar';
import Lightbox from './Lightbox';

const ROLE_LABEL: Record<string, string> = { OWNER: 'Propriétaire', SUPER_MODERATOR: 'Super modérateur', ADMIN: 'Administrateur', MEMBER: '' };

/** Panneau de droite : membres et réglages d'un groupe, médias partagés, personnes en ligne d'un canal. */
export default function ConversationInfo({ conversationId, onClose, onLeft }: { conversationId: string; onClose: () => void; onLeft: () => void }) {
  const me = useAuthStore((s) => s.user);
  const conv = useMessenger((s) => s.conversations.find((c) => c.id === conversationId));
  const thread = useMessenger((s) => s.threads[conversationId]);
  const online = useMessenger((s) => s.online);
  const onlineList = useMessenger((s) => s.onlineList);
  const openDirect = useMessenger((s) => s.openDirect);
  const loadConversations = useMessenger((s) => s.loadConversations);
  const [friends, setFriends] = useState<{ id: string; username: string; avatarUrl?: string | null }[]>([]);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [name, setName] = useState(conv?.name ?? '');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setName(conv?.name ?? ''); setAdding(false); setPicked(new Set()); setError(''); }, [conversationId, conv?.name]);
  useEffect(() => {
    if (conv?.type === 'GROUP') api.get('/friends').then((r) => setFriends(r.data.friends ?? [])).catch(() => {});
  }, [conv?.type, conversationId]);

  const media = useMemo(() => (thread?.messages ?? []).filter((m) => !m.deleted && (m.type === 'IMAGE' || m.type === 'GIF') && m.imageUrl).slice(-12).reverse(), [thread?.messages]);
  const files = useMemo(() => (thread?.messages ?? []).filter((m) => !m.deleted && m.type === 'FILE' && m.fileUrl).slice(-6).reverse(), [thread?.messages]);

  if (!conv) return null;
  const isAdmin = conv.type === 'GROUP' && conv.myRole !== 'MEMBER';
  const isOwner = conv.type === 'GROUP' && conv.myRole === 'OWNER';
  const members = conv.members ?? [];
  const candidates = friends.filter((f) => !members.some((m) => m.id === f.id));

  async function act(fn: () => Promise<any>) {
    setBusy(true); setError('');
    try { await fn(); await loadConversations(); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
    finally { setBusy(false); }
  }

  const rename = () => name.trim() && name.trim() !== conv.name && act(() => api.patch(`/messenger/conversations/${conv.id}`, { name: name.trim() }));
  const addMembers = () => act(async () => { await api.post(`/messenger/conversations/${conv.id}/members`, { userIds: [...picked] }); setAdding(false); setPicked(new Set()); });
  const removeMember = (userId: string, label: string) => window.confirm(`Retirer ${label} du groupe ?`) && act(() => api.delete(`/messenger/conversations/${conv.id}/members/${userId}`));
  const setRole = (userId: string, role: 'ADMIN' | 'MEMBER') => act(() => api.patch(`/messenger/conversations/${conv.id}/members/${userId}`, { role }));
  const leave = () => window.confirm('Quitter ce groupe ?') && act(async () => { await api.delete(`/messenger/conversations/${conv.id}/members/${me?.id}`); onLeft(); });
  async function uploadIcon(file: File | undefined) {
    if (!file) return;
    const form = new FormData(); form.append('file', file);
    act(async () => { const { data } = await api.post('/messenger/upload', form); await api.patch(`/messenger/conversations/${conv!.id}`, { iconUrl: data.url }); });
  }

  return (
    <aside className="msgr-info">
      <div className="msgr-info-head">
        <strong>Infos</strong>
        <button type="button" className="dm-icon-btn" onClick={onClose} aria-label="Fermer">✕</button>
      </div>

      <div className="msgr-info-id">
        <ConvAvatar conv={conv} size={84} />
        {conv.type === 'GROUP' && isAdmin
          ? (
            <div className="row" style={{ gap: 6, width: '100%' }}>
              <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && rename()} aria-label="Nom du groupe" />
              <button type="button" disabled={busy || !name.trim() || name.trim() === conv.name} onClick={rename}>OK</button>
            </div>
          )
          : <strong style={{ fontSize: 17 }}>{conv.type === 'CHANNEL' ? '# ' : ''}{conv.name}</strong>}
        {conv.type === 'DIRECT' && conv.other && (
          <span className="muted"><span className="msgr-inline-dot" style={{ background: STATUS_COLOR[statusOf(online, conv.other.id)] }} /> {STATUS_LABEL[statusOf(online, conv.other.id)]}</span>
        )}
        {conv.type === 'GROUP' && <span className="muted">{members.length} membres</span>}
        {conv.type === 'CHANNEL' && conv.description && <span className="muted">{conv.description}</span>}
        {conv.type === 'DIRECT' && conv.other && <Link to={`/users/${conv.other.id}`} className="secondary" style={{ padding: '4px 12px', borderRadius: 4 }}>Voir le profil</Link>}
        {conv.type === 'GROUP' && isAdmin && (
          <label className="muted msgr-link-btn">
            🖼️ Changer l'image du groupe
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { uploadIcon(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        )}
      </div>
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, padding: '0 14px' }}>{error}</div>}

      {conv.type === 'GROUP' && (
        <section className="msgr-info-section">
          <div className="msgr-info-title">
            <span>Membres</span>
            {isAdmin && <button type="button" className="msgr-link-btn" onClick={() => setAdding((v) => !v)}>{adding ? 'Annuler' : '➕ Ajouter'}</button>}
          </div>
          {adding && (
            <div className="msgr-add-box">
              {candidates.length === 0 && <p className="muted" style={{ fontSize: 12 }}>Tous tes amis sont déjà dans le groupe.</p>}
              {candidates.map((f) => (
                <label key={f.id} className="msgr-share-item">
                  <input type="checkbox" style={{ width: 'auto' }} checked={picked.has(f.id)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })} />
                  <Avatar user={f} size={26} /> {f.username}
                </label>
              ))}
              {picked.size > 0 && <button type="button" disabled={busy} onClick={addMembers}>Ajouter {picked.size} membre{picked.size > 1 ? 's' : ''}</button>}
            </div>
          )}
          {members.map((m) => (
            <div key={m.id} className="msgr-member">
              <Link to={`/users/${m.id}`} className="msgr-member-main"><Avatar user={m} size={30} /><span>{m.username}{m.id === me?.id ? ' (toi)' : ''}</span></Link>
              {ROLE_LABEL[m.role] && <span className="badge new">{ROLE_LABEL[m.role]}</span>}
            {(isOwner || isAdmin) && m.id !== me?.id && m.role !== 'OWNER' && (
              <div className="msgr-member-actions">
                {isOwner && <button type="button" className="msgr-link-btn" onClick={() => setRole(m.id, m.role === 'ADMIN' ? 'MEMBER' : 'ADMIN')}>{m.role === 'ADMIN' ? 'Retirer admin' : 'Nommer admin'}</button>}
                {(m.role !== 'ADMIN' || isOwner) && <button type="button" className="msgr-link-btn danger" onClick={() => removeMember(m.id, m.username)}>Retirer du groupe</button>}
              </div>
            )}
            </div>
          ))}
        </section>
      )}

      {conv.type === 'CHANNEL' && (
        <section className="msgr-info-section">
          <div className="msgr-info-title"><span>En ligne — {onlineList.length}</span></div>
          {onlineList.slice(0, 40).map((u) => (
            <button key={u.id} type="button" className="msgr-member msgr-member-btn" disabled={u.id === me?.id} onClick={() => openDirect({ id: u.id, username: u.username })} title={u.id === me?.id ? undefined : `Écrire à ${u.username}`}>
              <span className="msgr-conv-avatar" style={{ width: 28, height: 28 }}>
                <Avatar user={{ username: u.username }} size={28} />
                <span className="msgr-status-dot" style={{ background: STATUS_COLOR[u.status], width: 9, height: 9 }} />
              </span>
              <span>{u.username}</span>
            </button>
          ))}
        </section>
      )}

      {media.length > 0 && (
        <section className="msgr-info-section">
          <div className="msgr-info-title"><span>Photos partagées</span></div>
          <div className="msgr-media-grid">
            {media.map((m) => <button key={m.id} type="button" onClick={() => setLightbox(m.imageUrl!)}><img src={m.imageUrl!} alt="" loading="lazy" /></button>)}
          </div>
        </section>
      )}
      {files.length > 0 && (
        <section className="msgr-info-section">
          <div className="msgr-info-title"><span>Fichiers</span></div>
          {files.map((m) => <a key={m.id} href={m.fileUrl!} download className="msgr-file-link">📎 {m.fileName} <span className="muted">{m.fileSize ? formatBytes(m.fileSize) : ''}</span></a>)}
        </section>
      )}

      {conv.type === 'GROUP' && (
        <section className="msgr-info-section">
          <button type="button" className="danger" disabled={busy} onClick={leave}>🚪 Quitter le groupe</button>
        </section>
      )}
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </aside>
  );
}
