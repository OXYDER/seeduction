/** Historique des recherches du moteur du site, propre à cet appareil (les 10 dernières, la plus récente d'abord). */
const KEY = 'seeduction:search-history';
const MAX = 10;

export function readSearchHistory(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX) : [];
  } catch { return []; }
}

function write(list: string[]) {
  try { if (list.length) localStorage.setItem(KEY, JSON.stringify(list)); else localStorage.removeItem(KEY); } catch { /* historique facultatif */ }
}

export function addSearch(q: string) {
  const term = q.trim().replace(/\s+/g, ' ');
  if (term.length < 2) return;
  write([term, ...readSearchHistory().filter((x) => x.toLowerCase() !== term.toLowerCase())].slice(0, MAX));
}

export function removeSearch(q: string): string[] {
  const next = readSearchHistory().filter((x) => x !== q);
  write(next);
  return next;
}

export function clearSearchHistory() { write([]); }
