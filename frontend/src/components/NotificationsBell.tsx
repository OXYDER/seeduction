import { useEffect, useRef, useState } from 'react';
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

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  function refreshCount() {
    api.get('/notifications/unread-count').then((r) => setUnread(r.data)).catch(() => {});
  }

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

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
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="secondary" onClick={toggle} style={{ position: 'relative' }}>
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
      {open && (
        <div className="panel ornate" style={{
          position: 'absolute', right: 0, top: '110%', width: 320, maxHeight: 420, overflowY: 'auto',
          zIndex: 50, padding: 12,
        }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <strong>Notifications</strong>
            {unread > 0 && <button className="secondary" onClick={markAllRead} style={{ fontSize: 11, padding: '4px 8px' }}>Tout marquer lu</button>}
          </div>
          {items.length === 0 && <p className="muted">Aucune notification.</p>}
          {items.map((n) => (
            <div
              key={n.id}
              onClick={() => openNotification(n)}
              className="row"
              style={{
                cursor: 'pointer', padding: '8px 6px', borderRadius: 6, gap: 8, alignItems: 'flex-start',
                background: n.read ? 'transparent' : 'var(--bg-panel-raised)',
              }}
            >
              {!n.read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', marginTop: 6, flexShrink: 0 }} />}
              <div>
                <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 700 }}>{n.title}</div>
                {n.body && <div className="muted" style={{ fontSize: 12 }}>{n.body}</div>}
                <div className="muted" style={{ fontSize: 10 }}>{timeAgo(n.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
