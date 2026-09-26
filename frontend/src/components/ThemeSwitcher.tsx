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
        <div className="panel ornate theme-menu" style={{ position: 'absolute', right: 0, top: '110%', width: 210, zIndex: 80, padding: 8 }}>
          <div className="accent-dots" title="Couleur d'accent">
            <span className="muted" style={{ fontSize: 11 }}>Accent</span>
            {ACCENTS.map((a) => (
              <button key={a.value} type="button" className={`accent-dot${accent === a.value ? ' on' : ''}`} style={{ background: a.color }} title={a.label} aria-label={a.label} onClick={() => { setAccent(a.value); setOpen(false); }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
