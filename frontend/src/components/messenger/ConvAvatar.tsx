import Avatar from '../Avatar';
import { STATUS_COLOR } from '../../lib/presence';
import { statusOf, useMessenger, type ConvSummary } from '../../store/messenger';

/** Avatar d'une conversation : le membre (1 à 1, avec sa pastille de présence), un collage ou l'image du groupe, ou « # » pour un canal. */
export default function ConvAvatar({ conv, size = 44, showStatus = true }: { conv: ConvSummary; size?: number; showStatus?: boolean }) {
  const online = useMessenger((s) => s.online);

  if (conv.type === 'DIRECT') {
    const status = statusOf(online, conv.other?.id);
    return (
      <span className="msgr-conv-avatar" style={{ width: size, height: size }}>
        <Avatar user={conv.other} size={size} />
        {showStatus && <span className="msgr-status-dot" style={{ background: STATUS_COLOR[status], width: Math.max(9, size * 0.26), height: Math.max(9, size * 0.26) }} />}
      </span>
    );
  }
  if (conv.type === 'CHANNEL') {
    return <span className="msgr-conv-avatar channel" style={{ width: size, height: size, fontSize: size * 0.5 }}>#</span>;
  }
  if (conv.iconUrl) return <span className="msgr-conv-avatar"><img src={conv.iconUrl} alt="" className="forum-avatar" style={{ width: size, height: size, objectFit: 'cover' }} /></span>;
  const members = (conv.members ?? []).slice(0, 3);
  const small = Math.round(size * 0.62);
  return (
    <span className="msgr-conv-avatar group" style={{ width: size, height: size }}>
      {members.map((m, i) => (
        <span key={m.id} className="msgr-group-bit" style={{ top: i === 0 ? 0 : i === 1 ? size - small : size * 0.2, left: i === 0 ? 0 : i === 1 ? size - small : size * 0.25 }}>
          <Avatar user={m} size={small} />
        </span>
      ))}
    </span>
  );
}
