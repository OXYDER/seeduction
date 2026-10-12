import { useCallback, useRef, useState } from 'react';
import HeaderPopover from './HeaderPopover';
import { ACCENTS, setAccent, useAccent, useCategoryAccentEnabled, setCategoryAccentEnabled } from '../lib/theme';

export { THEME_STORAGE_KEY } from '../lib/theme';

/** Choix de la couleur d'accent du thème Prestige (seul thème du site — voir lib/theme.ts). */
export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const accent = useAccent();
  const categoryAccent = useCategoryAccentEnabled();
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button ref={ref} type="button" className="secondary" onClick={() => setOpen((v) => !v)} title="Couleur d'accent" aria-label="Couleur d'accent" aria-expanded={open}>🎨</button>
      <HeaderPopover open={open} anchorRef={ref} onClose={close} width={280} label="Couleur d'accent">
        <div className="theme-menu" style={{ padding: 12, overflowY: 'auto' }}>
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
          <label className="row" style={{ gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={categoryAccent} onChange={(e) => setCategoryAccentEnabled(e.target.checked)} />
            L'accent suit la catégorie parcourue
          </label>
        </div>
      </HeaderPopover>
    </>
  );
}
