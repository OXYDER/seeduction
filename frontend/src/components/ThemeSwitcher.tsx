import { useEffect, useRef, useState } from 'react';

export const THEME_STORAGE_KEY = 'seeduction-theme';

const THEMES: { label: string; value: string }[] = [
  { label: '🟡 Doré (par défaut)', value: '' },
  { label: '🔴 Écarlate', value: 'ecarlate' },
  { label: '🔵 Nuit Argentée', value: 'nuit' },
];

function setTheme(value: string) {
  if (value) document.documentElement.setAttribute('data-theme', value);
  else document.documentElement.removeAttribute('data-theme');
  try {
    if (value) localStorage.setItem(THEME_STORAGE_KEY, value);
    else localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // Stockage indisponible (navigation privée...) : le thème reste appliqué pour cette session, juste pas mémorisé.
  }
}

export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(() => document.documentElement.getAttribute('data-theme') ?? '');
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
    setCurrent(value);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="secondary" onClick={() => setOpen((v) => !v)} title="Changer de thème">🎨</button>
      {open && (
        <div className="panel ornate" style={{ position: 'absolute', right: 0, top: '110%', width: 190, zIndex: 50, padding: 8 }}>
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
        </div>
      )}
    </div>
  );
}
