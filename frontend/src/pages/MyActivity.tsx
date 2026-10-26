import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import Loading from '../components/Loading';
import ShareCard, { LeechCard } from '../components/ShareCard';

interface LiveRow { torrentId: string; name: string; coverImage: string | null; size: number; uploaded: number; downloaded: number; ratio: number | null; progress: number; lastAnnounceAt: string; seedSeconds: number; requiredSeconds: number; obligationDone: boolean | null }
interface DoneRow { torrentId: string; name: string; coverImage: string | null; size: number; completedAt: string; startedAt: string | null; firstDay: string | null; receivedBytes: number | null; sentBytes: number | null; seedSeconds: number; requiredSeconds: number; satisfied: boolean; hnr: boolean; hnrResolved: boolean; own: boolean; seedingNow: boolean }
const dateTime = (iso: string) => new Date(iso).toLocaleString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
interface UpRow { id: string; name: string; coverImage: string | null; size: number; status: string; seeders: number; leechers: number; completedCount: number; createdAt: string }
interface Data {
  totals: { seeding: number; leeching: number; completed: number; uploads: number; uploadedBytes: number; downloadedBytes: number; seedingBytes: number };
  seeding: LiveRow[]; leeching: LiveRow[]; completed: DoneRow[]; uploads: UpRow[]; rules: { hnrSeedHours: number };
}
type Tab = 'seeding' | 'leeching' | 'completed' | 'uploads';

const hours = (secs: number) => (secs >= 3600 ? `${Math.round(secs / 360) / 10} h`.replace('.', ',') : `${Math.max(0, Math.round(secs / 60))} min`);
const STATUS: Record<string, string> = { APPROVED: 'Approuvé', PENDING: 'En attente', REJECTED: 'Rejeté', DEAD: '☠️ Mort' };

/** Mon activité : mes seeds, mes téléchargements en cours et terminés, et mes envois, avec les volumes échangés. */
export default function MyActivity() {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>('seeding');
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => api.get('/bonus/activity').then((r) => setData(r.data)).catch(() => setError('Impossible de charger ton activité'));
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 2 * 60_000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <Loading error={error} />;
  const { totals: t } = data;
  const ratio = t.downloadedBytes > 0 ? (t.uploadedBytes / t.downloadedBytes).toFixed(2) : '∞';
  const tile = (label: string, value: string, sub?: string) => (
    <div className="panel act-tile"><div className="muted">{label}</div><div className="act-tile-value">{value}</div>{sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}</div>
  );
  const TABS: [Tab, string][] = [['seeding', `🌱 Seeds (${t.seeding})`], ['leeching', `⬇️ Téléchargements en cours (${t.leeching})`], ['completed', `✅ Téléchargés (${t.completed})`], ['uploads', `⬆️ Mes envois (${t.uploads})`]];

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>📈 Mon activité</h1>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link to="/seeds" className="secondary" style={{ padding: '6px 12px', borderRadius: 8 }}>🌱 Mes seeds et obligations</Link>
          <Link to="/hit-and-run" className="secondary" style={{ padding: '6px 12px', borderRadius: 8 }}>⚠️ Hit & run</Link>
        </div>
      </div>

      <div className="act-tiles">
        {tile('En seed', String(t.seeding), t.seeding ? formatBytes(t.seedingBytes) : undefined)}
        {tile('En téléchargement', String(t.leeching))}
        {tile('Téléchargés', String(t.completed))}
        {tile('Mes envois', String(t.uploads))}
        {tile('Upload total', formatBytes(t.uploadedBytes))}
        {tile('Téléchargé total', formatBytes(t.downloadedBytes), `Ratio ${ratio}`)}
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {TABS.map(([k, label]) => <button key={k} type="button" className={`secondary${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label}</button>)}
      </div>

      {tab === 'seeding' && (data.seeding.length === 0 ? <div className="panel"><p className="muted" style={{ margin: 0 }}>Aucun torrent en seed pour le moment. Laisse ton client BitTorrent ouvert pour qu'il apparaisse ici.</p></div> : (
        <div className="seedpage-list">
          {data.seeding.map((r) => (
            <ShareCard key={r.torrentId} id={r.torrentId} name={r.name} cover={r.coverImage}
              bar={r.obligationDone === null ? undefined : { pct: r.obligationDone ? 100 : Math.min(100, (r.seedSeconds / Math.max(1, r.requiredSeconds)) * 100), kind: r.obligationDone ? 'done' : 'seeding' }}
              sub={<>{r.obligationDone !== null && <>Seed cumulé {hours(r.seedSeconds)} / {hours(r.requiredSeconds)} · </>}ratio {r.ratio == null ? '∞' : r.ratio.toFixed(2)} · {formatBytes(r.size)} · envoyé {formatBytes(r.uploaded)} · dernière annonce {timeAgo(r.lastAnnounceAt)}</>}
              chips={<>
                <span className="seedpage-chip seeding">🟢 En seed</span>
                {r.obligationDone === true && <span className="seedpage-chip done">✅ Obligation terminée</span>}
                {r.obligationDone === false && <span className="seedpage-chip seeding">⏳ Encore {hours(Math.max(0, r.requiredSeconds - r.seedSeconds))} de seed</span>}
                {r.obligationDone === null && <span className="seedpage-chip none">Aucune obligation</span>}
              </>} />
          ))}
        </div>
      ))}

      {tab === 'leeching' && (data.leeching.length === 0 ? <div className="panel"><p className="muted" style={{ margin: 0 }}>Aucun téléchargement en cours.</p></div> : (
        <div className="seedpage-list">{data.leeching.map((r) => <LeechCard key={r.torrentId} r={r} />)}</div>
      ))}

      {tab === 'completed' && (data.completed.length === 0 ? <div className="panel"><p className="muted" style={{ margin: 0 }}>Aucun téléchargement terminé pour l'instant.</p></div> : (
        <div className="seedpage-list">
          {data.completed.map((r) => {
            const pct = r.own || r.satisfied ? 100 : Math.min(100, (r.seedSeconds / Math.max(1, r.requiredSeconds)) * 100);
            const added = r.startedAt ? dateTime(r.startedAt) : r.firstDay ? new Date(r.firstDay).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null;
            return (
              <ShareCard key={r.torrentId} id={r.torrentId} name={r.name} cover={r.coverImage}
                bar={r.own ? undefined : { pct, kind: r.satisfied ? 'done' : r.hnr ? 'hnr' : 'seeding' }}
                sub={<>
                  {formatBytes(r.size)} · {added ? <>ajouté {added} · </> : null}terminé {dateTime(r.completedAt)}
                  {r.receivedBytes !== null && <> · reçu ↓ {formatBytes(r.receivedBytes)}</>}{r.sentBytes !== null && <> · envoyé ↑ {formatBytes(r.sentBytes)}</>}
                  {!r.own && <> · seed cumulé {hours(r.seedSeconds)} / {hours(r.requiredSeconds)}</>}
                </>}
                chips={<>
                  {r.seedingNow && <span className="seedpage-chip seeding">🟢 En seed</span>}
                  {r.own ? <span className="seedpage-chip none">📤 Ton envoi : aucune obligation</span>
                    : r.satisfied ? <span className="seedpage-chip done">✅ Obligation atteinte{r.hnrResolved ? ' (hit & run régularisé)' : ''}</span>
                    : r.hnr ? <span className="seedpage-chip hnr">🔴 Pas atteinte : hit & run à régler</span>
                    : <span className="seedpage-chip idle">⏳ Pas encore atteinte : encore {hours(Math.max(0, r.requiredSeconds - r.seedSeconds))}</span>}
                </>} />
            );
          })}
        </div>
      ))}

      {tab === 'uploads' && (data.uploads.length === 0 ? <div className="panel"><p className="muted" style={{ margin: 0 }}>Tu n'as pas encore envoyé de torrent. <Link to="/upload">Envoyer un torrent →</Link></p></div> : (
        <div className="seedpage-list">
          {data.uploads.map((r) => (
            <ShareCard key={r.id} id={r.id} name={r.name} cover={r.coverImage}
              sub={<>{formatBytes(r.size)} · envoyé {timeAgo(r.createdAt)} · {r.completedCount} complété{r.completedCount > 1 ? 's' : ''}</>}
              chips={<>
                <span className={`seedpage-chip ${r.status === 'APPROVED' ? 'done' : r.status === 'PENDING' ? 'idle' : 'hnr'}`}>{STATUS[r.status] ?? r.status}</span>
                <span className="seedpage-chip seeding">{r.seeders} seeder{r.seeders > 1 ? 's' : ''}</span>
                <span className="seedpage-chip">{r.leechers} leecher{r.leechers > 1 ? 's' : ''}</span>
              </>} />
          ))}
        </div>
      ))}
    </div>
  );
}
