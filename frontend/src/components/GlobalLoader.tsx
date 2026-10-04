import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { sweepLoading, useLoading } from '../store/loading';

const MIN_VISIBLE_MS = 450; // une fois affiché, l'écran reste assez longtemps pour ne pas clignoter

/** Écran de chargement : logo Seeduction animé sur le fond du site. Même rendu que le splash de index.html, pour un démarrage sans saut. */
export function LoadingScreen({ on, label = 'Chargement…' }: { on: boolean; label?: string }) {
  return (
    <div className={`sd-loader${on ? ' on' : ''}`} role="status" aria-live="polite" aria-hidden={!on}>
      <div className="sd-loader-box">
        <img src="/logo-full.png" alt="Seeduction" className="sd-loader-logo" draggable={false} />
        <div className="sd-loader-bar"><span /></div>
        <div className="sd-loader-label">{label}</div>
      </div>
    </div>
  );
}

/**
 * Affiche l'écran de chargement tant que ça charge, partout :
 *  - au démarrage du site ;
 *  - à chaque changement de page, jusqu'à ce que toutes ses données soient arrivées ;
 *  - pendant les actions qui prennent du temps, et tout de suite pour la connexion / l'inscription.
 * Les rafraîchissements automatiques en arrière-plan (notifications, compteurs...) ne le déclenchent jamais.
 */
export default function GlobalLoader() {
  const { pathname } = useLocation();
  const page = useLoading((s) => s.page);
  const mutation = useLoading((s) => s.mutation);
  const immediate = useLoading((s) => s.immediate);

  const [pageWindow, setPageWindow] = useState(true); // fenêtre de chargement d'une page, ouverte à chaque changement de page
  const [booting, setBooting] = useState(true);
  const [visible, setVisible] = useState(true); // visible dès le premier rendu (le splash de index.html prend le relais)
  const shownAt = useRef(Date.now());

  // Nouvelle page : on ouvre la fenêtre ; sans aucune requête au bout de 300 ms, il n'y a rien à attendre.
  useEffect(() => {
    setPageWindow(true);
    const t = setTimeout(() => { if (useLoading.getState().page === 0) setPageWindow(false); }, 300);
    return () => clearTimeout(t);
  }, [pathname]);

  // Toutes les requêtes de la page sont terminées (avec un court délai pour celles qui s'enchaînent) : la fenêtre se ferme.
  useEffect(() => {
    if (!pageWindow || page > 0) return;
    const t = setTimeout(() => { if (useLoading.getState().page === 0) setPageWindow(false); }, 250);
    return () => clearTimeout(t);
  }, [pageWindow, page]);

  useEffect(() => { if (!pageWindow) setBooting(false); }, [pageWindow]);
  useEffect(() => { const t = setInterval(sweepLoading, 5000); return () => clearInterval(t); }, []);

  const waitingPage = pageWindow && page > 0;
  const want = booting || waitingPage || mutation > 0 || immediate > 0;
  // Délai avant d'afficher : aucun pour le démarrage et la connexion ; court pour une page ; plus long pour une simple action.
  const delay = booting || immediate > 0 ? 0 : waitingPage ? 150 : 500;

  useEffect(() => {
    if (want && !visible) {
      const t = setTimeout(() => { shownAt.current = Date.now(); setVisible(true); }, delay);
      return () => clearTimeout(t);
    }
    if (!want && visible) {
      const t = setTimeout(() => setVisible(false), Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current)));
      return () => clearTimeout(t);
    }
  }, [want, visible, delay]);

  return <LoadingScreen on={visible} />;
}
