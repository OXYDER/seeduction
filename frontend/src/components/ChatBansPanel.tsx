import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';
import Avatar from './Avatar';
import Loading from './Loading';

interface BanRow {
  id: string; user: { id: string; username: string; avatarUrl?: string | null }; reason: string; issuedByName: string;
  expiresAt: string | null; createdAt: string; scope: string;
}

/** Modération : les membres actuellement bannis du chat (qui, où, pourquoi, jusqu'à quand), avec un bouton pour lever le bannissement. */
export default function ChatBansPanel() {
  const [rows, setRows] = useState<BanRow[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { api.get('/messenger/bans').then((r) => setRows(r.data)).catch(() => setRows([])); }, []);
  useEffect(load, [load]);

  async function lift(b: BanRow) {
    if (!window.confirm(`Lever le bannissement de ${b.user.username} ?`)) return;
    setError('');
    try { await api.delete(`/messenger/bans/${b.id}`); load(); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
  }

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>🚫 Bannis du chat</h3>
      <p className="muted" style={{ marginTop: 0 }}>Pour bannir un membre, ouvre le menu ⋯ d'un de ses messages dans un canal public et choisis « Bannir du chat ».</p>
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
      {rows === null && <Loading />}
      {rows?.length === 0 && <p className="muted">Personne n'est banni du chat en ce moment.</p>}
      <div className="grid" style={{ gap: 10 }}>
        {rows?.map((b) => (
          <div key={b.id} className="row" style={{ gap: 10, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <Avatar user={b.user} size={32} />
              <span>
                <Link to={`/users/${b.user.id}`}><strong>{b.user.username}</strong></Link> <span className="badge">{b.scope}</span><br />
                <span style={{ fontSize: 13 }}>« {b.reason} »</span><br />
                <span className="muted" style={{ fontSize: 12 }}>
                  Par {b.issuedByName} · {timeAgo(b.createdAt)} · {b.expiresAt ? `jusqu'au ${new Date(b.expiresAt).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })}` : 'définitif'}
                </span>
              </span>
            </span>
            <button type="button" className="secondary" onClick={() => lift(b)}>Lever</button>
          </div>
        ))}
      </div>
    </div>
  );
}
