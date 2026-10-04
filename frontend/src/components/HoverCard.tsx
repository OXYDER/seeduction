import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

/**
 * Infobulle riche au survol : après un court délai, charge les données (`load`, mises en cache) puis affiche
 * `children(data)` près du curseur. Inactive sur écran tactile. Le contenu n'intercepte jamais la souris.
 * L'infobulle se place d'après sa taille réelle : elle passe à gauche du curseur et remonte si elle déborde de l'écran.
 */
export default function HoverCard<T>({
  cacheKey, load, children, render, inline = true, tipClass = '', disabled = false,
}: {
  cacheKey: string;
  load: () => Promise<T>;
  /** Le déclencheur (nom cliquable, avatar...). */
  children: React.ReactNode;
  /** Contenu de l'infobulle. */
  render: (data: T) => React.ReactNode;
  inline?: boolean;
  /** Classe CSS ajoutée à l'infobulle (style choisi par le membre). */
  tipClass?: string;
  /** Pas d'infobulle du tout. */
  disabled?: boolean;
}) {
  const [data, setData] = useState<T | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const active = useRef(false);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    if (!pos || data === null) { setPlace(null); return; }
    const w = tipRef.current?.offsetWidth ?? 360;
    const h = tipRef.current?.offsetHeight ?? 240;
    let left = pos.x + 18;
    if (left + w > window.innerWidth - 8) left = pos.x - w - 18;
    setPlace({ left: clamp(left, 8, Math.max(8, window.innerWidth - w - 8)), top: clamp(pos.y + 18, 8, Math.max(8, window.innerHeight - h - 8)) });
  }, [pos, data]);

  function enter(e: React.MouseEvent) {
    if (disabled || window.matchMedia?.('(hover: none)').matches) return;
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

  return (
    <span onMouseEnter={enter} onMouseMove={move} onMouseLeave={leave} style={{ display: inline ? 'inline' : 'block' }}>
      {children}
      {pos && data !== null && !disabled && createPortal(
        <div ref={tipRef} className={`torrent-tip ${tipClass}`} style={{ left: place?.left ?? pos.x + 18, top: place?.top ?? pos.y + 18, visibility: place ? 'visible' : 'hidden' }}>{render(data)}</div>,
        document.body,
      )}
    </span>
  );
}
