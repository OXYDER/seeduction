import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const cache = new Map<string, { at: number; promise: Promise<any> }>();
const TTL_MS = 60_000;

/** Charge une donnée une seule fois par minute et par clé (plusieurs survols du même élément = une seule requête). */
export function cachedLoad<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = load().catch((err) => { cache.delete(key); throw err; });
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

/**
 * Infobulle riche au survol : après un court délai, charge les données (`load`, mises en cache) puis affiche
 * `children(data)` près du curseur. Inactive sur écran tactile. Le contenu n'intercepte jamais la souris.
 */
export default function HoverCard<T>({
  cacheKey, load, children, render, inline = true,
}: {
  cacheKey: string;
  load: () => Promise<T>;
  /** Le déclencheur (nom cliquable, avatar...). */
  children: React.ReactNode;
  /** Contenu de l'infobulle. */
  render: (data: T) => React.ReactNode;
  inline?: boolean;
}) {
  const [data, setData] = useState<T | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const active = useRef(false);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function enter(e: React.MouseEvent) {
    if (window.matchMedia?.('(hover: none)').matches) return;
    active.current = true;
    const { clientX, clientY } = e;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      cachedLoad(cacheKey, load)
        .then((d) => { if (active.current) { setData(d); setPos({ x: clientX, y: clientY }); } })
        .catch(() => { /* pas d'infobulle si la donnée est indisponible */ });
    }, 350);
  }
  function move(e: React.MouseEvent) {
    const { clientX, clientY } = e;
    setPos((p) => (p ? { x: clientX, y: clientY } : p));
  }
  function leave() {
    active.current = false;
    window.clearTimeout(timer.current);
    setPos(null);
  }

  const left = pos ? Math.max(8, Math.min(pos.x + 18, window.innerWidth - 400)) : 0;
  const top = pos ? Math.max(8, Math.min(pos.y + 18, window.innerHeight - 240)) : 0;

  return (
    <span onMouseEnter={enter} onMouseMove={move} onMouseLeave={leave} style={{ display: inline ? 'inline' : 'block' }}>
      {children}
      {pos && data !== null && createPortal(<div className="torrent-tip" style={{ left, top }}>{render(data)}</div>, document.body)}
    </span>
  );
}
