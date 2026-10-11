import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMessenger } from '../store/messenger';
import ConversationView from './messenger/ConversationView';
import ConvAvatar from './messenger/ConvAvatar';
import MessengerAlerts from './messenger/MessengerAlerts';
import CallManager from './messenger/CallManager';

const STORE_KEY = 'msgr-window-layout';
interface Layout { left?: number; bottom?: number; big?: boolean }
const readLayouts = (): Record<string, Layout> => { try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') || {}; } catch { return {}; } };
const writeLayout = (id: string, l: Layout) => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...readLayouts(), [id]: l })); } catch { /* préférence facultative */ } };
let zTop = 120;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Taille d'une fenêtre : plus grande qu'avant (420 × 620), et « agrandie » (640 × 820) au besoin, sans jamais dépasser l'écran. */
function sizeOf(big: boolean, vw: number, vh: number) {
  const w = big ? 640 : 420;
  const h = big ? 820 : 620;
  return { width: Math.min(w, vw - 16), height: Math.min(h, vh - (big ? 24 : 90)) };
}

/** Une fenêtre de discussion : déplaçable par son en-tête (gauche, droite, haut, bas), agrandissable, avec un bouton pour l'ouvrir dans le grand chat. */
function DockWindow({ id, index, count, railActive, vw, vh }: { id: string; index: number; count: number; railActive: boolean; vw: number; vh: number }) {
  const closeWindow = useMessenger((s) => s.closeWindow);
  const toggleMinimize = useMessenger((s) => s.toggleMinimize);
  const navigate = useNavigate();
  const [layout, setLayout] = useState<Layout>(() => readLayouts()[id] ?? {});
  const [z, setZ] = useState(++zTop);
  const suppressClick = useRef(false);
  const big = !!layout.big;
  const { width, height } = sizeOf(big, vw, vh);

  // Position par défaut : à droite des bulles (ou en bas à droite sans bulles), les fenêtres suivantes à côté.
  const gap = 10;
  const defaultLeft = railActive ? 252 + 88 + index * (width + gap) : vw - 16 - width - (count - 1 - index) * (width + gap);
  const left = clamp(layout.left ?? defaultLeft, 0, Math.max(0, vw - width));
  const bottom = clamp(layout.bottom ?? 0, 0, Math.max(0, vh - height));

  const bringToFront = useCallback(() => setZ(++zTop), []);

  function onHeaderDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('button, a, input, textarea')) return;
    bringToFront();
    const sx = e.clientX, sy = e.clientY, startLeft = left, startBottom = bottom;
    let moved = false;
    let last: Layout = layout;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true;
      last = { ...layout, left: clamp(startLeft + dx, 0, Math.max(0, vw - width)), bottom: clamp(startBottom - dy, 0, Math.max(0, vh - height)) };
      setLayout(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      if (moved) { suppressClick.current = true; setTimeout(() => { suppressClick.current = false; }, 0); writeLayout(id, last); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  }

  function toggleBig() {
    const next = { ...layout, big: !big };
    setLayout(next);
    writeLayout(id, next);
    bringToFront();
  }

  return (
    <div className="dm-window msgr-dock-window floating" style={{ position: 'fixed', left, bottom, width, height, zIndex: z }} onPointerDownCapture={bringToFront}>
      <ConversationView
        conversationId={id} variant="dock"
        onClose={() => closeWindow(id)}
        onMinimize={() => { if (!suppressClick.current) toggleMinimize(id); }}
        onHeaderPointerDown={onHeaderDown}
        onExpandToPage={() => { closeWindow(id); navigate(`/chat?c=${id}`); }}
        onToggleSize={toggleBig} sizeBig={big}
      />
    </div>
  );
}

/**
 * Fenêtres de discussion façon Messenger, présentes sur tout le site (montées dans Layout) : une fenêtre par conversation ouverte (3 au plus), que le membre
 * déplace par son en-tête, agrandit, réduit ou ouvre dans le grand chat. Sur petit écran, les fenêtres restent ancrées en bas, pleine largeur.
 */
export default function ChatDock() {
  const windows = useMessenger((s) => s.windows);
  const conversations = useMessenger((s) => s.conversations);
  const closeWindow = useMessenger((s) => s.closeWindow);
  const toggleMinimize = useMessenger((s) => s.toggleMinimize);
  const location = useLocation();
  const onChatPage = location.pathname.startsWith('/chat');
  // Sur la page Messenger, la conversation affichée en grand n'a pas besoin de sa fenêtre flottante en plus.
  const shownOnPage = onChatPage ? new URLSearchParams(location.search).get('c') : null;
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [railActive, setRailActive] = useState(() => document.body.classList.contains('has-chat-rail'));

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    const obs = new MutationObserver(() => setRailActive(document.body.classList.contains('has-chat-rail')));
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => { window.removeEventListener('resize', onResize); obs.disconnect(); };
  }, []);

  const narrow = vp.w <= 700;
  const shown = windows.filter((w) => w.conversationId !== shownOnPage);
  const open = shown.filter((w) => !w.minimized);

  return (
    <>
      <MessengerAlerts />
      <CallManager />
      <div className="dm-dock">
        {shown.map((w) => {
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
          if (narrow) {
            return (
              <div key={w.conversationId} className="dm-window msgr-dock-window">
                <ConversationView conversationId={w.conversationId} variant="dock" onClose={() => closeWindow(w.conversationId)} onMinimize={() => toggleMinimize(w.conversationId)} />
              </div>
            );
          }
          return <DockWindow key={w.conversationId} id={w.conversationId} index={open.findIndex((x) => x.conversationId === w.conversationId)} count={open.length} railActive={railActive} vw={vp.w} vh={vp.h} />;
        })}
      </div>
    </>
  );
}
