import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface HomeTab { id: string; label: string; icon: string; /** Couleur de l'onglet (accent du thème). */ color: string; /** Petit compteur à côté du nom (optionnel). */ badge?: number | string | null; content: ReactNode }

/**
 * Onglets de l'accueil : les sections qui s'empilaient (nouvelles, à la une, activité, rangées d'affiches, communauté...) sont réunies ici, une à la fois, pour raccourcir la page.
 * Un onglet n'est monté (et ne charge ses données) qu'à sa première ouverture, puis reste en mémoire : revenir dessus est instantané.
 * L'onglet choisi est rappelé dans l'adresse (#onglet) : on peut le partager ou y revenir avec « Précédent ».
 */
export default function HomeTabs({ tabs, initial }: { tabs: HomeTab[]; initial?: string }) {
  const fromHash = () => { const h = decodeURIComponent(window.location.hash.replace(/^#/, '')); return tabs.some((t) => t.id === h) ? h : null; };
  const [active, setActive] = useState<string>(() => fromHash() ?? initial ?? tabs[0]?.id);
  const [seen, setSeen] = useState<Set<string>>(() => new Set([fromHash() ?? initial ?? tabs[0]?.id]));
  const barRef = useRef<HTMLDivElement>(null);

  // Un onglet qui disparaît (plus rien à montrer) : retour au premier.
  const current = tabs.some((t) => t.id === active) ? active : tabs[0]?.id;
  useEffect(() => { const h = () => { const t = fromHash(); if (t) pick(t, false); }; window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(id: string, writeHash = true) {
    setActive(id);
    setSeen((s) => (s.has(id) ? s : new Set(s).add(id)));
    if (writeHash) { try { window.history.replaceState(null, '', id === tabs[0]?.id ? window.location.pathname + window.location.search : `#${encodeURIComponent(id)}`); } catch { /* ignoré */ } }
  }
  function onKey(e: React.KeyboardEvent) {
    const i = tabs.findIndex((t) => t.id === current);
    const next = e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length] : null;
    if (next) { e.preventDefault(); pick(next.id); (barRef.current?.querySelector(`[data-tab="${CSS.escape(next.id)}"]`) as HTMLElement | null)?.focus(); }
  }

  return (
    <div className="home-tabs">
      <div className="home-tabbar" role="tablist" ref={barRef} onKeyDown={onKey}>
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`ht-${t.id}`} data-tab={t.id} aria-selected={t.id === current} aria-controls={`htp-${t.id}`} tabIndex={t.id === current ? 0 : -1}
            className={`home-tab${t.id === current ? ' on' : ''}`} style={{ ['--tab-c' as string]: t.color }} onClick={() => pick(t.id)}>
            <span className="home-tab-icon" aria-hidden="true">{t.icon}</span>
            <span className="home-tab-label">{t.label}</span>
            {t.badge !== undefined && t.badge !== null && t.badge !== 0 && <span className="home-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`htp-${t.id}`} aria-labelledby={`ht-${t.id}`} className="home-tabpanel" hidden={t.id !== current} style={{ ['--tab-c' as string]: t.color }}>
          {seen.has(t.id) || t.id === current ? t.content : null}
        </div>
      ))}
    </div>
  );
}
