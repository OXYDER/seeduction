import { useEffect, useRef, useState } from 'react';
import { ACCENTS, setAccent, useAccent } from '../lib/theme';

export { THEME_STORAGE_KEY } from '../lib/theme';

/** Choix de la couleur d'accent du thème Prestige (seul thème du site — voir lib/theme.ts). */
export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const accent = useAccent();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="secondary" onClick={() => setOpen((v) => !v)} title="Couleur d'accent">🎨</button>
      {open && (
        <div className="panel ornate theme-menu" style={{ position: 'absolute', right: 0, top: '110%', width: 260, zIndex: 80, padding: 10 }}>
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Couleur d'accent</div>
          <div className="accent-grid">
            {ACCENTS.map((a) => (
              <button
                key={a.value}
                type="button"
                className={`accent-swatch${accent === a.value ? ' on' : ''}`}
                onClick={() => { setAccent(a.value); setOpen(false); }}
              >
                <span className="accent-swatch-dot" style={{ background: a.color }} />
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
