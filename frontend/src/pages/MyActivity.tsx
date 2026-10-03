import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';

interface LiveRow { torrentId: string; name: string; coverImage: string | null; size: number; uploaded: number; downloaded: number; ratio: number | null; progress: number; lastAnnounceAt: string; seedSeconds: number; requiredSeconds: number; obligationDone: boolean | null }
interface DoneRow { torrentId: string; name: string; coverImage: string | null; size: number; completedAt: string; seedSeconds: number; requiredSeconds: number; satisfied: boolean; hnr: boolean; own: boolean; seedingNow: boolean }
interface UpRow { id: string; name: string; coverImage: string | null; size: number; status: string; seeders: number; leechers: number; completedCount: number; createdAt: string }
interface Data {
  totals: { seeding: number; leeching: number; completed: number; uploads: number; uploadedBytes: number; downloadedBytes: number; seedingBytes: number };
  seeding: LiveRow[]; leeching: LiveRow[]; completed: DoneRow[]; uploads: UpRow[]; rules: { hnrSeedHours: number };
}
type Tab = 'seeding' | 'leeching' | 'completed' | 'uploads';

const hours = (secs: number) => (secs >= 3600 ? `${Math.round(secs / 360) / 10} h`.replace('.', ',') : `${Math.max(0, Math.round(secs / 60))} min`);
const STATUS: Record<string, string> = { APPROVED: 'Approuvé', PENDING: 'En attente', REJECTED: 'Rejeté', DEAD: '☠️ Mort' };

function Thumb({ src }: { src: string | null }) {
  return src ? <img src={src} alt="" className="act-thumb" loading="lazy" /> : <span className="act-thumb plain">🎬</span>;
}

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

  if (!data) return <p className="muted">{error || 'Chargement…'}</p>;
  const { totals: t } = data;
  const ratio = t.downloadedBytes > 0 ? (t.uploadedBytes / t.downloadedBytes).toFixed(2) : '∞';
  const tile = (label: string, value: string, sub?: string) => (
    <div className="panel act-tile"><div className="muted">{label}</div><div className="act-tile-value">{value}</div>{sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}</div>
  );
  const TABS: [Tab, string][] = [['seeding', `🌱 Seeds (${t.seeding})`], ['leeching', `⬇️ Téléchargements en cours (${t.leeching})`], ['completed', `✅ Téléchargés (${t.completed})`], ['uploads', `⬆️ Mes envois (${t.uploads})`]];

  const nameCell = (id: string, name: string, cover: string | null) => (
    <td className="act-name"><Link to={`/torrents/${id}`} className="row" style={{ gap: 10 }}><Thumb src={cover} /><span>{name}</span></Link></td>
  );

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>📈 Mon activité</h1>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link to="/seeds" className="secondary" style={{ padding: '6px 12px', borderRadius: 8 }}>🌱 Obligation de partage</Link>
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

      <div className="panel" style={{ overflowX: 'auto' }}>
        {tab === 'seeding' && (data.seeding.length === 0 ? <p className="muted" style={{ margin: 0 }}>Aucun torrent en seed pour le moment. Laisse ton client BitTorrent ouvert pour qu'il apparaisse ici.</p> : (
          <table className="act-table">
            <thead><tr><th>Torrent</th><th>Taille</th><th>Envoyé</th><th>Ratio</th><th>Seed cumulé</th><th>Dernière annonce</th></tr></thead>
            <tbody>
              {data.seeding.map((r) => (
                <tr key={r.torrentId}>
                  {nameCell(r.torrentId, r.name, r.coverImage)}
                  <td className="muted">{formatBytes(r.size)}</td>
                  <td style={{ color: 'var(--success)' }}>{formatBytes(r.uploaded)}</td>
                  <td>{r.ratio == null ? '∞' : r.ratio.toFixed(2)}</td>
                  <td>{r.obligationDone === null ? <span className="muted">—</span> : r.obligationDone ? <span className="seedpage-chip done">✅ Obligation terminée</span> : <span className="seedpage-chip seeding">{hours(r.seedSeconds)} / {data.rules.hnrSeedHours} h</span>}</td>
                  <td className="muted">{timeAgo(r.lastAnnounceAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}

        {tab === 'leeching' && (data.leeching.length === 0 ? <p className="muted" style={{ margin: 0 }}>Aucun téléchargement en cours.</p> : (
          <table className="act-table">
            <thead><tr><th>Torrent</th><th>Taille</th><th style={{ minWidth: 160 }}>Progression</th><th>Reçu</th><th>Envoyé</th><th>Dernière annonce</th></tr></thead>
            <tbody>
              {data.leeching.map((r) => (
                <tr key={r.torrentId}>
                  {nameCell(r.torrentId, r.name, r.coverImage)}
                  <td className="muted">{formatBytes(r.size)}</td>
                  <td><span className="seedob-bar" style={{ display: 'block', minWidth: 120 }}><span className="seeding" style={{ width: `${Math.round(r.progress * 100)}%` }} /></span><span className="muted" style={{ fontSize: 12 }}>{Math.round(r.progress * 100)} %</span></td>
                  <td style={{ color: 'var(--danger)' }}>{formatBytes(r.downloaded)}</td>
                  <td style={{ color: 'var(--success)' }}>{formatBytes(r.uploaded)}</td>
                  <td className="muted">{timeAgo(r.lastAnnounceAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}

        {tab === 'completed' && (data.completed.length === 0 ? <p className="muted" style={{ margin: 0 }}>Aucun téléchargement terminé pour l'instant.</p> : (
          <table className="act-table">
            <thead><tr><th>Torrent</th><th>Taille</th><th>Terminé</th><th>Seed cumulé</th><th>Obligation de partage</th></tr></thead>
            <tbody>
              {data.completed.map((r) => (
                <tr key={r.torrentId}>
                  {nameCell(r.torrentId, r.name, r.coverImage)}
                  <td className="muted">{formatBytes(r.size)}</td>
                  <td className="muted">{timeAgo(r.completedAt)}</td>
                  <td>{hours(r.seedSeconds)}{r.seedingNow && <span className="seedpage-chip seeding" style={{ marginLeft: 8 }}>🟢 En seed</span>}</td>
                  <td>
                    {r.own ? <span className="muted">Ton envoi : aucune obligation</span>
                      : r.satisfied ? <span className="seedpage-chip done">✅ Terminée</span>
                      : r.hnr ? <Link to="/hit-and-run" className="seedpage-chip hnr">🔴 Hit & run</Link>
                      : <span className="seedpage-chip idle">⏳ Encore {hours(Math.max(0, r.requiredSeconds - r.seedSeconds))}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}

        {tab === 'uploads' && (data.uploads.length === 0 ? <p className="muted" style={{ margin: 0 }}>Tu n'as pas encore envoyé de torrent. <Link to="/upload">Envoyer un torrent →</Link></p> : (
          <table className="act-table">
            <thead><tr><th>Torrent</th><th>Taille</th><th>Statut</th><th>Seeders</th><th>Leechers</th><th>Complétés</th><th>Envoyé</th></tr></thead>
            <tbody>
              {data.uploads.map((r) => (
                <tr key={r.id}>
                  {nameCell(r.id, r.name, r.coverImage)}
                  <td className="muted">{formatBytes(r.size)}</td>
                  <td>{STATUS[r.status] ?? r.status}</td>
                  <td style={{ color: 'var(--success)' }}>{r.seeders}</td>
                  <td style={{ color: 'var(--danger)' }}>{r.leechers}</td>
                  <td>{r.completedCount}</td>
                  <td className="muted">{timeAgo(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  );
}
