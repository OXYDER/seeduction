import { useEffect, useRef, useState } from 'react';
import { ACCENTS, THEMES, setAccent, setTheme, useAccent, useTheme } from '../lib/theme';

export { THEME_STORAGE_KEY } from '../lib/theme';

export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const current = useTheme();
  const accent = useAccent();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function choose(value: string) {
    setTheme(value);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="secondary" onClick={() => setOpen((v) => !v)} title="Changer de thème">🎨</button>
      {open && (
        <div className="panel ornate theme-menu" style={{ position: 'absolute', right: 0, top: '110%', width: 210, zIndex: 80, padding: 8 }}>
          {THEMES.map((t) => (
            <button
              key={t.value}
              className="secondary"
              style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4, fontWeight: current === t.value ? 700 : 400 }}
              onClick={() => choose(t.value)}
            >
              {current === t.value ? '✓ ' : ''}{t.label}
            </button>
          ))}
          {current === 'prestige' && (
            <div className="accent-dots" title="Couleur d'accent">
              <span className="muted" style={{ fontSize: 11 }}>Accent</span>
              {ACCENTS.map((a) => (
                <button key={a.value} type="button" className={`accent-dot${accent === a.value ? ' on' : ''}`} style={{ background: a.color }} title={a.label} aria-label={a.label} onClick={() => setAccent(a.value)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
