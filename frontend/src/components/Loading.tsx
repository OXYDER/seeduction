/**
 * Indicateurs de chargement du site.
 *  - `Loading` : une petite roue animée avec « Chargement… », pour une section ou une page qui attend ses données. Il n'apparaît qu'après un court délai (150 ms) :
 *    quand les données arrivent vite, rien ne clignote. Si une erreur est fournie, elle remplace l'animation.
 *  - `PageLoading` : le squelette d'une page (titre et cartes grises qui scintillent) avec une barre de progression fine en haut de l'écran ; sert pendant le téléchargement d'une page.
 */
export default function Loading({ error, label = 'Chargement…', rows = 3, cards = false }: { error?: string | null; label?: string; /** Lignes grises qui scintillent sous la roue (0 = aucune). */ rows?: number; /** Squelette de cartes (grille) plutôt que de lignes. */ cards?: boolean }) {
  if (error) return <p className="muted">{error}</p>;
  return (
    <div className="ld-wrap" role="status" aria-live="polite">
      <div className="ld">
        <span className="ld-spin" aria-hidden="true" />
        <span>{label}</span>
      </div>
      {cards ? (
        <div className="ld-cards ld-cards-sm" aria-hidden="true"><i /><i /><i /><i /></div>
      ) : rows > 0 && (
        <div className="ld-rows" aria-hidden="true">{Array.from({ length: rows }, (_, k) => <i key={k} style={{ width: `${96 - k * 14}%` }} />)}</div>
      )}
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="ld-page" role="status" aria-live="polite" aria-label="Chargement de la page">
      <div className="ld-bar" aria-hidden="true"><span /></div>
      <div className="ld-skel" aria-hidden="true">
        <i className="ld-title" />
        <i className="ld-line" />
        <div className="ld-cards"><i /><i /><i /><i /><i /><i /></div>
      </div>
      <span className="ld-sr">Chargement…</span>
    </div>
  );
}
