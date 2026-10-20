import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Nick from './Nick';
import { api } from '../api/client';
import { useMessenger } from '../store/messenger';
import { STATUS_COLOR, STATUS_LABEL, type PublicStatus } from '../lib/presence';
import Avatar from './Avatar';
import HeaderPopover from './HeaderPopover';

interface Friend { friendshipId: string; id: string; username: string; avatarUrl?: string | null; status: PublicStatus }

/**
 * Icône 👫 du haut : un clic ouvre la liste des amis en ligne (avec un bouton pour leur écrire) et un lien vers la page de tous les amis ; les demandes d'ami en attente
 * sont rappelées. La pastille rouge compte les demandes, la verte les amis en ligne.
 */
export default function FriendsMenu({ pending, online, active }: { pending: number; online: number; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ friends: Friend[]; incoming: unknown[] } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const openDirect = useMessenger((s) => s.openDirect);
  const onlineMap = useMessenger((s) => s.online);
  const close = useCallback(() => setOpen(false), []);

  const load = useCallback(() => { api.get('/friends').then((r) => setData(r.data)).catch(() => {}); }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  // Présence en direct : le statut vient du Messenger (temps réel), la liste elle-même du serveur.
  const friends = (data?.friends ?? [])
    .map((f) => ({ ...f, status: (onlineMap[f.id] ?? f.status ?? 'OFFLINE') as PublicStatus }))
    .filter((f) => f.status !== 'OFFLINE')
    .sort((a, b) => a.username.localeCompare(b.username, 'fr', { sensitivity: 'base' }));
  const total = data?.friends.length ?? 0;

  return (
    <>
      <button ref={btnRef} type="button" className={`icon-pill${active ? ' active' : ''}`} title="Amis" aria-label="Amis" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        👫{pending > 0 && <span className="dot-badge" title="Demandes d'ami">{pending > 99 ? '99+' : pending}</span>}{online > 0 && <span className="dot-badge green" title={`${online} ami${online > 1 ? 's' : ''} en ligne`}>{online > 99 ? '99+' : online}</span>}
      </button>
      <HeaderPopover open={open} anchorRef={btnRef} onClose={close} width={340} label="Amis en ligne">
        <div className="hp-head">
          <strong>Amis en ligne{data ? ` — ${friends.length}` : ''}</strong>
          {data && <span className="muted" style={{ fontSize: 12 }}>sur {total} ami{total > 1 ? 's' : ''}</span>}
        </div>
        {pending > 0 && <Link to="/friends" className="hp-alert" onClick={close}>🔔 {pending} demande{pending > 1 ? 's' : ''} d'ami en attente →</Link>}
        <div className="hp-list">
          {!data && <p className="muted hp-empty">Chargement…</p>}
          {data && friends.length === 0 && <p className="muted hp-empty">{total === 0 ? 'Tu n\'as pas encore d\'amis.' : 'Aucun ami en ligne pour le moment.'}</p>}
          {friends.map((f) => (
            <div key={f.id} className="hp-friend">
              <Link to={`/users/${f.id}`} className="hp-friend-main" onClick={close}>
                <span className="hp-av"><Avatar user={f} size={32} /><i style={{ background: STATUS_COLOR[f.status] }} title={STATUS_LABEL[f.status]} /></span>
                <span className="hp-friend-name"><Nick id={f.id} name={f.username} /><small className="muted">{STATUS_LABEL[f.status]}</small></span>
              </Link>
              <button type="button" className="hp-msg" title={`Écrire à ${f.username}`} aria-label={`Écrire à ${f.username}`} onClick={() => { void openDirect({ id: f.id, username: f.username, avatarUrl: f.avatarUrl }); close(); }}>💬</button>
            </div>
          ))}
        </div>
        <Link to="/friends" className="hp-foot" onClick={close}>Voir tous mes amis →</Link>
      </HeaderPopover>
    </>
  );
}
