import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

/**
 * Cloche des notifications. Le cadre est affiché dans <body> en position fixe, à partir de la position réelle de la cloche : il reste toujours dans la
 * partie visible de l'écran (sur téléphone, il occupe la largeur de l'écran avec une petite marge) et son fond est opaque, donc lisible même sur une image de fond claire.
 */
export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  function refreshCount() {
    api.get('/notifications/unread-count').then((r) => setUnread(r.data)).catch(() => {});
  }

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 30_000);
    return () => clearInterval(interval);
  }, []);

  /** Place le cadre sous la cloche, sans jamais dépasser de l'écran. */
  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const vw = window.innerWidth;
    const margin = 8;
    const width = vw <= 640 ? vw - margin * 2 : Math.min(380, vw - margin * 2);
    const left = vw <= 640 ? margin : Math.max(margin, Math.min(b.right - width, vw - width - margin));
    setPos({ top: Math.round(b.bottom + 8), left, width });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    const onDown = (e: Event) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, place]);

  function toggle() {
    if (!open) api.get('/notifications').then((r) => setItems(r.data));
    setOpen((v) => !v);
  }

  async function openNotification(n: Notification) {
    if (!n.read) await api.post(`/notifications/${n.id}/read`);
    setOpen(false);
    refreshCount();
    if (n.link) navigate(n.link);
  }

  async function markAllRead() {
    await api.post('/notifications/read-all');
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  }

  return (
    <div style={{ position: 'relative' }}>
      <button ref={btnRef} type="button" className="secondary" onClick={toggle} style={{ position: 'relative' }} aria-label="Notifications" aria-expanded={open}>
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -6, right: -6, background: 'var(--danger)', color: 'white',
            borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 5px', lineHeight: 1.4,
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && pos && createPortal(
        <div ref={panelRef} className="notif-panel" role="dialog" aria-label="Notifications" style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: `calc(100dvh - ${pos.top}px - 12px)` }}>
          <div className="notif-head">
            <strong>Notifications</strong>
            {unread > 0 && <button type="button" className="secondary" onClick={markAllRead} style={{ fontSize: 11, padding: '4px 8px' }}>Tout marquer lu</button>}
          </div>
          <div className="notif-list">
            {items.length === 0 && <p className="notif-empty">Aucune notification.</p>}
            {items.map((n) => (
              <div key={n.id} onClick={() => openNotification(n)} className={`notif-item${n.read ? '' : ' unread'}`}>
                {!n.read && <span className="notif-dot" />}
                <div style={{ minWidth: 0 }}>
                  <div className="notif-title">{n.title}</div>
                  {n.body && <div className="notif-body">{n.body}</div>}
                  <div className="notif-time">{timeAgo(n.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
