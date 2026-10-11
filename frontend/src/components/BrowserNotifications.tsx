import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useMessenger } from '../store/messenger';
import { SITE_NOTIFY_KEY, notifyPermission, siteNotifyOn } from '../lib/browserNotify';

const PROMPT_KEY = 'seeduction:notify-prompt';
const LATER_MS = 7 * 24 * 3600 * 1000;
const POLL_MS = 30_000;

/** « plus tard » = on redemande dans 7 jours ; « non merci » = on ne redemande plus. */
function promptSnoozed(): boolean {
  try {
    const v = localStorage.getItem(PROMPT_KEY);
    if (!v) return false;
    if (v === 'never') return true;
    return Date.now() < Number(v);
  } catch { return false; }
}

/**
 * Notifications du navigateur : propose de les activer (une fois connecté, sans jamais insister), puis affiche les nouvelles notifications du site
 * (cloche) quand l'onglet est caché. Activer les notifications active aussi celles du chat. Ne rend rien une fois la permission accordée ou refusée.
 */
export default function BrowserNotifications() {
  const [perm, setPerm] = useState(notifyPermission());
  const [snoozed, setSnoozed] = useState(promptSnoozed);
  const [show, setShow] = useState(false);
  const baseline = useRef<string | null>(null);

  // La demande n'apparaît qu'après quelques secondes de navigation, pas dès l'arrivée sur la page.
  useEffect(() => {
    if (perm !== 'default' || snoozed) return;
    const t = window.setTimeout(() => setShow(true), 6000);
    return () => window.clearTimeout(t);
  }, [perm, snoozed]);

  // Notifications du site : on mémorise la plus récente au démarrage, puis on notifie celles qui arrivent ensuite.
  useEffect(() => {
    if (perm !== 'granted') return;
    let stopped = false;
    async function tick() {
      if (stopped || !siteNotifyOn()) return;
      try {
        const list: { id: string; type: string; title: string; body: string | null; link: string | null; read: boolean; createdAt: string }[] = (await api.get('/notifications')).data;
        const newest = list.reduce((m, n) => (n.createdAt > m ? n.createdAt : m), '');
        if (baseline.current === null) { baseline.current = newest; return; }
        const since = baseline.current;
        if (newest > since) baseline.current = newest;
        if (!document.hidden) return;
        const chatOn = useMessenger.getState().settings.desktop;
        const fresh = list.filter((n) => !n.read && n.createdAt > since && !(chatOn && n.type === 'MESSAGE' && n.link?.startsWith('/chat'))).reverse();
        for (const n of fresh.slice(-3)) {
          try {
            const note = new Notification(n.title, { body: n.body ?? undefined, tag: `site-${n.id}`, icon: '/favicon.ico' });
            note.onclick = () => { window.focus(); if (n.link) window.location.assign(n.link); note.close(); };
          } catch { /* notification refusée par le navigateur */ }
        }
        if (fresh.length > 3) {
          try { new Notification('Seeduction', { body: `+ ${fresh.length - 3} autres notifications`, tag: 'site-more', icon: '/favicon.ico' }); } catch { /* idem */ }
        }
      } catch { /* réseau indisponible : on réessaie au prochain passage */ }
    }
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => { stopped = true; window.clearInterval(id); };
  }, [perm]);

  async function enable() {
    setShow(false);
    let p: NotificationPermission = 'denied';
    try { p = await Notification.requestPermission(); } catch { /* navigateur ancien */ }
    setPerm(p);
    if (p === 'granted') {
      try { localStorage.removeItem(SITE_NOTIFY_KEY); } catch { /* préférence facultative */ }
      useMessenger.getState().setSettings({ desktop: true });
      try { new Notification('Seeduction', { body: 'Notifications activées : tu seras prévenu des nouveaux messages et notifications.', icon: '/favicon.ico' }); } catch { /* idem */ }
    }
  }
  function later() { setShow(false); setSnoozed(true); try { localStorage.setItem(PROMPT_KEY, String(Date.now() + LATER_MS)); } catch { /* idem */ } }
  function never() { setShow(false); setSnoozed(true); try { localStorage.setItem(PROMPT_KEY, 'never'); } catch { /* idem */ } }

  if (perm !== 'default' || snoozed || !show) return null;
  return (
    <div className="panel ornate notify-prompt" role="dialog" aria-label="Activer les notifications">
      <strong>🔔 Activer les notifications ?</strong>
      <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 10px' }}>
        Seeduction peut t'avertir dans ton navigateur des nouveaux messages du chat et de tes notifications, même quand l'onglet est en arrière-plan. Tu pourras les couper à tout moment dans Profil &gt; Compte.
      </p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={enable}>Activer</button>
        <button type="button" className="secondary" onClick={later}>Plus tard</button>
        <button type="button" className="secondary" onClick={never}>Non merci</button>
      </div>
    </div>
  );
}
