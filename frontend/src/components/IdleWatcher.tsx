import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useMessenger } from '../store/messenger';

/** Sans aucune action pendant ce délai, le membre « En ligne » apparaît « Absent » aux autres. */
export const IDLE_AFTER_MS = 5 * 60 * 1000;
const RESEND_MS = 30_000;
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll', 'pointerdown'] as const;

/**
 * Ne rend rien : détecte l'inactivité de l'onglet (souris, clavier, défilement, toucher, navigation) et la signale au serveur, qui fait passer le membre
 * « En ligne » en « Absent » après 5 minutes, puis le remet « En ligne » dès qu'il navigue ou interagit de nouveau. « Occupé » et « Apparaître hors
 * ligne » ne changent jamais. L'état est renvoyé toutes les 30 secondes (idempotent), ce qui couvre aussi les reconnexions du Messenger.
 */
export default function IdleWatcher() {
  const location = useLocation();

  useEffect(() => {
    let idle = false;
    let last = Date.now();
    const send = () => useMessenger.getState().socket?.emit('presence:idle', { idle });
    const set = (next: boolean) => { if (idle !== next) { idle = next; send(); } };

    const onActivity = () => {
      last = Date.now();
      if (idle) set(false);
    };
    const onVisible = () => { if (!document.hidden) onActivity(); };
    const tick = window.setInterval(() => {
      if (!idle && Date.now() - last >= IDLE_AFTER_MS) set(true);
      else if (idle) send();
    }, RESEND_MS);
    // Un premier contrôle plus fin pour que le passage « Absent » ne traîne pas jusqu'à 30 secondes de plus.
    const fine = window.setInterval(() => { if (!idle && Date.now() - last >= IDLE_AFTER_MS) set(true); }, 5000);

    for (const e of EVENTS) window.addEventListener(e, onActivity, { passive: true, capture: true });
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(tick); window.clearInterval(fine);
      for (const e of EVENTS) window.removeEventListener(e, onActivity, true);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Changer de page compte comme une interaction.
  useEffect(() => { window.dispatchEvent(new Event('pointerdown')); }, [location.pathname]);

  return null;
}
