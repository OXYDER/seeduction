import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMessenger, type ConvSummary } from '../store/messenger';
import { useAuthStore } from '../store/auth';
import ConvAvatar from './messenger/ConvAvatar';

const isMuted = (c: ConvSummary) => !!c.mutedUntil && new Date(c.mutedUntil).getTime() > Date.now();
const PRIVATE_MAX = 12;

/**
 * Bulles de discussion sur le côté gauche du site, juste à droite du menu et sous l'en-tête : les canaux publics d'abord, puis les conversations privées et
 * de groupe, avec leurs messages non lus. Un clic ouvre la conversation (fenêtre en bas, ou page Chat si on y est déjà). Désactivables dans le compte
 * (Profil > Compte) ; sur petit écran (menu replié), les anciennes bulles flottantes de ChatDock restent en place.
 */
export default function ChatRail() {
  const token = useAuthStore((s) => s.accessToken);
  const enabled = useMessenger((s) => s.bubbles);
  const loaded = useMessenger((s) => s.convLoaded);
  const conversations = useMessenger((s) => s.conversations);
  const windows = useMessenger((s) => s.windows);
  const openWindow = useMessenger((s) => s.openWindow);
  const closeWindow = useMessenger((s) => s.closeWindow);
  const location = useLocation();
  const navigate = useNavigate();
  const [wide, setWide] = useState(() => window.innerWidth >= 981);
  const [top, setTop] = useState(72);
  const onChatPage = location.pathname.startsWith('/chat');
  const viewing = onChatPage ? new URLSearchParams(location.search).get('c') : null;

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 981);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Le haut des bulles suit le bas de l'en-tête (qui peut défiler hors de l'écran selon le thème).
  useEffect(() => {
    if (!wide) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = document.querySelector('.side-topbar')?.getBoundingClientRect();
        setTop(Math.max(0, Math.round(h ? h.bottom : 0)));
      });
    };
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    const bar = document.querySelector('.side-topbar');
    if (bar && ro) ro.observe(bar);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); ro?.disconnect(); };
  }, [wide, location.pathname]);

  const { publics, privates } = useMemo(() => {
    const live = conversations.filter((c) => !c.archived);
    const byActivity = (a: ConvSummary, b: ConvSummary) => Number(b.pinned) - Number(a.pinned) || new Date(b.last?.createdAt ?? 0).getTime() - new Date(a.last?.createdAt ?? 0).getTime();
    const pub = live.filter((c) => c.type === 'CHANNEL').sort(byActivity);
    const priv = live.filter((c) => c.type !== 'CHANNEL').sort(byActivity);
    // Les conversations privées récentes, plus toutes celles qui ont des messages non lus.
    const shown = priv.filter((c, i) => i < PRIVATE_MAX || (c.unread > 0 && !isMuted(c)));
    return { publics: pub, privates: shown };
  }, [conversations]);

  const active = !!token && enabled && wide && loaded && (publics.length > 0 || privates.length > 0);
  useEffect(() => {
    document.body.classList.toggle('has-chat-rail', active);
    return () => document.body.classList.remove('has-chat-rail');
  }, [active]);
  if (!active) return null;

  function click(c: ConvSummary) {
    if (onChatPage) { navigate(`/chat?c=${c.id}`); return; }
    const w = windows.find((x) => x.conversationId === c.id);
    if (w && !w.minimized) closeWindow(c.id); else openWindow(c.id);
  }

  const bubble = (c: ConvSummary) => {
    const muted = isMuted(c);
    const open = windows.some((w) => w.conversationId === c.id && !w.minimized) || viewing === c.id;
    const unread = c.unread > 0 && !muted;
    const label = c.name ?? (c.type === 'DIRECT' ? c.other?.username : 'Conversation') ?? '';
    return (
      <button key={c.id} type="button" className={`cr-bubble${open ? ' open' : ''}${unread ? ' unread' : ''}${muted ? ' muted' : ''}`} onClick={() => click(c)}
        title={`${c.type === 'CHANNEL' ? 'Canal public' : c.type === 'GROUP' ? 'Groupe' : 'Conversation privée'} : ${label}${unread ? ` — ${c.unread} non lu${c.unread > 1 ? 's' : ''}` : ''}`}>
        <span className={`cr-av${c.type === 'CHANNEL' ? ' channel' : ''}`}>
          {c.type === 'CHANNEL' ? <span className="cr-hash">#</span> : <ConvAvatar conv={c} size={44} />}
          {unread && <span className="dot-badge" style={{ top: -3, right: -3 }}>{c.mentions > 0 ? '@' : c.unread > 99 ? '99+' : c.unread}</span>}
        </span>
        <span className="cr-name">{label}</span>
      </button>
    );
  };

  return (
    <nav className="chat-rail" style={{ top }} aria-label="Conversations">
      {publics.length > 0 && <div className="cr-group-title" title="Canaux publics">Publics</div>}
      {publics.map(bubble)}
      {privates.length > 0 && <div className="cr-group-title cr-sep" title="Conversations privées et groupes">Privés</div>}
      {privates.map(bubble)}
      <Link to="/chat" className="cr-all" title="Ouvrir le Messenger complet">💬</Link>
    </nav>
  );
}
