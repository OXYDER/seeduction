import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';

interface Credit {
  enabled: boolean; percent: number; maxPerTorrentGb: number; dailyMaxGb: number; requireSeeding: boolean;
  totalBytes: number; count: number; recent: { torrentId: string; name: string; bytes: number; at: string }[];
}

/**
 * Crédit d'envoi : à l'approbation d'un torrent, une part de sa taille s'ajoute à l'upload de son uploader, même si personne ne l'a encore téléchargé.
 * `compact` : une simple ligne d'information pour la page d'envoi ; sinon le détail pour la page des points bonus.
 */
export default function UploadCreditPanel({ compact = false }: { compact?: boolean }) {
  const [c, setC] = useState<Credit | null>(null);
  useEffect(() => { api.get('/upload-credit/me').then((r) => setC(r.data)).catch(() => undefined); }, []);
  if (!c || !c.enabled || c.percent <= 0) return null;

  const rule = `${c.percent} % de la taille de chaque torrent approuvé s'ajoute à ton upload (jusqu'à ${c.maxPerTorrentGb} Go par torrent${c.dailyMaxGb > 0 ? `, ${c.dailyMaxGb} Go par jour` : ''})${c.requireSeeding ? ', à condition que ton client le seede' : ''}, même si personne ne l'a encore téléchargé.`;

  if (compact) return <div className="panel muted" style={{ fontSize: 13.5 }}>🎁 <strong>Crédit d'envoi :</strong> {rule}</div>;

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <strong>🎁 Crédit d'envoi</strong>
        <span><strong style={{ color: 'var(--gold-bright)' }}>{formatBytes(c.totalBytes)}</strong> reçus pour {c.count} torrent{c.count > 1 ? 's' : ''}</span>
      </div>
      <p className="muted" style={{ margin: '6px 0' }}>{rule} Il est repris si le torrent est supprimé ou rejeté. <Link to="/wiki/guide-ratio-seed">En savoir plus</Link></p>
      {c.recent.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
          {c.recent.map((r) => <li key={r.torrentId}><Link to={`/torrents/${r.torrentId}`}>{r.name}</Link> : +{formatBytes(r.bytes)}</li>)}
        </ul>
      )}
    </div>
  );
}
