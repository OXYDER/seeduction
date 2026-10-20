import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import HoverCard, { cachedLoad } from './HoverCard';
import DonorMark from './DonorMark';
import DeletedMark from './DeletedMark';
import { useRanks, rankClass } from '../store/ranks';
import Avatar from './Avatar';
import { formatBytes } from '../lib/format';
import { displayRank } from '../lib/memberClass';
import { ROLE_LABEL } from './StaffUserPanel';
import { useAuthStore } from '../store/auth';
import { useMessenger } from '../store/messenger';
import { useMsgRequest } from '../store/msgRequest';
import { STATUS_COLOR, STATUS_LABEL, type PublicStatus } from '../lib/presence';
import { splitProfileName } from '../lib/profileName';

/** « Léa » suivi, en plus petit, du compte auquel appartient ce profil famille (« ·OXYDE »). */
export function ProfileName({ username }: { username: string }) {
  const { name, account } = splitProfileName(username);
  return account ? <>{name}<small className="profile-acct" title={`Profil du compte ${account}`}>·{account}</small></> : <>{username}</>;
}

/** « 💬 Message » (ami, équipe, discussion déjà commencée) ou « ✉️ Demander à écrire » ; une demande en attente ou refusée est indiquée. */
function MessageButton({ u }: { u: any }) {
  const openDirect = useMessenger((s) => s.openDirect);
  const openRequest = useMsgRequest((s) => s.open);
  const sentTick = useMsgRequest((s) => s.sentTick);
  const [st, setSt] = useState<{ allowed: boolean; reason: string; request: { status: string; retryAt: string | null } | null; incoming: { id: string } | null } | null>(null);
  useEffect(() => {
    let alive = true;
    api.get('/message-requests/status/' + u.id).then((r) => { if (alive) setSt(r.data); }).catch(() => { /* on garde le bouton normal */ });
    return () => { alive = false; };
  }, [u.id, sentTick]);
  const small = { padding: '3px 12px', fontSize: 12 };
  if (st && !st.allowed) {
    if (st.reason === 'friends_only') return <button type="button" className="secondary" style={small} disabled title="Ce membre n'accepte les messages que de ses amis">🔒 Amis seulement</button>;
    if (st.reason === 'blocked') return null;
    if (st.incoming) return <Link to="/messages?demandes=1" className="secondary" style={{ ...small, borderRadius: 4, textDecoration: 'none' }}>✉️ Répondre à sa demande</Link>;
    if (st.request?.status === 'PENDING') return <button type="button" className="secondary" style={small} disabled>⏳ Demande envoyée</button>;
    if (st.request?.status === 'DECLINED' && st.request.retryAt) return <button type="button" className="secondary" style={small} disabled title={'Tu pourras renvoyer une demande le ' + new Date(st.request.retryAt).toLocaleDateString('fr-CA')}>✉️ Demande non acceptée</button>;
    return <button type="button" className="secondary" style={small} onClick={() => openRequest({ id: u.id, username: u.username })}>✉️ Demander à écrire</button>;
  }
  return (
    <button type="button" className="secondary" style={small} onClick={() => openDirect({ id: u.id, username: u.username, avatarUrl: u.avatarUrl })}>
      💬 Message
    </button>
  );
}

function FriendAction({ u }: { u: any }) {
  const me = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<string | undefined>(u.friendStatus);
  const [busy, setBusy] = useState(false);

  if (!me || me.id === u.id || !status) return null;

  async function act(fn: () => Promise<any>, next: string) {
    setBusy(true);
    try { await fn(); setStatus(next); } catch { /* action refusée : le statut n'a pas bougé */ } finally { setBusy(false); }
  }

  // Écrire à un non-ami demande d'abord une demande de message (sauf pour l'équipe) : le bouton s'adapte.
  const messageBtn = <MessageButton u={u} />;

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
  const onlineStatus: PublicStatus = u.onlineStatus ?? 'OFFLINE';
  return (
    <>
      <span style={{ position: 'relative', display: 'block', flexShrink: 0, alignSelf: 'flex-start', width: 64, height: 64, lineHeight: 0 }}>
        <Avatar user={u} size={64} />
        <span
          title={STATUS_LABEL[onlineStatus]}
          style={{ position: 'absolute', right: 2, bottom: 2, width: 14, height: 14, borderRadius: '50%', background: STATUS_COLOR[onlineStatus], border: '2px solid var(--bg-panel-raised, #10162a)' }}
        />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="tip-title"><ProfileName username={u.username} />{u.profile && <span className="tip-meta"> · profil du compte {u.profile.account}</span>}</div>
        <div className="tip-meta">{displayRank(u, ROLE_LABEL)}{u.status === 'BANNED' ? ' · 🚫 banni' : ''}</div>
        {u.watching ? (
          <div className="tip-meta" style={{ marginTop: 3 }}>🎬 Regarde {u.watching}</div>
        ) : u.statusText ? (
          <div className="tip-meta" style={{ fontStyle: 'italic', marginTop: 3 }}>{u.statusText}</div>
        ) : null}
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

/** Fenêtre ouverte au clic sur un pseudo : les informations de base du membre, puis « Voir le profil », « Message » (ou demande de message), « Ajouter en ami »... */
function UserPopup({ id, anchor, onClose }: { id: string; anchor: HTMLElement; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { let alive = true; cachedLoad('user:' + id, () => api.get('/users/' + id).then((r) => r.data)).then((d) => { if (alive) setData(d); }).catch(() => { if (alive) onClose(); }); return () => { alive = false; }; }, [id, onClose]);

  const place = useCallback(() => {
    const b = anchor.getBoundingClientRect();
    const w = ref.current?.offsetWidth ?? 360, h = ref.current?.offsetHeight ?? 260;
    const left = Math.max(8, Math.min(b.left, window.innerWidth - w - 8));
    const below = b.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, b.top - h - 6) : below;
    setPos({ top, left });
  }, [anchor]);
  useLayoutEffect(() => { place(); }, [place, data]);
  useEffect(() => {
    const onDown = (e: Event) => { const t = e.target as Node; if (ref.current?.contains(t) || anchor.contains(t)) return; onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onClose, true);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', place); window.removeEventListener('scroll', onClose, true); };
  }, [anchor, onClose, place]);

  return createPortal(
    <div ref={ref} className="user-popup" role="dialog" aria-label="Informations sur le membre" style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos && data ? 'visible' : 'hidden' }}>
      {data && (
        <>
          <div className="user-popup-card"><UserCard u={data} /></div>
          <div className="user-popup-actions">
            <Link to={'/users/' + id} onClick={onClose} className="secondary" style={{ padding: '3px 12px', fontSize: 12, borderRadius: 4, textDecoration: 'none' }}>👤 Voir le profil</Link>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

/** Pseudo cliquable : un clic ouvre la fenêtre d'informations du membre (voir le profil, message, ami...) ; au survol, une infobulle résume le membre. Ctrl / Maj + clic ouvre directement le profil. */
export default function UserLink({ user, fallback = '' }: { user?: { id?: string; username?: string } | null; fallback?: string }) {
  const rank = useRanks((st) => (user?.id ? st.ranks[user.id] : undefined));
  const [open, setOpen] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const close = useCallback(() => setOpen(false), []);
  if (!user?.username) return <>{fallback}</>;
  if (!user.id) return <ProfileName username={user.username} />;
  const id = user.id;
  return (
    <HoverCard cacheKey={`user:${id}`} load={() => api.get(`/users/${id}`).then((r) => r.data)} render={(u: any) => <UserCard u={u} />} disabled={open}>
      <span style={{ whiteSpace: 'nowrap' }}>
        <Link
          ref={linkRef} to={`/users/${id}`} className={`user-link${rankClass(rank)}`}
          onClick={(e) => {
            e.stopPropagation();
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return; // ouvrir le profil dans un autre onglet comme d'habitude
            e.preventDefault();
            setOpen((v) => !v);
          }}
        >
          <ProfileName username={user.username} />
        </Link>
        <DeletedMark id={id} />
        <DonorMark id={id} />
        {open && linkRef.current && <UserPopup id={id} anchor={linkRef.current} onClose={close} />}
      </span>
    </HoverCard>
  );
}
