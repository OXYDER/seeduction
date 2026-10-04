import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { ChatText, clock, dayLabel } from '../../lib/chatFormat';
import type { Msg } from '../../store/messenger';

interface PinnedMsg extends Msg { pinnedAt: string }

const previewOf = (m: Msg) => {
  if (m.deleted) return 'Message supprimé';
  if (m.content) return m.content.replace(/\s+/g, ' ');
  if (m.type === 'IMAGE' || m.type === 'GIF') return '📷 Photo';
  if (m.type === 'VOICE') return '🎤 Message vocal';
  if (m.type === 'FILE') return `📎 ${m.fileName ?? 'Fichier'}`;
  return m.torrent ? '🎞️ Torrent partagé' : 'Pièce jointe';
};

/**
 * Messages épinglés d'une conversation, comme Discord et Telegram : une barre en haut qui montre le dernier épinglé (un clic
 * y amène, et passe au suivant s'il y en a plusieurs) et une liste de tous les messages épinglés avec leur contenu.
 */
export default function PinBar({ conversationId, pinnedIds, canPin, onJump, me }: {
  conversationId: string;
  pinnedIds: string[];
  canPin: boolean;
  /** Fait défiler jusqu'au message ; renvoie faux s'il n'est pas dans la partie du fil déjà chargée. */
  onJump: (id: string) => boolean;
  me?: string;
}) {
  const [pins, setPins] = useState<PinnedMsg[]>([]);
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const key = pinnedIds.join(',');

  const load = useCallback(() => {
    if (!key) { setPins([]); return; }
    api.get(`/messenger/conversations/${conversationId}/pins`).then((r) => setPins(r.data)).catch(() => {});
  }, [conversationId, key]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setIdx(0); setOpen(false); }, [conversationId]);
  useEffect(() => { if (idx >= pins.length) setIdx(0); }, [pins.length, idx]);

  async function unpin(id: string) {
    try { await api.delete(`/messenger/conversations/${conversationId}/pins/${id}`); }
    catch (err: any) { window.alert(err.response?.data?.message ?? "Impossible de désépingler"); }
  }

  if (pins.length === 0) return null;
  const current = pins[Math.min(idx, pins.length - 1)];

  function goto(m: PinnedMsg) {
    if (!onJump(m.id)) setOpen(true); // message ancien, pas encore chargé : on l'affiche dans la liste
  }

  return (
    <div className="msgr-pinbar-wrap">
      <div className="msgr-pinbar">
        <button type="button" className="msgr-pinbar-main" title="Aller au message épinglé" onClick={() => { goto(current); if (pins.length > 1) setIdx((i) => (i + 1) % pins.length); }}>
          <span className="msgr-pin-icon">📌</span>
          <span className="msgr-pin-text">
            <strong>{pins.length > 1 ? `Message épinglé ${Math.min(idx, pins.length - 1) + 1}/${pins.length}` : 'Message épinglé'}</strong>
            <span>{current.sender.username} : {previewOf(current).slice(0, 140)}</span>
          </span>
        </button>
        <button type="button" className="msgr-pinbar-all" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? '✕' : `☰ ${pins.length}`}</button>
      </div>
      {open && (
        <div className="msgr-pinpanel">
          <div className="msgr-pinpanel-head"><strong>📌 Messages épinglés ({pins.length})</strong></div>
          {pins.map((m) => (
            <div key={m.id} className="msgr-pinitem">
              <div className="msgr-pinitem-head">
                <strong>{m.sender.id === me ? 'Toi' : m.sender.username}</strong>
                <span className="muted">{dayLabel(m.createdAt)} {clock(m.createdAt)}</span>
              </div>
              <div className="msgr-pinitem-body">
                {m.content ? <ChatText text={m.content} /> : <span className="muted">{previewOf(m)}</span>}
                {m.imageUrl && <img src={m.imageUrl} alt="" loading="lazy" />}
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="secondary" onClick={() => { if (onJump(m.id)) setOpen(false); }}>Aller au message</button>
                {canPin && <button type="button" className="secondary" onClick={() => unpin(m.id)}>Désépingler</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
