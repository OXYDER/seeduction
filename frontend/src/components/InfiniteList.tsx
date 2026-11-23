import { useEffect, useRef } from 'react';
import { BATCH_SIZES, type ListPrefs } from '../lib/listMode';

/** Réglage « défilement continu / pages » + taille des lots, à mettre dans la barre d'outils d'une liste de torrents. */
export function ListModeBar({ prefs, onChange, manual }: { prefs: ListPrefs; onChange: (p: Partial<ListPrefs>) => void; /** Sans pages numérotées (ex. Découvrir) : le second choix est « Sur demande », avec un bouton pour la suite. */ manual?: boolean }) {
  return (
    <div className="lm-bar">
      <div className="view-toggle" role="group" aria-label="Façon de parcourir la liste">
        <button type="button" className={prefs.infinite ? 'on' : ''} aria-pressed={prefs.infinite} onClick={() => onChange({ infinite: true })} title="La suite de la liste se charge toute seule en descendant dans la page">
          <span aria-hidden="true">∞</span><span className="view-toggle-label">Défilement continu</span>
        </button>
        <button type="button" className={!prefs.infinite ? 'on' : ''} aria-pressed={!prefs.infinite} onClick={() => onChange({ infinite: false })} title={manual ? 'La suite se charge avec un bouton' : 'Pages numérotées'}>
          <span aria-hidden="true">{manual ? '⇣' : '①'}</span><span className="view-toggle-label">{manual ? 'Sur demande' : 'Pages'}</span>
        </button>
      </div>
      {prefs.infinite && (
        <label className="muted lm-size" title="Nombre de torrents chargés à chaque fois">
          Par lot
          <select value={prefs.size} onChange={(e) => onChange({ size: Number(e.target.value) })}>
            {BATCH_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

/**
 * Pied d'une liste à défilement continu : charge la suite dès que l'on approche du bas de la page (un bouton reste
 * disponible au cas où), indique où l'on en est, et propose de remonter.
 */
export function InfiniteFooter({ shown, total, loading, onMore, unit = 'résultat' }: { shown: number; total: number; loading: boolean; onMore: () => void; unit?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const more = shown < total;
  const cb = useRef(onMore);
  cb.current = onMore;
  // Un nouveau lot est demandé quand le repère (juste sous la liste) arrive à ~800 px de l'écran ; chaque lot rechargé
  // recrée l'observation, donc un écran encore vide après un lot en redemande un autre.
  useEffect(() => {
    const el = ref.current;
    if (!el || !more || loading || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) cb.current(); }, { rootMargin: '0px 0px 800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more, loading, shown]);
  return (
    <div className="lm-foot" ref={ref}>
      {loading && more && <span className="lm-spin" role="status" aria-label="Chargement" />}
      <span className="muted">{shown} sur {total} {unit}{total > 1 ? 's' : ''}{more ? '' : ' · c’est tout'}</span>
      {more && !loading && <button type="button" className="secondary" onClick={onMore}>Charger la suite</button>}
      {shown > 24 && <button type="button" className="secondary lm-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑ Haut de la page</button>}
    </div>
  );
}
