import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import UserLink from './UserLink';

interface PeerRow {
  id: string;
  user: { id: string; username: string; role: string; ratio: number | null };
  ip: string; port: number; peerId: string;
  client: string; clientVersion: string | null; clientKnown: boolean;
  isSeeder: boolean; uploaded: number; downloaded: number; left: number; progress: number;
  lastEvent: string; lastAnnounceAt: string; sameIpUsers: number;
}

const EVENTS: Record<string, string> = { STARTED: 'Démarré', STOPPED: 'Arrêté', COMPLETED: 'Terminé', NONE: 'Mise à jour' };

/** Fiche d'un torrent, équipe seulement : tous les peers connus du tracker avec le détail de chacun (membre, adresse, client, volumes, progression). */
export default function TorrentPeers({ torrentId }: { torrentId: string }) {
  const [rows, setRows] = useState<PeerRow[] | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    setErr('');
    api.get(`/torrents/${torrentId}/peers`).then((r) => setRows(r.data)).catch((e) => setErr(e?.response?.data?.message ?? 'Impossible de charger les peers'));
  }, [torrentId]);
  useEffect(() => { load(); }, [load]);

  if (err) return <div className="panel"><p style={{ color: 'var(--danger)' }}>{err}</p></div>;
  if (!rows) return <div className="panel"><p className="muted">Chargement...</p></div>;
  const seeders = rows.filter((r) => r.isSeeder).length;

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>Peers <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>— {seeders} seeder{seeders > 1 ? 's' : ''} · {rows.length - seeders} leecher{rows.length - seeders > 1 ? 's' : ''} · visible de l'équipe seulement</span></h3>
        <button type="button" className="secondary" onClick={load}>↻ Actualiser</button>
      </div>
      {rows.length === 0 ? <p className="muted">Aucun peer connu pour ce torrent.</p> : (
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table>
            <thead>
              <tr><th>Membre</th><th>Type</th><th>Client</th><th>Adresse</th><th>Progression</th><th>Envoyé</th><th>Reçu</th><th>Reste</th><th>Ratio</th><th>Dernier contact</th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><UserLink user={p.user} /></td>
                  <td>{p.isSeeder ? '🌱 Seeder' : '📥 Leecher'}</td>
                  <td title={`peer_id : ${p.peerId}`}>{p.client}{p.clientVersion ? ` ${p.clientVersion}` : ''}{!p.clientKnown && <div className="muted" style={{ fontSize: 11, fontFamily: 'monospace' }}>{p.peerId.slice(0, 8)}</div>}</td>
                  <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12 }}>
                    {p.ip}:{p.port}
                    {p.sameIpUsers > 1 && <span title={`Cette adresse est utilisée par ${p.sameIpUsers} membres sur ce torrent`} style={{ color: 'var(--danger)', marginLeft: 6, fontFamily: 'inherit' }}>⚠ {p.sameIpUsers} membres</span>}
                  </td>
                  <td>{p.progress}%</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatBytes(p.uploaded)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatBytes(p.downloaded)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{p.isSeeder ? '—' : formatBytes(p.left)}</td>
                  <td>{p.user.ratio != null ? p.user.ratio.toFixed(2) : '∞'}</td>
                  <td style={{ whiteSpace: 'nowrap' }} title={new Date(p.lastAnnounceAt).toLocaleString('fr-FR')}>{timeAgo(p.lastAnnounceAt)} <span className="muted" style={{ fontSize: 11 }}>· {EVENTS[p.lastEvent] ?? p.lastEvent}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Le client est reconnu d'après le « peer_id » envoyé au tracker (survole-le pour le voir en entier). Envoyé / reçu : volumes cumulés sur ce torrent. Ratio : celui du membre sur tout le site.</p>
    </div>
  );
}
