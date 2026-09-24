import { Link } from 'react-router-dom';
import { api } from '../api/client';
import HoverCard from './HoverCard';
import Avatar from './Avatar';
import { formatBytes } from '../lib/format';
import { displayRank } from '../lib/memberClass';
import { ROLE_LABEL } from './StaffUserPanel';

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
