import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';

interface Item {
  id: string; torrentId: string; name: string; coverImage: string | null; size: number; completedAt: string; seedSeconds: number;
  requiredSeconds: number; remainingSeconds: number; ratio: number; seedingNow: boolean; cost: number;
}
interface Data {
  points: number; clearedRecently: number; items: Item[];
  rules: { hnrSeedHours: number; hnrRatio: number; hnrGraceHours: number; hnrLimit: number; clearBase: number; clearPerHour: number; clearRepeat: number; clearMax: number; bonusPerTorrentHour: number };
}

const fmtH = (secs: number) => (secs >= 3600 ? `${Math.round(secs / 360) / 10} h`.replace('.', ',') : `${Math.max(0, Math.round(secs / 60))} min`);
const fmtRatio = (n: number) => String(n).replace('.', ',');

/** Hit & run confirmés seulement (avertissement déjà reçu) : on les régularise en reprenant le seed, ou on les efface avec des points bonus. */
export default function HitAndRun() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  const load = () => api.get('/bonus/hnr').then((r) => setData(r.data)).catch(() => setError('Impossible de charger tes hit & run'));
  useEffect(() => { void load(); }, []);

  async function clear(i: Item) {
    if (!window.confirm(`Effacer ce hit & run pour ${i.cost} points bonus ?\n\n« ${i.name} »\n\nLe seed reste la voie normale : il te rapporterait des points au lieu d'en coûter.`)) return;
    setBusy(i.id); setError(''); setMessage('');
    try {
      await api.post(`/bonus/hnr/${i.id}/clear`);
      setMessage(`✓ Hit & run effacé (−${i.cost} points)`);
      await load();
    } catch (e: any) { setError(e.response?.data?.message ?? 'Impossible d\'effacer ce hit & run'); } finally { setBusy(''); }
  }

  if (!data) return <p className="muted">{error || 'Chargement…'}</p>;
  const { rules } = data;

  return (
    <div className="grid page-narrow" style={{ gap: 16 }}>
      <h1 style={{ margin: 0 }}>⚠️ Hit & run</h1>

      <div className="panel">
        <p style={{ margin: 0 }}>
          Un <strong>hit & run</strong> est un torrent complété que tu as abandonné avant la fin du <strong>temps de partage obligatoire</strong> ({rules.hnrSeedHours} h de seed, ou un ratio de {fmtRatio(rules.hnrRatio)}), {rules.hnrGraceHours} h après la fin du téléchargement.
          Cette page n'affiche que ceux qui sont <strong>confirmés</strong>. À {rules.hnrLimit} hit & run non régularisés, les nouveaux téléchargements sont bloqués.
        </p>
        <p className="muted" style={{ margin: '8px 0 0' }}>
          <strong>La bonne façon de régulariser : reprendre le seed.</strong> Le temps de partage est ce qui fait vivre le tracker, et chaque heure de seed te rapporte {rules.bonusPerTorrentHour} point bonus.
          Si vraiment tu ne peux pas, tu peux effacer un hit & run avec des points : {rules.clearBase} points de base + {rules.clearPerHour} par heure de seed manquante
          {rules.clearRepeat > 0 && <> + {rules.clearRepeat} par hit & run déjà effacé ces 30 derniers jours</>} (maximum {rules.clearMax}).
        </p>
      </div>

      {message && <div style={{ color: 'var(--success)' }}>{message}</div>}
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}

      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <strong>{data.items.length === 0 ? 'Aucun hit & run' : `${data.items.length} hit & run à régulariser`}</strong>
        <span className="muted">Ton solde : <strong style={{ color: 'var(--gold-bright)' }}>✦ {Math.floor(data.points)}</strong> points · <Link to="/seeds">Voir mes seeds →</Link></span>
      </div>

      {data.items.length === 0 ? (
        <div className="panel"><p style={{ margin: 0, color: 'var(--success)' }}>✓ Aucun hit & run à régulariser : parfait !</p></div>
      ) : (
        <div className="seedpage-list">
          {data.items.map((i) => {
            const pct = Math.min(100, Math.round((i.seedSeconds / i.requiredSeconds) * 100));
            return (
              <div key={i.id} className="seedpage-item hnr-item">
                {i.coverImage ? <img src={i.coverImage} alt="" className="seedob-cover" /> : <span className="seedob-cover plain">🎬</span>}
                <span className="seedob-text">
                  <Link to={`/torrents/${i.torrentId}`} className="seedob-name" style={{ fontSize: 14 }}>{i.name}</Link>
                  <span className="seedob-bar"><span className="hnr" style={{ width: `${pct}%` }} /></span>
                  <span className="seedob-sub">
                    Seed cumulé {fmtH(i.seedSeconds)} / {rules.hnrSeedHours} h · ratio {fmtRatio(i.ratio)} / {fmtRatio(rules.hnrRatio)} · {formatBytes(i.size)} · téléchargé {timeAgo(i.completedAt)}
                  </span>
                  <span className="seedpage-chips">
                    {i.seedingNow ? <span className="seedpage-chip seeding">🟢 Tu le seedes à nouveau — encore {fmtH(i.remainingSeconds)}</span> : <span className="seedpage-chip hnr">🔴 Reprends le seed : encore {fmtH(i.remainingSeconds)}</span>}
                  </span>
                </span>
                <span className="hnr-actions">
                  <Link to={`/torrents/${i.torrentId}`} className="icon-btn">Reprendre le seed (gratuit)</Link>
                  <button type="button" className="secondary" disabled={busy === i.id || data.points < i.cost} onClick={() => clear(i)} title={data.points < i.cost ? 'Points insuffisants' : undefined}>
                    Effacer — {i.cost} pts
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
