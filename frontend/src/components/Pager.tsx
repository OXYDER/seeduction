/** Pages à afficher : la première, la dernière, la courante et ses voisines, avec « … » pour les trous (1 … 4 5 [6] 7 8 … 20). */
export function pageWindow(page: number, pages: number, around = 2): (number | '…')[] {
  const keep = new Set<number>([1, pages]);
  for (let p = page - around; p <= page + around; p++) if (p >= 1 && p <= pages) keep.add(p);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(p - sorted[i - 1] === 2 ? sorted[i - 1] + 1 : '…'); // un seul numéro manquant : on l'affiche plutôt qu'un « … »
    out.push(p);
  });
  return out;
}

interface PagerProps {
  page: number;
  /** Nombre total de résultats (ou de contenus en vue groupée). */
  total: number;
  pageSize: number;
  pageSizes: number[];
  /** Mot affiché après le total : « résultat », « contenu »… (mis au pluriel automatiquement). */
  unit?: string;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
  /** Adresse de chaque page : les numéros sont de vrais liens (ouvrir dans un nouvel onglet, copier l'adresse…). */
  hrefFor?: (page: number) => string;
  /** Remonte en haut de la liste après un changement de page (pager du bas). */
  scrollTop?: boolean;
}

/**
 * Pagination d'une liste de résultats : « ← Préc. », numéros de pages cliquables (1 … 4 5 6 7 8 … 20), « Suiv. → »,
 * et le nombre de résultats par page. Placée en haut ET en bas de la liste.
 */
export default function Pager({ page, total, pageSize, pageSizes, unit = 'résultat', onPage, onSize, hrefFor, scrollTop }: PagerProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const go = (p: number) => { if (p < 1 || p > pages || p === page) return; onPage(p); if (scrollTop) window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const num = (p: number) => {
    const on = p === page;
    return (
      <a key={p} className={`pager-num${on ? ' on' : ''}`} href={hrefFor?.(p) ?? '#'} aria-current={on ? 'page' : undefined} aria-label={`Page ${p}`}
        onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); go(p); }}>{p}</a>
    );
  };
  return (
    <nav className="pager" aria-label="Pagination">
      <span className="muted pager-info">Page {page} / {pages} ({total} {unit}{total > 1 ? 's' : ''})</span>
      <div className="pager-pages">
        <button type="button" className="secondary" disabled={page <= 1} onClick={() => go(page - 1)}>← Préc.</button>
        {pageWindow(page, pages).map((p, i) => (p === '…' ? <span key={`gap${i}`} className="pager-gap" aria-hidden="true">…</span> : num(p)))}
        <button type="button" className="secondary" disabled={page >= pages} onClick={() => go(page + 1)}>Suiv. →</button>
      </div>
      <label className="muted row pager-size">
        Par page
        <select value={pageSize} onChange={(e) => onSize(Number(e.target.value))}>
          {pageSizes.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </nav>
  );
}
