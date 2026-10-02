import { useEffect, useRef, useState } from 'react';
import { useMessenger } from '../../store/messenger';

/** Préférences du Messenger : son des nouveaux messages et notifications du navigateur. */
export default function MessengerSettings() {
  const settings = useMessenger((s) => s.settings);
  const setSettings = useMessenger((s) => s.setSettings);
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('Notification' in window ? Notification.permission : 'unsupported');
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!holder.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function toggleDesktop(on: boolean) {
    if (on && 'Notification' in window && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== 'granted') return;
    }
    setSettings({ desktop: on });
  }

  return (
    <div style={{ position: 'relative' }} ref={holder}>
      <button type="button" className="msgr-new-btn" title="Réglages des notifications" aria-label="Réglages des notifications" onClick={() => setOpen((v) => !v)}>🔔</button>
      {open && (
        <div className="msgr-menu msgr-settings-pop">
          <label className="msgr-check"><input type="checkbox" style={{ width: 'auto' }} checked={settings.sound} onChange={(e) => setSettings({ sound: e.target.checked })} /> Son à chaque nouveau message</label>
          <label className="msgr-check">
            <input type="checkbox" style={{ width: 'auto' }} checked={settings.desktop && perm === 'granted'} disabled={perm === 'unsupported' || perm === 'denied'} onChange={(e) => toggleDesktop(e.target.checked)} />
            Notifications du navigateur
          </label>
          {perm === 'denied' && <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>Bloquées dans ton navigateur : autorise-les dans les réglages du site (icône 🔒 à côté de l'adresse).</p>}
          {perm === 'unsupported' && <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>Ton navigateur ne gère pas les notifications.</p>}
          <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>Les conversations en sourdine ne font ni son ni notification.</p>
        </div>
      )}
    </div>
  );
}
