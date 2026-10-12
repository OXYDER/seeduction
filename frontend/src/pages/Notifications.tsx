import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';
import { CATEGORY_ICON, notifyChanged, onNotificationsChanged, type AppNotification } from '../lib/notifications';

interface Category { key: string; label: string; icon: string; hint: string; locked: boolean }
interface Summary { categories: Category[]; unread: number; total: number; byCategory: Record<string, { unread: number; total: number }> }

/** Page Notifications : toutes les notifications, par onglets de catégories, avec tri, filtre « non lues », actions groupées et préférences. */
export default function Notifications() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tab, setTab] = useState<string>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [sort, setSort] = useState<'recent' | 'oldest' | 'unread'>('recent');
  const [items, setItems] = useState<AppNotification[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [notice, setNotice] = useState('');

  const loadSummary = useCallback(() => { api.get('/notifications/summary').then((r) => setSummary(r.data)).catch(() => {}); }, []);
  const params = useCallback((offset = 0) => ({ page: 1, limit: 30, offset, sort, category: tab === 'all' ? undefined : tab, unread: unreadOnly ? 1 : undefined }), [sort, tab, unreadOnly]);
  const load = useCallback(() => {
    setLoading(true);
    api.get('/notifications', { params: params() }).then((r) => { setItems(r.data.items); setNext(r.data.next); }).catch(() => {}).finally(() => setLoading(false));
  }, [params]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => onNotificationsChanged(() => { loadSummary(); load(); }), [loadSummary, load]);

  async function more() {
    if (next === null) return;
    const r = await api.get('/notifications', { params: params(next) });
    setItems((l) => [...l, ...r.data.items]);
    setNext(r.data.next);
  }

  const changed = () => { loadSummary(); notifyChanged(); };
  async function open(n: AppNotification) {
    if (!n.read) { await api.post(`/notifications/${n.id}/read`).catch(() => {}); setItems((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x))); changed(); }
    if (n.link) navigate(n.link);
  }
  async function toggleRead(n: AppNotification) {
    await api.post(`/notifications/${n.id}/${n.read ? 'unread' : 'read'}`);
    setItems((l) => l.map((x) => (x.id === n.id ? { ...x, read: !n.read } : x)));
    changed();
  }
  async function remove(n: AppNotification) {
    await api.delete(`/notifications/${n.id}`);
    setItems((l) => l.filter((x) => x.id !== n.id));
    changed();
  }
  async function readAll() {
    await api.post('/notifications/read-all', { category: tab === 'all' ? undefined : tab });
    setNotice(tab === 'all' ? '✓ Tout est marqué comme lu.' : '✓ Cet onglet est marqué comme lu.');
    load(); changed();
  }
  async function deleteRead() {
    if (!window.confirm(tab === 'all' ? 'Supprimer toutes les notifications déjà lues ?' : 'Supprimer les notifications déjà lues de cet onglet ?')) return;
    await api.delete('/notifications/read', { params: { category: tab === 'all' ? undefined : tab } });
    setNotice('✓ Notifications lues supprimées.');
    load(); changed();
  }
  async function openPrefs() {
    setShowPrefs((v) => !v);
    if (!prefs) api.get('/notifications/preferences').then((r) => setPrefs(r.data.prefs)).catch(() => {});
  }
  async function setPref(key: string, on: boolean) {
    const next = { ...(prefs ?? {}), [key]: on };
    setPrefs(next);
    await api.put('/notifications/preferences', { prefs: next }).catch(() => {});
  }

  const cats = summary?.categories ?? [];
  const tabBtn = (key: string, label: string, icon: string, unread: number) => (
    <button key={key} type="button" role="tab" aria-selected={tab === key} className={`np-tab${tab === key ? ' on' : ''}`} onClick={() => setTab(key)}>
      <span aria-hidden>{icon}</span> {label}{unread > 0 && <span className="np-count">{unread > 99 ? '99+' : unread}</span>}
    </button>
  );

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>🔔 Notifications</h1>
        <button type="button" className="secondary" onClick={openPrefs}>⚙️ Préférences</button>
      </div>

      {showPrefs && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Quelles notifications veux-tu recevoir ?</h3>
          <p className="muted" style={{ marginTop: 0 }}>Une catégorie coupée n'envoie plus rien, ni dans la cloche ni ici. Les sanctions et la sécurité du compte ne se coupent pas.</p>
          {!prefs ? <p className="muted">Chargement…</p> : (
            <div className="grid" style={{ gap: 8 }}>
              {cats.map((c) => (
                <label key={c.key} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <input type="checkbox" style={{ width: 'auto', marginTop: 4 }} checked={c.locked || prefs[c.key] !== false} disabled={c.locked} onChange={(e) => setPref(c.key, e.target.checked)} />
                  <span><strong>{c.icon} {c.label}</strong><br /><span className="muted" style={{ fontSize: 12.5 }}>{c.hint}</span></span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="np-tabs" role="tablist">
        {tabBtn('all', 'Toutes', '🔔', summary?.unread ?? 0)}
        {cats.map((c) => tabBtn(c.key, c.label, c.icon, summary?.byCategory[c.key]?.unread ?? 0))}
      </div>

      <div className="panel">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <label className="row muted" style={{ gap: 6, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> Non lues seulement</label>
          <label className="row muted" style={{ gap: 6, alignItems: 'center' }}>Trier
            <select value={sort} onChange={(e) => setSort(e.target.value as any)}>
              <option value="recent">Plus récentes</option>
              <option value="oldest">Plus anciennes</option>
              <option value="unread">Non lues d'abord</option>
            </select>
          </label>
          <span style={{ flex: 1 }} />
          <button type="button" className="secondary" onClick={readAll}>✓ Tout marquer comme lu{tab === 'all' ? '' : ' (cet onglet)'}</button>
          <button type="button" className="secondary" onClick={deleteRead}>🗑 Supprimer les lues</button>
        </div>
        {notice && <div style={{ color: 'var(--success)', marginBottom: 8 }}>{notice}</div>}

        {loading && items.length === 0 && <p className="muted">Chargement…</p>}
        {!loading && items.length === 0 && <p className="muted">{unreadOnly ? 'Aucune notification non lue.' : 'Aucune notification ici.'}</p>}
        <div className="np-list">
          {items.map((n) => (
            <div key={n.id} className={`np-item${n.read ? '' : ' unread'}`} onClick={() => open(n)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') open(n); }}>
              <span className="np-icon" aria-hidden>{CATEGORY_ICON[n.category] ?? '🔔'}</span>
              <div className="np-main">
                <div className="np-title">{!n.read && <i className="np-dot" />}{n.title}{n.count > 1 && <span className="np-x">×{n.count}</span>}</div>
                {n.body && <div className="np-body">{n.body}</div>}
                <div className="np-time">{timeAgo(n.createdAt)}{n.link ? ' · ouvrir →' : ''}</div>
              </div>
              <div className="np-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" title={n.read ? 'Marquer comme non lue' : 'Marquer comme lue'} aria-label={n.read ? 'Marquer comme non lue' : 'Marquer comme lue'} onClick={() => toggleRead(n)}>{n.read ? '○' : '●'}</button>
                <button type="button" title="Supprimer" aria-label="Supprimer cette notification" onClick={() => remove(n)}>✕</button>
              </div>
            </div>
          ))}
        </div>
        {next !== null && <div style={{ textAlign: 'center', marginTop: 12 }}><button type="button" className="secondary" onClick={more}>Voir plus</button></div>}
      </div>
    </div>
  );
}
