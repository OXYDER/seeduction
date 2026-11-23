import { useCallback, useSyncExternalStore } from 'react';

/**
 * Façon de parcourir une longue liste de torrents : défilement continu (la suite se charge toute seule en
 * descendant dans la page, par lots de 25 / 50 / 75 / 100) ou pages numérotées. Réglage retenu dans ce navigateur,
 * partagé par Parcourir et Découvrir. Le défilement continu est le choix par défaut.
 */
export const BATCH_SIZES = [25, 50, 75, 100];
const KEY = 'seeduction:list-mode';

export interface ListPrefs { infinite: boolean; size: number }
const DEFAULT: ListPrefs = { infinite: true, size: 50 };

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

let memory = ''; // repli quand le stockage du navigateur est indisponible (navigation privée)
function read(): string {
  try { return localStorage.getItem(KEY) ?? memory; } catch { return memory; }
}

function parse(raw: string): ListPrefs {
  if (!raw) return DEFAULT;
  const [mode, size] = raw.split(':');
  const n = parseInt(size, 10);
  return { infinite: mode !== 'pages', size: BATCH_SIZES.includes(n) ? n : DEFAULT.size };
}

/** [réglage courant, changer] — le réglage est lu dans le stockage du navigateur, repli sur le défaut si indisponible. */
export function useListPrefs(): [ListPrefs, (p: Partial<ListPrefs>) => void] {
  const raw = useSyncExternalStore(subscribe, read);
  const prefs = parse(raw);
  const set = useCallback((p: Partial<ListPrefs>) => {
    const next = { ...parse(read()), ...p };
    memory = `${next.infinite ? 'scroll' : 'pages'}:${next.size}`;
    try { localStorage.setItem(KEY, memory); } catch { /* le choix vaut pour cette visite */ }
    listeners.forEach((l) => l());
  }, []);
  return [prefs, set];
}
