import { useEffect, useRef } from 'react';
import { totalUnreadOf, useMessenger } from '../../store/messenger';

function beep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    window.setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch { /* son indisponible : sans conséquence */ }
}

/** Ne rend rien : pastille « (3) » dans le titre de l'onglet, son à chaque nouveau message, notification du navigateur quand l'onglet est caché. */
export default function MessengerAlerts() {
  const total = useMessenger((s) => totalUnreadOf(s.conversations));
  const incoming = useMessenger((s) => s.incoming);
  const baseTitle = useRef<string | null>(null);

  useEffect(() => {
    if (baseTitle.current === null) baseTitle.current = document.title.replace(/^\(\d+\+?\)\s/, '');
    const current = document.title.replace(/^\(\d+\+?\)\s/, '');
    if (!total) { document.title = current; return; }
    document.title = `(${total > 99 ? '99+' : total}) ${current}`;
  }, [total]);

  useEffect(() => {
    if (!incoming) return;
    const { settings, conversations } = useMessenger.getState();
    if (settings.sound) beep();
    if (settings.desktop && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      const conv = conversations.find((c) => c.id === incoming.conversationId);
      if (!conv?.last) return;
      const title = conv.type === 'DIRECT' ? conv.last.senderUsername : `${conv.last.senderUsername} · ${conv.type === 'CHANNEL' ? '#' : ''}${conv.name}`;
      try {
        const n = new Notification(title, { body: conv.last.preview, tag: `msgr-${conv.id}`, icon: '/favicon.ico' });
        n.onclick = () => { window.focus(); window.location.assign(`/chat?c=${conv.id}`); n.close(); };
      } catch { /* notification refusée par le navigateur */ }
    }
  }, [incoming]);

  return null;
}
