import { useState } from 'react';
import { useMessenger } from '../store/messenger';
import { notifyPermission, setSiteNotify, siteNotifyOn, type NotifyPermission } from '../lib/browserNotify';

/** Compte : notifications du navigateur (nouveaux messages du chat et notifications du site), propres à cet appareil. */
export default function BrowserNotifyPanel() {
  const [perm, setPerm] = useState<NotifyPermission>(notifyPermission());
  const [site, setSite] = useState(siteNotifyOn);
  const chat = useMessenger((s) => s.settings.desktop);
  const setSettings = useMessenger((s) => s.setSettings);

  async function enable() {
    let p: NotificationPermission = 'denied';
    try { p = await Notification.requestPermission(); } catch { /* navigateur ancien */ }
    setPerm(p);
    if (p === 'granted') { setSettings({ desktop: true }); setSiteNotify(true); setSite(true); }
  }

  return (
    <div className="panel">
      <h3>🔔 Notifications du navigateur</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Reçois une notification de ton navigateur quand un message du chat ou une notification du site arrive pendant que l'onglet est en arrière-plan. Ces réglages sont propres à cet appareil.
      </p>
      {perm === 'unsupported' && <p className="muted">Ton navigateur ne gère pas les notifications.</p>}
      {perm === 'denied' && <p style={{ color: 'var(--danger)' }}>Bloquées dans ton navigateur : autorise-les dans les réglages du site (icône 🔒 à côté de l'adresse), puis recharge la page.</p>}
      {perm === 'default' && <button type="button" onClick={enable}>Activer les notifications</button>}
      {perm === 'granted' && (
        <div className="col" style={{ gap: 8 }}>
          <label className="row" style={{ gap: 8, alignItems: 'center' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={chat} onChange={(e) => setSettings({ desktop: e.target.checked })} /> Messages du chat
          </label>
          <label className="row" style={{ gap: 8, alignItems: 'center' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={site} onChange={(e) => { setSite(e.target.checked); setSiteNotify(e.target.checked); }} /> Notifications du site (cloche)
          </label>
        </div>
      )}
    </div>
  );
}
