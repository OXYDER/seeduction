import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';
import { CATEGORY_ICON, notifyChanged, onNotificationsChanged } from '../lib/notifications';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
  category?: string;
  count?: number;
}

/**
 * Cloche des notifications. Le cadre est affiché dans <body> en position fixe, à partir de la position réelle de la cloche : il reste toujours dans la
 * partie visible de l'écran (sur téléphone, il occupe la largeur de l'écran avec une petite marge) et son fond est opaque, donc lisible même sur une image de fond claire.
 */
export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
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
    // Une notification lue / supprimée ailleurs (page Notifications, ouverture de la page concernée) met la pastille à jour tout de suite.
    const off = onNotificationsChanged(() => { refreshCount(); if (openRef.current) loadItems(); });
    return () => { clearInterval(interval); off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const openRef = useRef(false);
  openRef.current = open;
  function loadItems() { api.get('/notifications', { params: { limit: 40 } }).then((r) => setItems(r.data)).catch(() => {}); }

  function toggle() {
    if (!open) loadItems();
    setOpen((v) => !v);
  }

  async function toggleRead(n: Notification) {
    await api.post(`/notifications/${n.id}/${n.read ? 'unread' : 'read'}`);
    setItems((l) => l.map((x) => (x.id === n.id ? { ...x, read: !n.read } : x)));
    refreshCount(); notifyChanged();
  }
  async function remove(n: Notification) {
    await api.delete(`/notifications/${n.id}`);
    setItems((l) => l.filter((x) => x.id !== n.id));
    refreshCount(); notifyChanged();
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
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button type="button" className="secondary" onClick={() => setUnreadOnly((v) => !v)} style={{ fontSize: 11, padding: '4px 8px', opacity: unreadOnly ? 1 : 0.7 }} aria-pressed={unreadOnly}>Non lues</button>
              {unread > 0 && <button type="button" className="secondary" onClick={markAllRead} style={{ fontSize: 11, padding: '4px 8px' }}>Tout marquer lu</button>}
            </span>
          </div>
          <div className="notif-list">
            {items.filter((n) => !unreadOnly || !n.read).length === 0 && <p className="notif-empty">{unreadOnly ? 'Aucune notification non lue.' : 'Aucune notification.'}</p>}
            {items.filter((n) => !unreadOnly || !n.read).map((n) => (
              <div key={n.id} onClick={() => openNotification(n)} className={`notif-item${n.read ? '' : ' unread'}`}>
                {!n.read && <span className="notif-dot" />}
                <span className="notif-cat" aria-hidden>{CATEGORY_ICON[n.category ?? ''] ?? '🔔'}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="notif-title">{n.title}{(n.count ?? 1) > 1 && <span className="np-x">×{n.count}</span>}</div>
                  {n.body && <div className="notif-body">{n.body}</div>}
                  <div className="notif-time">{timeAgo(n.createdAt)}</div>
                </div>
                <span className="notif-actions" onClick={(e) => e.stopPropagation()}>
                  <button type="button" title={n.read ? 'Marquer comme non lue' : 'Marquer comme lue'} aria-label={n.read ? 'Marquer comme non lue' : 'Marquer comme lue'} onClick={() => toggleRead(n)}>{n.read ? '○' : '●'}</button>
                  <button type="button" title="Supprimer" aria-label="Supprimer cette notification" onClick={() => remove(n)}>✕</button>
                </span>
              </div>
            ))}
          </div>
          <Link to="/notifications" className="notif-all" onClick={() => setOpen(false)}>Voir toutes les notifications →</Link>
        </div>,
        document.body,
      )}
    </div>
  );
}
