import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';
import { useMsgRequest } from '../store/msgRequest';
import { useMessenger } from '../store/messenger';
import UserLink from './UserLink';

interface Person { id: string; username: string; avatarUrl?: string | null; role?: string }
interface Data {
  incoming: { id: string; intro: string | null; createdAt: string; from: Person | null }[];
  outgoing: { id: string; status: string; createdAt: string; to: Person | null }[];
  pendingCount: number;
}

const OUT_LABEL: Record<string, string> = { PENDING: '⏳ En attente de sa réponse', ACCEPTED: '✅ Acceptée : vous pouvez discuter', DECLINED: 'Pas donnée suite' };

/** Messages > demandes de message : celles qu'on a reçues (accepter / refuser) et l'état de celles qu'on a envoyées. N'apparaît que s'il y a quelque chose à montrer. */
export default function MessageRequestsPanel({ forceOpen }: { forceOpen?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const sentTick = useMsgRequest((s) => s.sentTick);
  const openDirect = useMessenger((s) => s.openDirect);

  const load = useCallback(() => { api.get('/message-requests').then((r) => setData(r.data)).catch(() => setData(null)); }, []);
  useEffect(() => { load(); }, [load, sentTick]);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) load(); }, 30_000); return () => clearInterval(t); }, [load]);

  async function act(id: string, kind: 'accept' | 'decline' | 'cancel', person?: Person | null) {
    setBusy(id); setError('');
    try {
      if (kind === 'cancel') await api.delete('/message-requests/' + id); else await api.post('/message-requests/' + id + '/' + kind);
      load();
      if (kind === 'accept' && person) void openDirect({ id: person.id, username: person.username, avatarUrl: person.avatarUrl });
    } catch (e: any) { setError(e.response?.data?.message ?? 'Action impossible'); } finally { setBusy(''); }
  }

  if (!data) return null;
  const recent = data.outgoing.filter((o) => o.status !== 'ACCEPTED' || Date.now() - new Date(o.createdAt).getTime() < 7 * 86400_000);
  if (data.incoming.length === 0 && recent.length === 0 && !forceOpen) return null;

  return (
    <section className="panel" style={{ display: 'grid', gap: 10, marginBottom: 14 }} aria-label="Demandes de message">
      <h3 style={{ margin: 0 }}>✉️ Demandes de message {data.pendingCount > 0 && <span className="badge new">{data.pendingCount}</span>}</h3>
      {error && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</span>}
      {data.incoming.length === 0 && <span className="muted" style={{ fontSize: 13 }}>Aucune demande reçue. Quand un membre voudra t'écrire sans être ton ami, sa demande apparaîtra ici : tu l'acceptes ou tu l'ignores.</span>}
      {data.incoming.map((r) => (
        <div key={r.id} style={{ display: 'grid', gap: 6, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.05)' }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span>{r.from ? <UserLink user={r.from} /> : 'Un membre'} <span className="muted" style={{ fontSize: 12 }}>voudrait t'écrire · {timeAgo(r.createdAt)}</span></span>
            <span className="row" style={{ gap: 8 }}>
              <button type="button" disabled={busy === r.id} onClick={() => act(r.id, 'accept', r.from)}>Accepter</button>
              <button type="button" className="secondary" disabled={busy === r.id} onClick={() => act(r.id, 'decline')}>Refuser</button>
            </span>
          </div>
          {r.intro && <div className="muted" style={{ fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>« {r.intro} »</div>}
        </div>
      ))}
      {recent.length > 0 && (
        <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
          <strong style={{ fontSize: 13 }}>Tes demandes envoyées</strong>
          {recent.map((o) => (
            <div key={o.id} className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
              <span>{o.to ? <UserLink user={o.to} /> : 'Un membre'} <span className="muted">· {OUT_LABEL[o.status] ?? o.status}</span></span>
              {o.status === 'PENDING' && <button type="button" className="secondary" style={{ padding: '2px 10px', fontSize: 12 }} disabled={busy === o.id} onClick={() => act(o.id, 'cancel')}>Annuler</button>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
