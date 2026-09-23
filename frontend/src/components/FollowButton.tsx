import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

/** S'abonner à un acteur, studio, genre... : notification à chaque nouveau torrent approuvé. */
export default function FollowButton({ entityId }: { entityId: string }) {
  const user = useAuthStore((s) => s.user);
  const [following, setFollowing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    api.get(`/social/follows/${entityId}`).then((r) => setFollowing(r.data.following)).catch(() => {});
  }, [entityId, user]);

  if (!user) return null;

  async function toggle() {
    setError('');
    try {
      const { data } = following ? await api.delete(`/social/follows/${entityId}`) : await api.put(`/social/follows/${entityId}`);
      setFollowing(data.following);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Action impossible');
    }
  }

  return (
    <span>
      <button type="button" className={following ? '' : 'secondary'} onClick={toggle} title="Reçois une notification à chaque nouveau torrent approuvé">
        {following ? '🔔 Abonné' : '🔕 S\'abonner'}
      </button>
      {error && <span className="muted" style={{ color: 'var(--danger)', marginLeft: 8 }}>{error}</span>}
    </span>
  );
}
