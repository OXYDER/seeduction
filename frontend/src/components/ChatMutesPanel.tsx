import Nick from './Nick';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useMessenger } from '../store/messenger';
import Avatar from './Avatar';
import Loading from './Loading';

interface Row { userId: string; username: string; avatarUrl?: string | null; expiresAt: string | null }

const until = (d: string | null) => (d ? `jusqu'au ${new Date(d).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })}` : 'sans limite');

/** Compte : les membres que j'ai mis en sourdine dans le chat (leurs messages n'apparaissent plus chez moi), avec la fin de la sourdine et un bouton pour la lever. */
export default function ChatMutesPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const mutes = useMessenger((s) => s.mutes);
  const removeMute = useMessenger((s) => s.removeMute);

  useEffect(() => { api.get('/messenger/mutes').then((r) => setRows(r.data)).catch(() => setRows([])); }, [mutes]);

  return (
    <div className="panel">
      <h3>🔇 Membres en sourdine</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Depuis le menu ⋯ d'un message du chat, tu peux mettre un membre en sourdine pour une durée : tu ne vois plus ses messages (ni notifications, ni non lus). Il n'en est jamais prévenu.
      </p>
      {rows === null && <Loading />}
      {rows?.length === 0 && <p className="muted">Personne n'est en sourdine.</p>}
      <div className="grid" style={{ gap: 8 }}>
        {rows?.map((r) => (
          <div key={r.userId} className="row" style={{ gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="row" style={{ gap: 8, alignItems: 'center' }}>
              <Avatar user={{ username: r.username, avatarUrl: r.avatarUrl }} size={28} />
              <span><strong><Nick name={r.username} /></strong> <span className="muted" style={{ fontSize: 12 }}>· {until(r.expiresAt)}</span></span>
            </span>
            <button type="button" className="secondary" onClick={() => removeMute(r.userId)}>Réactiver</button>
          </div>
        ))}
      </div>
    </div>
  );
}
