import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

interface Status { followable: boolean; following: boolean; title?: string; follow?: { id: string; next: { label: string; countdown: string; name: string | null } | null } | null }

/** Fiche d'un torrent de série : « Suivre cette série » (prévenu dès que le prochain épisode sort). N'apparaît pas pour un film ou un torrent sans fiche de série. */
export default function SeriesFollowButton({ torrentId }: { torrentId: string }) {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setSt(null); api.get('/series-follow/status', { params: { torrentId } }).then((r) => setSt(r.data)).catch(() => setSt(null)); }, [torrentId]);
  if (!st?.followable) return null;

  async function toggle() {
    setBusy(true); setErr('');
    try {
      if (st!.following && st!.follow) await api.delete('/series-follow/' + st!.follow.id);
      else await api.post('/series-follow/torrent/' + torrentId);
      setSt((await api.get('/series-follow/status', { params: { torrentId } })).data);
    } catch (e: any) { setErr(e.response?.data?.message ?? 'Impossible'); } finally { setBusy(false); }
  }
  const next = st.follow?.next;
  return (
    <span className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" className={st.following ? '' : 'secondary'} disabled={busy} onClick={toggle} title={st.following ? 'Ne plus être prévenu des nouveaux épisodes' : 'Être prévenu la veille, le jour de la sortie, puis dès que le torrent est sur Seeduction'}>
        {st.following ? '🔔 Série suivie' : '🔔 Suivre cette série'}
      </button>
      {st.following && next && <span className="muted" style={{ fontSize: 13 }}>Prochain : {next.label}{next.name ? ' « ' + next.name + ' »' : ''} · {next.countdown} · <Link to="/series">mes séries</Link></span>}
      {st.following && !next && <span className="muted" style={{ fontSize: 13 }}>Pas d'épisode annoncé pour l'instant · <Link to="/series">mes séries</Link></span>}
      {err && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</span>}
    </span>
  );
}
