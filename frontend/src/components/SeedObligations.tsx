import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';

interface SeedItem {
  torrentId: string; name: string; coverImage: string | null; size: number; completedAt: string;
  seedSeconds: number; requiredSeconds: number; remainingSeconds: number; ratio: number; deadline: string;
  status: 'hnr' | 'idle' | 'seeding';
}
interface SeedData {
  rules: { hnrSeedHours: number; hnrRatio: number; hnrGraceHours: number };
  counts: { total: number; hnr: number; idle: number; seeding: number };
  items: SeedItem[];
}

const hours = (secs: number) => (secs >= 3600 ? `${Math.round(secs / 360) / 10} h`.replace('.', ',') : `${Math.max(0, Math.round(secs / 60))} min`);
const dayTime = (iso: string) => new Date(iso).toLocaleString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Icône 🌱 du menu du haut : les torrents téléchargés récemment dont l'obligation de seed n'est pas encore remplie.
 * La pastille est verte quand tout est en seed, orange si un torrent ne seede pas en ce moment, rouge s'il y a un hit & run.
 * N'apparaît que s'il y a quelque chose à terminer.
 */
export default function SeedObligations() {
  const [data, setData] = useState<SeedData | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => { api.get('/bonus/seeds').then((r) => setData(r.data)).catch(() => {}); }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 3 * 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    function outside(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  if (!data || data.counts.total === 0) return null;
  const tone = data.counts.hnr > 0 ? 'bad' : data.counts.idle > 0 ? 'warn' : 'ok';
  const { rules } = data;

  return (
    <div ref={ref} className="seedob" style={{ position: 'relative' }}>
      <button
        type="button"
        className={`secondary seedob-btn ${tone}`}
        title={`${data.counts.total} torrent${data.counts.total > 1 ? 's' : ''} à seeder encore`}
        aria-label={`Seeds à terminer : ${data.counts.total}`}
        aria-expanded={open}
        onClick={() => { if (!open) load(); setOpen((v) => !v); }}
      >
        🌱<span className={`seedob-badge ${tone}`}>{data.counts.total}</span>
      </button>
      {open && (
        <div className="seedob-pop" role="dialog" aria-label="Seeds à terminer">
          <div className="seedob-head">
            <strong>Seeds à terminer</strong>
            <span className="muted">{rules.hnrSeedHours} h de seed (ou ratio {String(rules.hnrRatio).replace('.', ',')}) par torrent</span>
          </div>
          <div className="seedob-list">
            {data.items.map((i) => {
              const pct = Math.min(100, Math.round((i.seedSeconds / i.requiredSeconds) * 100));
              return (
                <Link key={i.torrentId} to={`/torrents/${i.torrentId}`} className="seedob-item" onClick={() => setOpen(false)}>
                  {i.coverImage ? <img src={i.coverImage} alt="" className="seedob-cover" /> : <span className="seedob-cover plain">🎬</span>}
                  <span className="seedob-text">
                    <span className="seedob-name">{i.name}</span>
                    <span className="seedob-bar"><span className={i.status} style={{ width: `${pct}%` }} /></span>
                    <span className="seedob-sub">
                      {hours(i.seedSeconds)} / {rules.hnrSeedHours} h · ratio {String(i.ratio).replace('.', ',')} / {String(rules.hnrRatio).replace('.', ',')} · {formatBytes(i.size)}
                    </span>
                    <span className={`seedob-status ${i.status}`}>
                      {i.status === 'seeding' && `🟢 En seed — encore ${hours(i.remainingSeconds)}`}
                      {i.status === 'idle' && `🟠 Ne seede pas — relance-le avant le ${dayTime(i.deadline)}`}
                      {i.status === 'hnr' && '🔴 Hit & run — reprends le seed pour régulariser'}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
          <Link to="/bonus" className="seedob-foot" onClick={() => setOpen(false)}>Règle du seed et points bonus →</Link>
        </div>
      )}
    </div>
  );
}
