import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { ChatText } from '../../lib/chatFormat';
import { useMessenger, type ConvSummary } from '../../store/messenger';

const key = (id: string) => `msgr:motd:${id}`;
const readSeen = (id: string) => { try { return localStorage.getItem(key(id)); } catch { return null; } };
const writeSeen = (id: string, at: string) => { try { localStorage.setItem(key(id), at); } catch { /* navigation privée */ } };

/**
 * Message du jour d'un canal, affiché sous l'en-tête. Chacun peut le replier (il revient dès que l'équipe le modifie) ;
 * l'équipe peut l'écrire, le modifier ou l'effacer (bouton 📢 de l'en-tête).
 */
export default function MotdBanner({ conv, editing, onCloseEditor }: { conv: ConvSummary; editing: boolean; onCloseEditor: () => void }) {
  const patch = useMessenger((s) => s.patchConversation);
  const [hiddenAt, setHiddenAt] = useState<string | null>(() => readSeen(conv.id));
  const [text, setText] = useState(conv.motd ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setHiddenAt(readSeen(conv.id)); }, [conv.id]);
  useEffect(() => { if (editing) setText(conv.motd ?? ''); }, [editing, conv.motd]);

  async function save(value: string) {
    setBusy(true); setError('');
    try {
      const { data } = await api.put(`/messenger/conversations/${conv.id}/motd`, { motd: value });
      patch(conv.id, { motd: data.motd, motdAt: data.motdAt });
      onCloseEditor();
    } catch (err: any) { setError(err.response?.data?.message ?? 'Enregistrement impossible'); }
    finally { setBusy(false); }
  }

  if (editing) {
    return (
      <div className="msgr-motd editing">
        <strong>📢 Message du jour de #{conv.name}</strong>
        <textarea rows={4} maxLength={1000} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Bienvenue ! Les règles du canal, une annonce, un lien utile… (affiché en haut du canal pour tout le monde)" />
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" disabled={busy} onClick={() => save(text)}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
          {conv.motd && <button type="button" className="secondary" disabled={busy} onClick={() => { if (window.confirm('Effacer le message du jour ?')) void save(''); }}>Effacer</button>}
          <button type="button" className="secondary" onClick={onCloseEditor}>Annuler</button>
          <span className="muted">{text.length}/1000</span>
        </div>
        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
      </div>
    );
  }

  if (!conv.motd || !conv.motdAt) return null;
  const collapsed = hiddenAt === conv.motdAt;
  if (collapsed) {
    return <button type="button" className="msgr-motd-chip" onClick={() => { setHiddenAt(null); writeSeen(conv.id, ''); }}>📢 Message du jour</button>;
  }
  return (
    <div className="msgr-motd">
      <div className="msgr-motd-text"><strong>📢 Message du jour</strong><div><ChatText text={conv.motd} /></div></div>
      <button type="button" className="msgr-motd-close" title="Replier (il réapparaîtra s'il change)" onClick={() => { writeSeen(conv.id, conv.motdAt!); setHiddenAt(conv.motdAt!); }}>✕</button>
    </div>
  );
}
