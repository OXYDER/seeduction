import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useMessenger, type ConvSummary, type Msg } from '../../store/messenger';
import ConvAvatar from './ConvAvatar';

/** Transférer un message dans une autre conversation (privée, groupe ou canal où l'on peut écrire). */
export default function ForwardModal({ msg, onClose }: { msg: Msg; onClose: () => void }) {
  const conversations = useMessenger((s) => s.conversations);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return conversations.filter((c) => !c.archived && c.writable && !c.ban && (!term || (c.name ?? '').toLowerCase().includes(term)));
  }, [conversations, q]);

  async function forward(c: ConvSummary) {
    setBusy(c.id); setError('');
    try {
      await api.post(`/messenger/messages/${msg.id}/forward`, { conversationId: c.id });
      setDone(c.type === 'CHANNEL' ? `#${c.name}` : c.name ?? 'la conversation');
    } catch (err: any) { setError(err.response?.data?.message ?? 'Transfert impossible'); }
    finally { setBusy(null); }
  }

  return (
    <div className="msgr-modal-backdrop" onClick={onClose}>
      <div className="msgr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Transférer le message">
        <div className="msgr-modal-head">
          <strong>↪ Transférer le message</strong>
          <button type="button" className="dm-icon-btn" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <blockquote className="msgr-mod-quote"><strong>{msg.sender.username}</strong> : {msg.content ? msg.content.slice(0, 160) : msg.type === 'IMAGE' || msg.type === 'GIF' ? '[image]' : msg.fileName ? `[fichier] ${msg.fileName}` : msg.torrent ? '[torrent partagé]' : '[message]'}</blockquote>
        {done ? (
          <>
            <p style={{ margin: 0 }}>✓ Message transféré dans {done}.</p>
            <button type="button" onClick={onClose}>Fermer</button>
          </>
        ) : (
          <>
            <input placeholder="Choisir une conversation…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
            <div className="msgr-fwd-list">
              {list.length === 0 && <span className="muted">Aucune conversation disponible.</span>}
              {list.map((c) => (
                <button key={c.id} type="button" className="msgr-fwd-item" disabled={busy !== null} onClick={() => forward(c)}>
                  <ConvAvatar conv={c} size={34} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{c.type === 'CHANNEL' ? '# ' : ''}{c.name}<br /><span className="muted" style={{ fontSize: 12 }}>{c.type === 'CHANNEL' ? 'Canal public' : c.type === 'GROUP' ? 'Groupe' : 'Conversation privée'}</span></span>
                  <span className="msgr-fwd-go">{busy === c.id ? '…' : 'Envoyer'}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
