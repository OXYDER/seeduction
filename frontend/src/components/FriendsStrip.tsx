import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useMessenger } from '../store/messenger';
import { STATUS_COLOR, STATUS_LABEL, type PublicStatus } from '../lib/presence';
import Avatar from './Avatar';

interface Friend { id: string; username: string; avatarUrl?: string | null; status: PublicStatus }

/** Fine colonne d'avatars à droite du menu : les amis en ligne, un clic ouvre la discussion. Disparaît sur écran étroit et quand personne n'est en ligne. */
export default function FriendsStrip() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const onlineMap = useMessenger((s) => s.online);
  const openDirect = useMessenger((s) => s.openDirect);
  useEffect(() => {
    const load = () => api.get('/friends').then((r) => setFriends(r.data.friends ?? [])).catch(() => undefined);
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 120_000);
    return () => clearInterval(t);
  }, []);
  const online = friends.map((f) => ({ ...f, status: (onlineMap[f.id] ?? f.status ?? 'OFFLINE') as PublicStatus })).filter((f) => f.status !== 'OFFLINE').slice(0, 14);
  useEffect(() => {
    document.body.classList.toggle('has-friends-strip', online.length > 0);
    return () => document.body.classList.remove('has-friends-strip');
  }, [online.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  if (online.length === 0) return null;
  return (
    <div className="friends-strip" aria-label="Amis en ligne">
      {online.map((f) => (
        <button key={f.id} type="button" className="fs-av" title={`${f.username} · ${STATUS_LABEL[f.status]} : écrire`} onClick={() => { void openDirect({ id: f.id, username: f.username, avatarUrl: f.avatarUrl }); }}>
          <Avatar user={f} size={32} /><i style={{ background: STATUS_COLOR[f.status] }} />
        </button>
      ))}
    </div>
  );
}
