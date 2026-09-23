import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

/** Bouton « Merci » (👍) avec compteur, et demande de reseed quand plus personne ne seede. */
export default function TorrentSocial({ torrentId, seeders, isUploader }: { torrentId: string; seeders: number; isUploader: boolean }) {
  const user = useAuthStore((s) => s.user);
  const [likes, setLikes] = useState<{ count: number; mine: boolean }>({ count: 0, mine: false });
  const [reseedMsg, setReseedMsg] = useState('');

  useEffect(() => {
    api.get(`/social/likes/${torrentId}`).then((r) => setLikes(r.data)).catch(() => {});
  }, [torrentId, user]);

  async function toggleLike() {
    try {
      const { data } = likes.mine ? await api.delete(`/social/likes/${torrentId}`) : await api.put(`/social/likes/${torrentId}`);
      setLikes(data);
    } catch { /* connexion perdue : on garde l'état affiché */ }
  }

  async function reseed() {
    setReseedMsg('');
    try {
      const { data } = await api.post(`/social/reseed/${torrentId}`);
      setReseedMsg(`✓ Demande envoyée à ${data.notified} membre(s) qui ont complété ce torrent`);
    } catch (err: any) {
      setReseedMsg(err.response?.data?.message ?? 'Demande impossible');
    }
  }

  return (
    <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <button
        type="button"
        className={likes.mine ? '' : 'secondary'}
        disabled={!user || isUploader}
        onClick={toggleLike}
        title={isUploader ? "Tu ne peux pas remercier ton propre torrent" : 'Remercier l\'uploader (il gagne 1 point bonus)'}
      >
        👍 Merci {likes.count > 0 && `(${likes.count})`}
      </button>
      {user && seeders === 0 && <button type="button" className="secondary" onClick={reseed} title="Prévient ceux qui ont déjà complété ce torrent">🔁 Demander un reseed</button>}
      {reseedMsg && <span className="muted">{reseedMsg}</span>}
    </span>
  );
}
