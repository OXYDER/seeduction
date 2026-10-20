import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';
import { formatBytes } from '../lib/format';
import UserLink from './UserLink';
import Loading from './Loading';

interface Who { id: string; username: string; role: string }
interface Done { user: Who; completedAt: string; seedHours: number; satisfied: boolean; hnr: boolean; seedingNow: boolean }
interface Unfinished { user: Who; downloadingNow: boolean; progress: number; received: number; lastSeenAt: string | null }

/** Fiche d'un torrent, équipe seulement : qui l'a terminé (temps de seed, hit & run) et qui l'a commencé sans le terminer (progression, activité). */
export default function TorrentCompletion({ torrentId }: { torrentId: string }) {
  const [data, setData] = useState<{ completed: Done[]; unfinished: Unfinished[] } | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    setErr('');
    api.get(`/torrents/${torrentId}/completion`).then((r) => setData(r.data)).catch((e) => setErr(e?.response?.data?.message ?? 'Impossible de charger la liste'));
  }, [torrentId]);
  useEffect(() => { load(); }, [load]);

  if (err) return <div className="panel"><p style={{ color: 'var(--danger)' }}>{err}</p></div>;
  if (!data) return <div className="panel"><Loading /></div>;
  const { completed, unfinished } = data;

  return (
    <div className="grid">
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0 }}>✅ Ont complété <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>— {completed.length}</span></h3>
          <button type="button" className="secondary" onClick={load}>↻ Actualiser</button>
        </div>
        {completed.length === 0 ? <p className="muted">Personne n'a encore terminé ce torrent.</p> : (
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table>
              <thead><tr><th>Membre</th><th>Terminé</th><th>Seed cumulé</th><th>Partage obligatoire</th><th>Seed en ce moment</th></tr></thead>
              <tbody>
                {completed.map((c) => (
                  <tr key={c.user.id}>
                    <td><UserLink user={c.user} /></td>
                    <td title={new Date(c.completedAt).toLocaleString('fr-CA')}>{timeAgo(c.completedAt)}</td>
                    <td>{c.seedHours} h</td>
                    <td>{c.hnr ? <span style={{ color: 'var(--danger)' }}>⚠️ Hit & run</span> : c.satisfied ? <span style={{ color: 'var(--success)' }}>✔ rempli</span> : <span className="muted">en cours</span>}</td>
                    <td>{c.seedingNow ? '🌱 oui' : <span className="muted">non</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <h3 style={{ margin: 0 }}>⏸️ N'ont pas complété <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>— {unfinished.length}</span></h3>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>Membres qui ont reçu des morceaux de ce torrent ou le téléchargent en ce moment, sans l'avoir terminé (l'envoyeur n'est pas compté).</p>
        {unfinished.length === 0 ? <p className="muted">Aucun téléchargement inachevé.</p> : (
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table>
              <thead><tr><th>Membre</th><th>État</th><th>Progression</th><th>Reçu</th><th>Dernière activité</th></tr></thead>
              <tbody>
                {unfinished.map((u) => (
                  <tr key={u.user.id}>
                    <td><UserLink user={u.user} /></td>
                    <td>{u.downloadingNow ? '📥 télécharge' : <span className="muted">arrêté</span>}</td>
                    <td>{u.progress} %</td>
                    <td>{formatBytes(u.received)}</td>
                    <td>{u.lastSeenAt ? timeAgo(u.lastSeenAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
