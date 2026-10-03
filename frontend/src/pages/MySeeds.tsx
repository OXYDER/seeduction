import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';

interface Item {
  torrentId: string; name: string; coverImage: string | null; size: number; seedingNow: boolean; own: boolean; cleared: boolean;
  state: 'done' | 'progress' | 'idle' | 'hnr' | 'none';
  completedAt: string | null; lastSeedAt: string | null; seedSeconds: number; requiredSeconds: number; remainingSeconds: number; ratio: number; deadline: string | null;
}
interface Data {
  rules: { hnrSeedHours: number; hnrRatio: number; hnrGraceHours: number; bonusPerTorrentHour: number };
  counts: { seeding: number; progress: number; done: number; hnr: number };
  items: Item[];
}
type Tab = 'now' | 'todo' | 'done' | 'all';

const fmtH = (secs: number) => (secs >= 3600 ? `${Math.round(secs / 360) / 10} h`.replace('.', ',') : `${Math.max(0, Math.round(secs / 60))} min`);
const fmtRatio = (n: number) => String(n).replace('.', ',');
const dayTime = (iso: string) => new Date(iso).toLocaleString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Mes seeds : ce que je seede, depuis combien de temps, et si l'obligation de partage de chaque torrent est remplie. */
export default function MySeeds() {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>('now');
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => api.get('/bonus/my-seeds').then((r) => setData(r.data)).catch(() => setError('Impossible de charger tes seeds'));
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 2 * 60_000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <p className="muted">{error || 'Chargement…'}</p>;
  const { rules, counts } = data;
  const shown = data.items.filter((i) => (tab === 'now' ? i.seedingNow : tab === 'todo' ? ['progress', 'idle', 'hnr'].includes(i.state) : tab === 'done' ? i.state === 'done' : true));
  const TABS: [Tab, string][] = [['now', `🌱 En seed maintenant (${counts.seeding})`], ['todo', `⏳ Obligation à terminer (${counts.progress})`], ['done', `✅ Obligation terminée (${counts.done})`], ['all', `Tout (${data.items.length})`]];

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1 style={{ margin: 0 }}>🌱 Mes seeds</h1>
      <div className="panel">
        <p style={{ margin: 0 }}>
          Après avoir complété un téléchargement, seede-le au moins <strong>{rules.hnrSeedHours} h</strong> (ou jusqu'à un ratio de <strong>{fmtRatio(rules.hnrRatio)}</strong> sur ce torrent).
          Chaque torrent que tu seedes te rapporte aussi <strong>{rules.bonusPerTorrentHour} point bonus par heure</strong>.
          {counts.hnr > 0 && <> Tu as <Link to="/hit-and-run"><strong>{counts.hnr} hit & run</strong></Link> à régulariser.</>}
        </p>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {TABS.map(([k, label]) => <button key={k} type="button" className={`secondary${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label}</button>)}
      </div>

      {shown.length === 0 && (
        <div className="panel"><p className="muted" style={{ margin: 0 }}>
          {tab === 'now' ? "Aucun torrent en seed pour le moment. Laisse ton client BitTorrent ouvert pour qu'il apparaisse ici." : tab === 'todo' ? '✓ Aucune obligation de partage en cours.' : tab === 'done' ? "Aucune obligation terminée pour l'instant." : 'Rien à afficher.'}
        </p></div>
      )}

      <div className="seedpage-list">
        {shown.map((i) => {
          const pct = i.state === 'done' ? 100 : Math.min(100, Math.round((i.seedSeconds / i.requiredSeconds) * 100));
          return (
            <Link key={i.torrentId} to={`/torrents/${i.torrentId}`} className="seedpage-item">
              {i.coverImage ? <img src={i.coverImage} alt="" className="seedob-cover" /> : <span className="seedob-cover plain">🎬</span>}
              <span className="seedob-text">
                <span className="seedob-name" style={{ fontSize: 14 }}>{i.name}</span>
                {i.state !== 'none' && <span className="seedob-bar"><span className={i.state === 'progress' ? 'seeding' : i.state} style={{ width: `${pct}%` }} /></span>}
                <span className="seedob-sub">
                  {i.state !== 'none' && <>Seed cumulé {fmtH(i.seedSeconds)} / {rules.hnrSeedHours} h · ratio {fmtRatio(i.ratio)} / {fmtRatio(rules.hnrRatio)} · </>}
                  {formatBytes(i.size)}
                  {i.completedAt && <> · téléchargé {timeAgo(i.completedAt)}</>}
                  {i.lastSeedAt && !i.seedingNow && <> · dernier seed {timeAgo(i.lastSeedAt)}</>}
                </span>
                <span className="seedpage-chips">
                  {i.seedingNow && <span className="seedpage-chip seeding">🟢 En seed</span>}
                  {i.state === 'done' && <span className="seedpage-chip done">✅ Obligation terminée{i.cleared ? ' (effacée avec des points)' : ''}</span>}
                  {i.state === 'progress' && <span className="seedpage-chip seeding">⏳ Encore {fmtH(i.remainingSeconds)} de seed</span>}
                  {i.state === 'idle' && <span className="seedpage-chip idle">🟠 Ne seede plus — relance-le{i.deadline ? ` avant le ${dayTime(i.deadline)}` : ''}</span>}
                  {i.state === 'hnr' && <span className="seedpage-chip hnr">🔴 Hit & run — reprends le seed</span>}
                  {i.state === 'none' && <span className="seedpage-chip none">{i.own ? '📤 Ton upload : aucune obligation' : 'Aucune obligation'}</span>}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
