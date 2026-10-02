import { memo, useState } from 'react';
import { useMessenger, type ConvSummary, type Msg } from '../../store/messenger';
import { useAuthStore } from '../../store/auth';
import { QUICK_REACTIONS, EMOJI_GRID } from '../../lib/emoji';
import { ChatText, clock, isBigEmoji } from '../../lib/chatFormat';
import { formatBytes } from '../../lib/format';
import Avatar from '../Avatar';
import UserLink from '../UserLink';
import TorrentCard from './TorrentCard';
import Lightbox from './Lightbox';
import VoicePlayer from './VoicePlayer';

export interface Reader { userId: string; username: string; avatarUrl?: string | null }

interface Props {
  msg: Msg;
  conv: ConvSummary;
  /** Premier / dernier message d'une série du même auteur (avatar, nom, heure). */
  first: boolean;
  last: boolean;
  readers: Reader[];
  highlighted?: boolean;
  canModerate: boolean;
  canPin: boolean;
  onReply: (m: Msg) => void;
  onEdit: (m: Msg) => void;
  onJump: (id: string) => void;
  onPin: (m: Msg) => void;
}

function ReactionPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [full, setFull] = useState(false);
  return (
    <div className="msgr-reaction-picker" onClick={(e) => e.stopPropagation()}>
      {!full ? (
        <>
          {QUICK_REACTIONS.map((e) => <button key={e} type="button" onClick={() => onPick(e)}>{e}</button>)}
          <button type="button" title="Plus d'émojis" onClick={() => setFull(true)}>➕</button>
        </>
      ) : (
        <div className="chat-emoji-grid">{EMOJI_GRID.map((e) => <button key={e} type="button" onClick={() => onPick(e)}>{e}</button>)}</div>
      )}
    </div>
  );
}

function MessageItemBase({ msg, conv, first, last, readers, highlighted, canModerate, canPin, onReply, onEdit, onJump, onPin }: Props) {
  const me = useAuthStore((s) => s.user);
  const react = useMessenger((s) => s.react);
  const remove = useMessenger((s) => s.remove);
  const retry = useMessenger((s) => s.retry);
  const dismissFailed = useMessenger((s) => s.dismissFailed);
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const mine = msg.sender.id === me?.id;
  const group = conv.type !== 'DIRECT';

  if (msg.type === 'SYSTEM') return <div className="msgr-system">{msg.content}</div>;

  const big = !msg.deleted && msg.type === 'TEXT' && !msg.replyTo && isBigEmoji(msg.content);
  const canEdit = mine && msg.type === 'TEXT' && !msg.deleted && !msg.pending && !msg.failed;
  const canDelete = !msg.deleted && !msg.pending && !msg.failed && (mine || canModerate);

  async function doDelete() {
    setMenu(false);
    if (!window.confirm(mine ? 'Annuler l\'envoi de ce message ?' : 'Supprimer ce message pour tout le monde ?')) return;
    const err = await remove(msg.id);
    if (err) window.alert(err);
  }

  const avatar = !mine && group ? (
    <span className="msgr-avatar-slot">{last ? <Avatar user={msg.sender} size={28} /> : null}</span>
  ) : null;

  return (
    <div id={`msg-${msg.id}`} className={`msgr-row ${mine ? 'mine' : 'them'}${first ? ' first' : ''}${last ? ' last' : ''}${highlighted ? ' flash' : ''}`}>
      {avatar}
      <div className="msgr-col">
        {first && group && !mine && <div className="msgr-sender"><UserLink user={msg.sender} /></div>}

        {msg.replyTo && !msg.deleted && (
          <button type="button" className="msgr-reply-quote" onClick={() => onJump(msg.replyTo!.id)} title="Voir le message d'origine">
            <strong>↩ {msg.replyTo.senderId === me?.id ? 'Toi' : msg.replyTo.senderUsername}</strong>
            <span>{msg.replyTo.preview || '…'}</span>
          </button>
        )}

        <div className="msgr-bubble-wrap" onMouseLeave={() => { setPicker(false); setMenu(false); }}>
          {msg.deleted ? (
            <div className="msgr-bubble deleted">Message supprimé</div>
          ) : (
            <>
              {(msg.content || msg.type === 'TEXT') && msg.content && (
                <div className={`msgr-bubble${big ? ' big-emoji' : ''}${msg.pending ? ' pending' : ''}${msg.failed ? ' failed' : ''}`}>
                  <ChatText text={msg.content} myUsername={me?.username} />
                  {msg.editedAt && <span className="msgr-edited"> (modifié)</span>}
                </div>
              )}
              {(msg.type === 'IMAGE' || msg.type === 'GIF') && msg.imageUrl && (
                <img src={msg.imageUrl} alt="" className={`msgr-image${msg.pending ? ' pending' : ''}`} loading="lazy" onClick={() => setLightbox(msg.imageUrl!)} />
              )}
              {msg.type === 'VOICE' && msg.fileUrl && (
                <div className={`msgr-bubble msgr-voice${msg.pending ? ' pending' : ''}`}>
                  <VoicePlayer src={msg.fileUrl} durationMs={msg.durationMs} />
                </div>
              )}
              {msg.type === 'FILE' && msg.fileUrl && (
                <a href={msg.fileUrl} download className="msgr-file">
                  <span className="msgr-file-icon">📎</span>
                  <span><strong>{msg.fileName ?? 'Fichier'}</strong>{msg.fileSize ? <span className="muted"> · {formatBytes(msg.fileSize)}</span> : null}</span>
                </a>
              )}
              {msg.torrent && <TorrentCard t={msg.torrent} />}
            </>
          )}

          {!msg.deleted && !msg.pending && !msg.failed && (
            <div className="msgr-tools">
              <button type="button" title="Réagir" onClick={() => { setPicker((v) => !v); setMenu(false); }}>😊</button>
              <button type="button" title="Répondre" onClick={() => onReply(msg)}>↩</button>
              <button type="button" title="Plus" onClick={() => { setMenu((v) => !v); setPicker(false); }}>⋯</button>
              {picker && <ReactionPicker onPick={(e) => { react(msg.id, e); setPicker(false); }} />}
              {menu && (
                <div className="msgr-menu" onClick={(e) => e.stopPropagation()}>
                  {msg.content && <button type="button" onClick={() => { navigator.clipboard?.writeText(msg.content).catch(() => {}); setMenu(false); }}>📋 Copier le texte</button>}
                  {canEdit && <button type="button" onClick={() => { setMenu(false); onEdit(msg); }}>✏️ Modifier</button>}
                  {canPin && <button type="button" onClick={() => { setMenu(false); onPin(msg); }}>{conv.pinnedMessageId === msg.id ? '📌 Désépingler' : '📌 Épingler'}</button>}
                  {canDelete && <button type="button" className="danger" onClick={doDelete}>🗑️ {mine ? 'Annuler l\'envoi' : 'Supprimer'}</button>}
                </div>
              )}
            </div>
          )}
        </div>

        {msg.reactions.length > 0 && (
          <div className="msgr-reactions">
            {msg.reactions.map((r) => (
              <button key={r.emoji} type="button" className={r.userIds.includes(me?.id ?? '') ? 'on' : ''} onClick={() => react(msg.id, r.emoji)} title={`${r.userIds.length} réaction(s)`}>
                {r.emoji} {r.userIds.length > 1 ? r.userIds.length : ''}
              </button>
            ))}
          </div>
        )}

        {msg.failed && (
          <div className="msgr-failed">
            ⚠️ {msg.failed} · <button type="button" onClick={() => retry(msg.conversationId, msg.id)}>Réessayer</button> · <button type="button" onClick={() => dismissFailed(msg.conversationId, msg.id)}>Supprimer</button>
          </div>
        )}

        {last && !msg.failed && (
          <div className="msgr-meta">
            {clock(msg.createdAt)}{msg.pending ? ' · envoi…' : ''}
          </div>
        )}

        {readers.length > 0 && (
          <div className="msgr-seen" title={`Vu par ${readers.map((r) => r.username).join(', ')}`}>
            {conv.type === 'DIRECT' ? 'Vu' : readers.slice(0, 6).map((r) => <Avatar key={r.userId} user={r} size={14} />)}
            {conv.type !== 'DIRECT' && readers.length > 6 && <span className="muted"> +{readers.length - 6}</span>}
          </div>
        )}
      </div>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

export default memo(MessageItemBase);
