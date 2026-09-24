import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

/** Bouton « Merci » (👍) avec compteur, et demande de reseed quand plus personne ne seede. */
export default function TorrentSocial({ torrentId, seeders, isUploader }: { torrentId: string; seeders: number; isUploader: boolean }) {
  const user = useAuthStore((s) => s.user);
  const [likes, setLikes] = useState<{ count: number; mine: boolean }>({ count: 0, mine: false });
  const [reseedMsg, setReseedMsg] = useState('');
  const [rating, setRating] = useState<{ average: number | null; count: number; mine: number | null }>({ average: null, count: 0, mine: null });
  const [hover, setHover] = useState(0);

  useEffect(() => {
    api.get(`/social/likes/${torrentId}`).then((r) => setLikes(r.data)).catch(() => {});
    api.get(`/social/ratings/${torrentId}`).then((r) => setRating(r.data)).catch(() => {});
  }, [torrentId, user]);

  async function rate(score: number) {
    if (!user || isUploader) return;
    try {
      const { data } = rating.mine === score ? await api.delete(`/social/ratings/${torrentId}`) : await api.put(`/social/ratings/${torrentId}`, { score });
      setRating(data);
    } catch { /* connexion perdue : on garde l'état affiché */ }
  }

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

  const shown = hover || rating.mine || Math.round(rating.average ?? 0);

  return (
    <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <span className="star-rating" title={rating.count ? `Note moyenne : ${(rating.average ?? 0).toFixed(1)} / 5 (${rating.count} vote${rating.count > 1 ? 's' : ''})${rating.mine ? ` — ta note : ${rating.mine}` : ''}` : 'Pas encore de note'} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className={`star${n <= shown ? ' on' : ''}${rating.mine && n <= rating.mine ? ' mine' : ''}`} disabled={!user || isUploader} onMouseEnter={() => setHover(n)} onClick={() => rate(n)} aria-label={`${n} étoile${n > 1 ? 's' : ''}`}>★</button>
        ))}
        {rating.count > 0 && <span className="muted" style={{ fontSize: 12, marginLeft: 4 }}>{(rating.average ?? 0).toFixed(1)} ({rating.count})</span>}
      </span>
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
