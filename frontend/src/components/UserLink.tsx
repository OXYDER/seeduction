import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import HoverCard from './HoverCard';
import Avatar from './Avatar';
import { formatBytes } from '../lib/format';
import { displayRank } from '../lib/memberClass';
import { ROLE_LABEL } from './StaffUserPanel';
import { useAuthStore } from '../store/auth';
import { useDmStore } from '../store/dm';

function FriendAction({ u }: { u: any }) {
  const me = useAuthStore((s) => s.user);
  const openChat = useDmStore((s) => s.openChat);
  const [status, setStatus] = useState<string | undefined>(u.friendStatus);
  const [busy, setBusy] = useState(false);

  if (!me || me.id === u.id || !status) return null;

  async function act(fn: () => Promise<any>, next: string) {
    setBusy(true);
    try { await fn(); setStatus(next); } catch { /* action refusée : le statut n'a pas bougé */ } finally { setBusy(false); }
  }

  // Écrire à quelqu'un ne demande pas d'être ami (comme une demande de message Messenger) : le bouton est toujours là,
  // sauf que ce membre peut avoir restreint son chat privé à ses amis (l'erreur s'affiche alors dans la fenêtre de discussion).
  const messageBtn = (
    <button type="button" className="secondary" style={{ padding: '3px 12px', fontSize: 12 }} onClick={() => openChat({ id: u.id, username: u.username, avatarUrl: u.avatarUrl })}>
      💬 Message
    </button>
  );

  if (status === 'FRIENDS') return messageBtn;
  if (status === 'PENDING_OUT') return <div className="row" style={{ gap: 6 }}>{messageBtn}<span className="muted" style={{ fontSize: 12 }}>⏳ Demande envoyée</span></div>;
  if (status === 'PENDING_IN') {
    return (
      <div className="row" style={{ gap: 6 }}>
        {messageBtn}
        <button type="button" style={{ padding: '3px 12px', fontSize: 12 }} disabled={busy} onClick={() => act(async () => { await api.post(`/friends/${u.friendshipId ?? ''}/accept`); }, 'FRIENDS')}>
          ✔️ Accepter
        </button>
      </div>
    );
  }
  return (
    <div className="row" style={{ gap: 6 }}>
      {messageBtn}
      <button type="button" className="secondary" style={{ padding: '3px 12px', fontSize: 12 }} disabled={busy} onClick={() => act(async () => { await api.post('/friends/request', { username: u.username }); }, 'PENDING_OUT')}>
        ➕ Ajouter en ami
      </button>
    </div>
  );
}

function UserCard({ u }: { u: any }) {
  return (
    <>
      <Avatar user={u} size={64} />
      <div style={{ minWidth: 0 }}>
        <div className="tip-title">{u.username}</div>
        <div className="tip-meta">{displayRank(u, ROLE_LABEL)}{u.status === 'BANNED' ? ' · 🚫 banni' : ''}</div>
        <div className="tip-meta" style={{ marginTop: 6, lineHeight: 1.7 }}>
          Ratio : <strong style={{ color: 'var(--gold-bright)' }}>{u.ratio != null ? u.ratio.toFixed(2) : '∞'}</strong><br />
          <span style={{ color: 'var(--success)' }}>▲ {formatBytes(u.uploaded)}</span> · <span style={{ color: 'var(--danger)' }}>▼ {formatBytes(u.downloaded)}</span><br />
          {u._count?.torrentsUploaded ?? 0} torrent(s) envoyé(s)<br />
          Membre depuis le {new Date(u.createdAt).toLocaleDateString('fr-FR')}
          {u.lastSeenAt && <><br />Vu le {new Date(u.lastSeenAt).toLocaleDateString('fr-FR')}</>}
        </div>
        <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
          <FriendAction u={u} />
        </div>
      </div>
    </>
  );
}

/** Pseudo cliquable vers le profil ; au survol, une infobulle résume le membre (texte simple si on n'a pas son identifiant). */
export default function UserLink({ user, fallback = '' }: { user?: { id?: string; username?: string } | null; fallback?: string }) {
  if (!user?.username) return <>{fallback}</>;
  if (!user.id) return <>{user.username}</>;
  const id = user.id;
  return (
    <HoverCard cacheKey={`user:${id}`} load={() => api.get(`/users/${id}`).then((r) => r.data)} render={(u: any) => <UserCard u={u} />}>
      <Link to={`/users/${id}`} onClick={(e) => e.stopPropagation()} className="user-link">
        {user.username}
      </Link>
    </HoverCard>
  );
}
