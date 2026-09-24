import { useEffect } from 'react';

/**
 * Fond cinématographique de la page (thème Prestige) : l'image donnée s'affiche en grand, floutée et
 * assombrie, derrière tout le contenu. Retirée automatiquement en quittant la page.
 */
export function usePageBackdrop(url?: string | null) {
  useEffect(() => {
    const root = document.documentElement;
    if (url) root.style.setProperty('--backdrop', `url("${url}")`);
    else root.style.removeProperty('--backdrop');
    return () => { root.style.removeProperty('--backdrop'); };
  }, [url]);
}
