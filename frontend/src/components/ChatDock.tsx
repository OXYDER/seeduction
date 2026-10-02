import { Link, useLocation } from 'react-router-dom';
import { totalUnreadOf, useMessenger } from '../store/messenger';
import ConversationView from './messenger/ConversationView';
import ConvAvatar from './messenger/ConvAvatar';
import MessengerAlerts from './messenger/MessengerAlerts';
import CallManager from './messenger/CallManager';

/**
 * Bulles de discussion façon Messenger, ancrées en bas à droite et présentes sur tout le site (montées dans Layout) :
 * une fenêtre par conversation privée ou de groupe ouverte (3 au plus), réductible en bulle ; la bulle 💬 ouvre le
 * Messenger complet (canaux publics, toutes les conversations).
 */
export default function ChatDock() {
  const windows = useMessenger((s) => s.windows);
  const conversations = useMessenger((s) => s.conversations);
  const connected = useMessenger((s) => s.connected);
  const total = useMessenger((s) => totalUnreadOf(s.conversations));
  const closeWindow = useMessenger((s) => s.closeWindow);
  const toggleMinimize = useMessenger((s) => s.toggleMinimize);
  const location = useLocation();
  const onChatPage = location.pathname.startsWith('/chat');
  // Sur la page Messenger, la conversation affichée en grand n'a pas besoin de sa fenêtre flottante en plus.
  const shownOnPage = onChatPage ? new URLSearchParams(location.search).get('c') : null;

  return (
    <>
      <MessengerAlerts />
      <CallManager />
      <div className="dm-dock">
        {connected && !onChatPage && (
          <Link to="/chat" className="dm-bubble-avatar public-bubble" title="Ouvrir le Messenger" aria-label="Ouvrir le Messenger">
            <span style={{ fontSize: 24 }}>💬</span>
            {total > 0 && <span className="dot-badge" style={{ top: -4, right: -4 }}>{total > 99 ? '99+' : total}</span>}
          </Link>
        )}
        {windows.filter((w) => w.conversationId !== shownOnPage).map((w) => {
          const conv = conversations.find((c) => c.id === w.conversationId);
          if (w.minimized) {
            if (!conv) return null;
            return (
              <button key={w.conversationId} type="button" className="dm-bubble-avatar" title={conv.name ?? ''} onClick={() => toggleMinimize(w.conversationId)}>
                <ConvAvatar conv={conv} size={48} />
                {conv.unread > 0 && <span className="dot-badge" style={{ top: -4, right: -4 }}>{conv.unread > 99 ? '99+' : conv.unread}</span>}
              </button>
            );
          }
          return (
            <div key={w.conversationId} className="dm-window msgr-dock-window">
              <ConversationView conversationId={w.conversationId} variant="dock" onClose={() => closeWindow(w.conversationId)} onMinimize={() => toggleMinimize(w.conversationId)} />
            </div>
          );
        })}
      </div>
    </>
  );
}
