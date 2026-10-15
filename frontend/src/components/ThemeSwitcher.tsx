import { playGoalHorn } from '../lib/goalHorn';
import { useCallback, useRef, useState } from 'react';
import HeaderPopover from './HeaderPopover';
import { ACCENTS, setAccent, useAccent, useCategoryAccentEnabled, setCategoryAccentEnabled } from '../lib/theme';
import { useEventTheme } from '../store/eventTheme';
import { ART } from '../lib/eventArt';

export { THEME_STORAGE_KEY } from '../lib/theme';

/** Choix de la couleur d'accent du thème Prestige (seul thème du site — voir lib/theme.ts). */
export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const accent = useAccent();
  const categoryAccent = useCategoryAccentEnabled();
  const ref = useRef<HTMLButtonElement>(null);
  const ev = useEventTheme();
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
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Décors de saison</div>
            <select value={ev.mode} onChange={(e) => ev.setMode(e.target.value as any)} aria-label="Décors de saison" style={{ width: '100%' }}>
              <option value="full">Complets (particules animées)</option>
              <option value="static">Sans animation</option>
              <option value="off">Désactivés</option>
            </select>
            <label className="row" style={{ gap: 8, marginTop: 8, fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={ev.colors} onChange={(e) => ev.setColors(e.target.checked)} />
              Couleurs de l'événement
            </label>
            <label className="row" style={{ gap: 8, marginTop: 8, fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={ev.mtl} onChange={(e) => ev.setMtl(e.target.checked)} />
              Score des Canadiens en direct
            </label>
            {ev.mtl && (
              <label className="row" style={{ gap: 8, marginTop: 4, marginLeft: 22, fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={ev.mtlSound} onChange={(e) => ev.setMtlSound(e.target.checked)} />
                Sirène quand le Canadien marque
                <button type="button" style={{ fontSize: 12, padding: 0, background: 'none', border: 0, boxShadow: 'none', textDecoration: 'underline', color: 'inherit', cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); playGoalHorn(); }}>Écouter</button>
              </label>
            )}
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
              {ev.server?.id ? `En ce moment : ${ART[ev.server.id].name}.` : 'Aucun événement en ce moment.'} Halloween, Noël, Saint-Valentin, Pâques, Saint-Jean, fête du Canada.
            </div>
          </div>
        </div>
      </HeaderPopover>
    </>
  );
}
