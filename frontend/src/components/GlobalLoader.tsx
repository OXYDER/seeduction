import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { sweepLoading, useLoading } from '../store/loading';

const MIN_VISIBLE_MS = 450; // une fois affiché, l'écran reste assez longtemps pour ne pas clignoter

type Mode = 'full' | 'soft' | 'subtle' | null;

/**
 * Chargement en trois niveaux, du plus au moins intrusif :
 *  - full   : plein écran avec le logo, seulement à l'ouverture du site ;
 *  - soft   : voile léger et petit logo, pour la connexion / l'inscription (évite un double envoi) ;
 *  - subtle : fine barre en haut + petite pastille en bas, qui ne bloquent rien — changements de page et actions un peu longues.
 */
export function LoadingScreen({ mode, label = 'Chargement…' }: { mode: Mode; label?: string }) {
  const overlay = mode === 'full' || mode === 'soft';
  return (
    <>
      <div className={`sd-loader${overlay ? ' on' : ''}${mode === 'soft' ? ' soft' : ''}`} role="status" aria-live="polite" aria-hidden={!overlay}>
        <div className="sd-loader-box">
          <img src="/logo-full.png" alt="Seeduction" className="sd-loader-logo" draggable={false} />
          <div className="sd-loader-bar"><span /></div>
          <div className="sd-loader-label">{label}</div>
        </div>
      </div>
      <div className={`sd-top${mode === 'subtle' ? ' on' : ''}`} aria-hidden="true"><span /></div>
      <div className={`sd-chip${mode === 'subtle' ? ' on' : ''}`} role="status" aria-hidden={mode !== 'subtle'}>
        <img src="/logo-icon.png" alt="" draggable={false} />
        <span>{label}</span>
      </div>
    </>
  );
}

/**
 * Indique que ça charge, partout, sans gêner :
 *  - au démarrage du site : plein écran, le temps du premier chargement ;
 *  - à la connexion / inscription : voile léger tout de suite ;
 *  - à chaque changement de page et pour les actions qui traînent : barre fine + pastille, qui n'apparaissent qu'après un petit
 *    délai (rien du tout pour une page qui charge vite) et qui laissent la page utilisable.
 * Les rafraîchissements automatiques en arrière-plan (notifications, compteurs...) ne le déclenchent jamais.
 */
export default function GlobalLoader() {
  const { pathname } = useLocation();
  const page = useLoading((s) => s.page);
  const mutation = useLoading((s) => s.mutation);
  const immediate = useLoading((s) => s.immediate);

  const [pageWindow, setPageWindow] = useState(true); // fenêtre de chargement d'une page, ouverte à chaque changement de page
  const [booting, setBooting] = useState(true);
  const [shown, setShown] = useState<Mode>('full'); // plein écran dès le premier rendu (le splash de index.html prend le relais)
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
  const want: Mode = booting ? 'full' : immediate > 0 ? 'soft' : (waitingPage || mutation > 0) ? 'subtle' : null;
  // Délai avant d'afficher : aucun pour le démarrage et la connexion ; une page doit traîner un peu avant qu'on s'en préoccupe.
  const delay = want === 'full' || want === 'soft' ? 0 : waitingPage ? 350 : 700;

  useEffect(() => {
    if (want === shown) return;
    if (want) {
      const t = setTimeout(() => { shownAt.current = Date.now(); setShown(want); }, shown ? 0 : delay);
      return () => clearTimeout(t);
    }
    // Une fois affiché, l'indicateur reste assez longtemps pour ne pas clignoter.
    const t = setTimeout(() => setShown(null), Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current)));
    return () => clearTimeout(t);
  }, [want, shown, delay]);

  return <LoadingScreen mode={shown} />;
}
