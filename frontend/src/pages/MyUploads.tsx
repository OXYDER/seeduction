import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import { HOLD_REASONS, type HoldInfo, type ResubmitInfo } from '../lib/holdReasons';

interface Row {
  id: string; name: string; size: number; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DEAD'; createdAt: string; coverImage: string | null; category: string | null;
  seeders: number; leechers: number; completed: number; seedingNow: boolean; hold: HoldInfo | null; resubmitted: ResubmitInfo | null; rejectReason: string | null;
}

type Filter = 'todo' | 'pending' | 'approved' | 'all';

function stateOf(r: Row): { key: string; label: string; tone: string } {
  if (r.status === 'PENDING' && r.hold) return { key: 'hold', label: '✏️ Correction demandée', tone: 'warn' };
  if (r.status === 'PENDING') return { key: 'pending', label: r.resubmitted ? '🕓 Renvoyé, en attente' : '🕓 En attente de validation', tone: 'wait' };
  if (r.status === 'REJECTED') return { key: 'rejected', label: '✕ Rejeté', tone: 'bad' };
  if (r.status === 'DEAD') return { key: 'dead', label: '☠️ Sans seeder', tone: 'bad' };
  return { key: 'approved', label: '✓ Approuvé', tone: 'ok' };
}

/** Mes envois : tous les torrents que j'ai publiés, leur état, ce que l'équipe me demande de corriger, et le lien pour les modifier. */
export default function MyUploads() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter | null>(null);
  const load = useCallback(() => api.get('/my-torrents').then((r) => { setRows(r.data); setError(''); }).catch(() => setError('Impossible de charger tes envois')), []);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const c = { todo: 0, pending: 0, approved: 0, all: rows?.length ?? 0 };
    for (const r of rows ?? []) { const k = stateOf(r).key; if (k === 'hold' || k === 'rejected') c.todo++; if (k === 'pending' || k === 'hold') c.pending++; if (k === 'approved' || k === 'dead') c.approved++; }
    return c;
  }, [rows]);
  const active: Filter = filter ?? (counts.todo > 0 ? 'todo' : counts.pending > 0 ? 'pending' : 'all');
  const shown = (rows ?? []).filter((r) => {
    const k = stateOf(r).key;
    return active === 'all' || (active === 'todo' && (k === 'hold' || k === 'rejected')) || (active === 'pending' && (k === 'pending' || k === 'hold')) || (active === 'approved' && (k === 'approved' || k === 'dead'));
  });

  if (!rows) return <p className="muted">{error || 'Chargement…'}</p>;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>📦 Mes envois</h1>
        <Link to="/upload" className="muted">⬆️ Envoyer un torrent →</Link>
      </div>

      <div className="panel muted" style={{ fontSize: 13.5 }}>
        Tous les torrents que tu as envoyés. Tant qu'un torrent n'est pas approuvé, tu peux le <strong>modifier</strong> (nom, catégorie, fiche, description, NFO...) avec le bouton « ✏️ Modifier ».
        Si l'équipe te demande une correction, elle te le dit ici et dans tes notifications : corrige, puis clique sur « J'ai corrigé » sur la fiche du torrent pour le renvoyer en validation. Garde tes torrents en seed : sans seeder, ils ne peuvent pas être approuvés.
      </div>

      <div className="mod-filters">
        {([['todo', 'À corriger'], ['pending', 'En attente'], ['approved', 'Approuvés'], ['all', 'Tous']] as [Filter, string][]).map(([k, label]) => (
          <button key={k} type="button" className={`secondary${active === k ? ' on' : ''}`} onClick={() => setFilter(k)}>{label} ({counts[k]})</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="panel mod-empty"><div style={{ fontSize: 34 }}>{active === 'todo' ? '🎉' : '📭'}</div><strong>{active === 'todo' ? 'Rien à corriger' : 'Aucun torrent ici'}</strong></div>
      ) : (
        <div className="mod-list">
          {shown.map((r) => {
            const st = stateOf(r);
            const editable = r.status === 'PENDING' || r.status === 'REJECTED';
            return (
              <article key={r.id} className={`mod-card myup ${st.tone}`}>
                <Link to={`/torrents/${r.id}`} className="mod-cover small" title="Ouvrir la fiche">{r.coverImage ? <img src={r.coverImage} alt="" loading="lazy" /> : <span>🎬</span>}</Link>
                <div className="mod-body">
                  <div><Link to={`/torrents/${r.id}`} className="mod-title">{r.name}</Link></div>
                  <div className="mod-meta">
                    <span className={`myup-state ${st.tone}`}>{st.label}</span> · {formatBytes(r.size)}{r.category ? ` · ${r.category}` : ''} · envoyé {timeAgo(r.createdAt)}
                    {r.status === 'APPROVED' || r.status === 'DEAD' ? <> · {r.seeders} seeder{r.seeders > 1 ? 's' : ''} · {r.completed} téléchargement{r.completed > 1 ? 's' : ''}</> : null}
                  </div>
                  {r.status === 'PENDING' && !r.seedingNow && <div className="myup-hint">⚠ Ton client ne seede pas ce torrent en ce moment : sans seed, il ne pourra pas être approuvé.</div>}
                  {r.hold && (
                    <div className="myup-note">
                      <strong>L'équipe demande :</strong>
                      <ul>{r.hold.reasons.map((x) => <li key={x}>{HOLD_REASONS[x] ?? x}</li>)}</ul>
                      {r.hold.note && <div>« {r.hold.note} » <span className="muted">— {r.hold.by ?? 'l\'équipe'}</span></div>}
                    </div>
                  )}
                  {r.rejectReason && <div className="myup-note"><strong>Motif du rejet :</strong> « {r.rejectReason} »</div>}
                </div>
                <div className="mod-actions">
                  {editable && <Link to={`/torrents/${r.id}?edit=1`} className="mod-link">✏️ Modifier</Link>}
                  {r.hold && <Link to={`/torrents/${r.id}?edit=1`} className="mod-link">✅ J'ai corrigé</Link>}
                  <Link to={`/torrents/${r.id}`} className="mod-link">👁 Voir</Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
