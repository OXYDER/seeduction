import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import Loading from '../components/Loading';
import ShareCard, { LeechCard, type Leech } from '../components/ShareCard';

interface Item {
  torrentId: string; name: string; coverImage: string | null; size: number; seedingNow: boolean; own: boolean; cleared: boolean;
  state: 'done' | 'progress' | 'idle' | 'hnr' | 'none';
  /** Hit & run confirmé, mais le torrent est seedé à nouveau : « en réparation ». */
  repairing?: boolean;
  completedAt: string | null; lastSeedAt: string | null; seedSeconds: number; requiredSeconds: number; remainingSeconds: number; ratio: number; deadline: string | null;
}
interface Data {
  rules: { hnrSeedHours: number; hnrRatio: number; hnrGraceHours: number; bonusPerTorrentHour: number };
  counts: { seeding: number; progress: number; done: number; hnr: number; repairing?: number };
  items: Item[];
}
interface Totals { seeding: number; leeching: number; completed: number; uploads: number; uploadedBytes: number; downloadedBytes: number; seedingBytes: number }
type Tab = 'now' | 'leeching' | 'todo' | 'done' | 'all';

const fmtH = (secs: number) => (secs >= 3600 ? `${Math.round(secs / 360) / 10} h`.replace('.', ',') : `${Math.max(0, Math.round(secs / 60))} min`);
const fmtRatio = (n: number) => String(n).replace('.', ',');
const dayTime = (iso: string) => new Date(iso).toLocaleString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Mes seeds : ce que je seede et ce que je télécharge, depuis combien de temps, et si l'obligation de partage de chaque torrent est remplie. */
export default function MySeeds() {
  const [data, setData] = useState<Data | null>(null);
  const [live, setLive] = useState<{ leeching: Leech[]; totals: Totals } | null>(null);
  const [tab, setTab] = useState<Tab>('now');
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => {
      api.get('/bonus/my-seeds').then((r) => setData(r.data)).catch(() => setError('Impossible de charger tes seeds'));
      api.get('/bonus/activity').then((r) => setLive({ leeching: r.data.leeching, totals: r.data.totals })).catch(() => undefined);
    };
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 2 * 60_000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <Loading error={error} />;
  const { rules, counts } = data;
  const leeching = live?.leeching ?? [];
  const tot = live?.totals;
  const ratio = tot ? (tot.downloadedBytes > 0 ? (tot.uploadedBytes / tot.downloadedBytes).toFixed(2) : '∞') : null;
  const shown = data.items.filter((i) => (tab === 'now' ? i.seedingNow : tab === 'todo' ? ['progress', 'idle', 'hnr'].includes(i.state) : tab === 'done' ? i.state === 'done' : true));
  const TABS: [Tab, string][] = [['now', `🌱 En seed maintenant (${counts.seeding})`], ['leeching', `⬇️ Téléchargements en cours (${leeching.length})`], ['todo', `⏳ Obligation à terminer (${counts.progress})`], ['done', `✅ Obligation terminée (${counts.done})`], ['all', `Tout (${data.items.length})`]];

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>🌱 Mes seeds et téléchargements</h1>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link to="/activity" className="secondary" style={{ padding: '6px 12px', borderRadius: 8 }}>📈 Mon activité (terminés et envois)</Link>
          <Link to="/hit-and-run" className="secondary" style={{ padding: '6px 12px', borderRadius: 8 }}>⚠️ Hit & run</Link>
        </div>
      </div>
      <div className="panel">
        <p style={{ margin: 0 }}>
          Après avoir complété un téléchargement, seede-le au moins <strong>{rules.hnrSeedHours} h</strong> (ou jusqu'à un ratio de <strong>{fmtRatio(rules.hnrRatio)}</strong> sur ce torrent).
          Chaque torrent que tu seedes te rapporte aussi <strong>{rules.bonusPerTorrentHour} point bonus par heure</strong>.
          {counts.hnr > 0 && <> Tu as <Link to="/hit-and-run"><strong>{counts.hnr} hit & run</strong></Link> à régulariser.</>}
        </p>
      </div>

      {tot && (
        <div className="act-tiles">
          <div className="panel act-tile"><div className="muted">En seed</div><div className="act-tile-value">{tot.seeding}</div>{tot.seeding > 0 && <div className="muted" style={{ fontSize: 12 }}>{formatBytes(tot.seedingBytes)}</div>}</div>
          <div className="panel act-tile"><div className="muted">En téléchargement</div><div className="act-tile-value">{tot.leeching}</div></div>
          <div className="panel act-tile"><div className="muted">Upload total</div><div className="act-tile-value">{formatBytes(tot.uploadedBytes)}</div></div>
          <div className="panel act-tile"><div className="muted">Téléchargé total</div><div className="act-tile-value">{formatBytes(tot.downloadedBytes)}</div><div className="muted" style={{ fontSize: 12 }}>Ratio {ratio}</div></div>
        </div>
      )}

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {TABS.map(([k, label]) => <button key={k} type="button" className={`secondary${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label}</button>)}
      </div>

      {tab === 'leeching' ? (
        leeching.length === 0
          ? <div className="panel"><p className="muted" style={{ margin: 0 }}>Aucun téléchargement en cours.</p></div>
          : <div className="seedpage-list">{leeching.map((r) => <LeechCard key={r.torrentId} r={r} />)}</div>
      ) : (
        <>
          {shown.length === 0 && (
            <div className="panel"><p className="muted" style={{ margin: 0 }}>
              {tab === 'now' ? "Aucun torrent en seed pour le moment. Laisse ton client BitTorrent ouvert pour qu'il apparaisse ici." : tab === 'todo' ? '✓ Aucune obligation de partage en cours.' : tab === 'done' ? "Aucune obligation terminée pour l'instant." : 'Rien à afficher.'}
            </p></div>
          )}
          <div className="seedpage-list">
            {shown.map((i) => {
              const pct = i.state === 'done' ? 100 : Math.min(100, Math.round((i.seedSeconds / i.requiredSeconds) * 100));
              return (
                <ShareCard key={i.torrentId} id={i.torrentId} name={i.name} cover={i.coverImage}
                  bar={i.state !== 'none' ? { pct, kind: i.state === 'progress' ? 'seeding' : i.state } : undefined}
                  sub={<>
                    {i.state !== 'none' && <>Seed cumulé {fmtH(i.seedSeconds)} / {rules.hnrSeedHours} h · ratio {fmtRatio(i.ratio)} / {fmtRatio(rules.hnrRatio)} · </>}
                    {formatBytes(i.size)}
                    {i.completedAt && <> · téléchargé {timeAgo(i.completedAt)}</>}
                    {i.lastSeedAt && !i.seedingNow && <> · dernier seed {timeAgo(i.lastSeedAt)}</>}
                  </>}
                  chips={<>
                    {i.seedingNow && <span className="seedpage-chip seeding">🟢 En seed</span>}
                    {i.state === 'done' && <span className="seedpage-chip done">✅ Obligation terminée{i.cleared ? ' (effacée avec des points)' : ''}</span>}
                    {i.state === 'progress' && <span className="seedpage-chip seeding">⏳ Encore {fmtH(i.remainingSeconds)} de seed</span>}
                    {i.state === 'idle' && <span className="seedpage-chip idle">🟠 Ne seede plus — relance-le{i.deadline ? ` avant le ${dayTime(i.deadline)}` : ''}</span>}
                    {i.state === 'hnr' && (i.repairing
                      ? <span className="seedpage-chip seeding">🟡 En réparation — tu le seedes à nouveau, encore {fmtH(i.remainingSeconds)}</span>
                      : <span className="seedpage-chip hnr">🔴 Hit & run — reprends le seed</span>)}
                    {i.state === 'none' && <span className="seedpage-chip none">{i.own ? '📤 Ton upload : aucune obligation' : 'Aucune obligation'}</span>}
                  </>} />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
