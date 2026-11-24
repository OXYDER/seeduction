import { playGoalHorn } from '../lib/goalHorn';
import Ic from './Ic';
import { useCallback, useMemo, useRef, useState } from 'react';
import HeaderPopover from './HeaderPopover';
import { ACCENTS, AMBIANCES, setAccent, setAmbiance, setCustomAccent, readCustom, useAccent, useAmbiance, useCategoryAccentEnabled, setCategoryAccentEnabled, setMode, useMode, type Mode } from '../lib/theme';
import { fitAccent, MIN_CONTRAST } from '../lib/accentColor';
import { useEventTheme } from '../store/eventTheme';
import { ART } from '../lib/eventArt';

export { THEME_STORAGE_KEY } from '../lib/theme';

/** Choix de la couleur d'accent du thème Prestige (seul thème du site — voir lib/theme.ts). */
export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const accent = useAccent();
  const mode = useMode();
  const ambiance = useAmbiance();
  const forced = AMBIANCES.find((a) => a.value === ambiance)?.forced;
  const custom = accent === 'custom' ? readCustom() : null;
  const [free, setFree] = useState(() => readCustom()?.hex ?? '#e0457b');
  const light = forced ? forced === 'light' : mode === 'light' || (mode === 'auto' && typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: light)').matches);
  const check = useMemo(() => (accent === 'custom' && custom ? fitAccent(custom.hex, light) : null), [accent, custom?.hex, light]); // eslint-disable-line react-hooks/exhaustive-deps
  const categoryAccent = useCategoryAccentEnabled();
  const ref = useRef<HTMLButtonElement>(null);
  const ev = useEventTheme();
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button ref={ref} type="button" className="secondary" onClick={() => setOpen((v) => !v)} title="Couleur d'accent" aria-label="Couleur d'accent" aria-expanded={open}><Ic n="palette" /></button>
      <HeaderPopover open={open} anchorRef={ref} onClose={close} width={280} label="Couleur d'accent">
        <div className="theme-menu" style={{ padding: 12, overflowY: 'auto' }}>
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Ambiance</div>
          <div className="amb-grid" role="group" aria-label="Ambiance du site">
            {AMBIANCES.map((a) => (
              <button key={a.value} type="button" className={`amb-card${ambiance === a.value ? ' on' : ''}`} aria-pressed={ambiance === a.value} title={a.desc} onClick={() => setAmbiance(a.value)}>
                <span className="amb-sample" style={{ background: a.sample[0], color: a.sample[1] }}><b>Aa</b><i style={{ background: a.sample[2] }} /></span>
                <span className="amb-name">{a.label}</span>
              </button>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 11.5, margin: '6px 0 12px' }}>{AMBIANCES.find((a) => a.value === ambiance)?.desc}</div>
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Apparence</div>
          {forced ? (
            <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{AMBIANCES.find((a) => a.value === ambiance)?.label} est toujours {forced === 'light' ? 'claire' : 'sombre'} ; Sombre / Clair / Auto reviennent avec Prestige.</div>
          ) : (
          <div className="view-toggle mode-toggle" role="group" aria-label="Apparence du site" style={{ marginBottom: 12, width: '100%' }}>
            {([['dark', '🌙', 'Sombre'], ['light', '☀️', 'Clair'], ['auto', '🖥️', 'Auto']] as [Mode, string, string][]).map(([m, icon, label]) => (
              <button key={m} type="button" className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)} title={m === 'auto' ? 'Suit le réglage de ton appareil' : undefined} style={{ flex: 1, justifyContent: 'center' }}>
                <span aria-hidden="true">{icon}</span> {label}
              </button>
            ))}
          </div>
          )}
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
          <div className="free-accent">
            <label className={`accent-swatch free${accent === 'custom' ? ' on' : ''}`} title="Choisis n'importe quelle couleur : le site règle seul le texte des boutons et des liens pour qu'il reste lisible">
              <input type="color" value={custom?.hex ?? free} aria-label="Couleur libre" onChange={(e) => { setFree(e.target.value); setCustomAccent(e.target.value); }} />
              <span className="accent-swatch-dot" style={{ background: custom?.hex ?? free }} />
              Couleur libre
            </label>
            {check && (
              <div className={`free-check${check.buttonRatio >= MIN_CONTRAST && check.linkRatio >= MIN_CONTRAST ? ' ok' : ''}`} role="status">
                Texte des boutons {check.buttonRatio.toFixed(1).replace('.', ',')}:1 · liens {check.linkRatio.toFixed(1).replace('.', ',')}:1 {check.buttonRatio >= MIN_CONTRAST && check.linkRatio >= MIN_CONTRAST ? '✓' : '⚠'}
                {check.adjusted && <div>Couleur légèrement ajustée pour rester lisible.</div>}
              </div>
            )}
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
