import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api/client';
import { formatBytes } from '../../lib/format';
import { HealthDot } from '../TorrentBits';

/** Choisir un torrent à envoyer dans la conversation (recherche, ou parmi tes favoris) : sa fiche s'affiche dans la bulle. */
export default function ShareTorrentModal({ onPick, onClose }: { onPick: (torrentId: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'search' | 'favorites'>('search');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const handle = window.setTimeout(() => {
      const req = tab === 'favorites'
        ? api.get('/favorites').then((r) => r.data as any[])
        : q.trim().length >= 2 ? api.get('/torrents', { params: { search: q.trim(), pageSize: 12, sort: 'seeders' } }).then((r) => r.data.items as any[]) : Promise.resolve([] as any[]);
      req.then((rows) => { if (!cancelled) setItems(rows); }).catch(() => { if (!cancelled) setItems([]); }).finally(() => { if (!cancelled) setLoading(false); });
    }, tab === 'search' ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(handle); };
  }, [q, tab]);

  return createPortal(
    <div className="msgr-modal-backdrop" onClick={onClose}>
      <div className="msgr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Partager un torrent">
        <div className="msgr-modal-head">
          <strong>🎬 Partager un torrent</strong>
          <button type="button" className="dm-icon-btn" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className={tab === 'search' ? '' : 'secondary'} onClick={() => setTab('search')}>Rechercher</button>
          <button type="button" className={tab === 'favorites' ? '' : 'secondary'} onClick={() => setTab('favorites')}>⭐ Mes favoris</button>
        </div>
        {tab === 'search' && <input autoFocus placeholder="Titre du torrent…" value={q} onChange={(e) => setQ(e.target.value)} />}
        <div className="msgr-share-list">
          {loading && <p className="muted">Recherche…</p>}
          {!loading && items.length === 0 && <p className="muted">{tab === 'search' ? (q.trim().length < 2 ? 'Tape au moins 2 lettres.' : 'Aucun résultat.') : 'Aucun favori pour l\'instant.'}</p>}
          {items.map((t) => (
            <button key={t.id} type="button" className="msgr-share-item" onClick={() => onPick(t.id)}>
              {t.coverImage ? <img src={t.coverImage} alt="" /> : <span className="msgr-torrent-fallback">🎬</span>}
              <span style={{ minWidth: 0 }}>
                <strong>{t.name}</strong>
                <span className="muted" style={{ display: 'block', fontSize: 12 }}>{[t.category?.name, t.year, t.resolution, formatBytes(t.size)].filter(Boolean).join(' · ')}</span>
              </span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', fontSize: 12 }}><HealthDot seeders={t.seeders ?? 0} />{t.seeders ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
