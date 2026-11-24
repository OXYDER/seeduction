import { useEffect, useState } from 'react';
import { fitAccent, type FittedAccent } from './accentColor';

export const THEME_STORAGE_KEY = 'seeduction-theme';
/** Seul thème du site (mise en page) — les anciens (Doré classique, Écarlate, Nuit Argentée) ont été retirés au
 * profit d'une seule mise en page « Prestige », personnalisable par sa couleur d'accent (voir ACCENTS). */
export const DEFAULT_THEME = 'prestige';

export const ACCENT_STORAGE_KEY = 'seeduction-accent';
export const ACCENTS: { value: string; label: string; color: string }[] = [
  { value: 'violet', label: 'Violet et rose', color: 'linear-gradient(135deg, #8b5cf6, #ec4899)' },
  { value: 'bleu', label: 'Bleu', color: 'linear-gradient(135deg, #3b82f6, #06b6d4)' },
  { value: 'rouge', label: 'Rouge', color: 'linear-gradient(135deg, #ef4444, #f97316)' },
  { value: 'vert', label: 'Vert', color: 'linear-gradient(135deg, #10b981, #84cc16)' },
  { value: 'or', label: 'Doré', color: 'linear-gradient(135deg, #f0c45c, #f59e0b)' },
  { value: 'neon', label: 'Néon Arcade', color: 'linear-gradient(135deg, #22d3ee, #f472b6)' },
  { value: 'emeraude', label: 'Émeraude Royale', color: 'linear-gradient(135deg, #059669, #e0b84a)' },
  { value: 'sang', label: 'Sang et Ombre', color: 'linear-gradient(135deg, #dc2626, #7f1d1d)' },
  { value: 'glacier', label: 'Glacier', color: 'linear-gradient(135deg, #67e8f9, #a5b4fc)' },
  { value: 'aurore', label: 'Aurore', color: 'linear-gradient(135deg, #fb923c, #d946ef)' },
];

export function getAccent(): string {
  return document.documentElement.getAttribute('data-accent') ?? 'violet';
}

export function setAccent(value: string) {
  if (value === 'violet') document.documentElement.removeAttribute('data-accent');
  else document.documentElement.setAttribute('data-accent', value);
  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, value);
  } catch {
    // Stockage indisponible : le choix vaut pour cette visite.
  }
  applyCustomAccent();
  window.dispatchEvent(new Event('seeduction-theme'));
}

export const CATEGORY_ACCENT_STORAGE_KEY = 'seeduction-category-accent';

export function getCategoryAccentEnabled(): boolean {
  try { return localStorage.getItem(CATEGORY_ACCENT_STORAGE_KEY) === '1'; } catch { return false; }
}

export function setCategoryAccentEnabled(enabled: boolean) {
  try { localStorage.setItem(CATEGORY_ACCENT_STORAGE_KEY, enabled ? '1' : '0'); } catch { /* stockage indisponible */ }
  if (!enabled) applyCategoryAccent(null);
  window.dispatchEvent(new Event('seeduction-theme'));
}

export function useCategoryAccentEnabled(): boolean {
  const [enabled, setEnabled] = useState(getCategoryAccentEnabled);
  useEffect(() => {
    const update = () => setEnabled(getCategoryAccentEnabled());
    window.addEventListener('seeduction-theme', update);
    return () => window.removeEventListener('seeduction-theme', update);
  }, []);
  return enabled;
}

function hexToRgb(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '139, 92, 246';
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
}

/**
 * « L'accent suit la catégorie » (option cochable, désactivée par défaut) : au lieu de la couleur fixe choisie dans
 * ACCENTS, l'accent du site (boutons, liens, lueurs...) prend la couleur de la catégorie actuellement parcourue
 * (voir CATEGORY_STYLE dans Layout.tsx), en surchargeant les variables CSS directement sur <html> — plus prioritaire
 * que la règle [data-accent] sans avoir à y toucher. Un hex de `null` retire la surcharge (retour à l'accent choisi).
 */
export function applyCategoryAccent(hex: string | null) {
  const root = document.documentElement.style;
  if (!hex || !getCategoryAccentEnabled()) {
    writeCustomVars(); // retire les variables posées, puis remet la couleur libre si c'est elle qui est choisie
    return;
  }
  const rgb = hexToRgb(hex);
  root.setProperty('--acc1', hex);
  root.setProperty('--acc2', hex);
  root.setProperty('--acc-rgb', rgb);
  root.setProperty('--acc2-rgb', rgb);
  root.setProperty('--acc-light', hex);
  root.setProperty('--acc-link', hex);
}

export function getTheme(): string {
  return document.documentElement.getAttribute('data-theme') ?? DEFAULT_THEME;
}

export function setTheme(value: string) {
  document.documentElement.setAttribute('data-theme', value);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // Stockage indisponible (navigation privée...) : le thème reste appliqué pour cette session, juste pas mémorisé.
  }
  window.dispatchEvent(new Event('seeduction-theme'));
}

/** Thème courant, mis à jour dès qu'il change (sert à choisir la mise en page : barre latérale ou barre du haut). */
export function useAccent(): string {
  const [accent, setAccentState] = useState(getAccent);
  useEffect(() => {
    const update = () => setAccentState(getAccent());
    window.addEventListener('seeduction-theme', update);
    return () => window.removeEventListener('seeduction-theme', update);
  }, []);
  return accent;
}

export function useTheme(): string {
  const [theme, setThemeState] = useState(getTheme);
  useEffect(() => {
    const update = () => setThemeState(getTheme());
    window.addEventListener('seeduction-theme', update);
    return () => window.removeEventListener('seeduction-theme', update);
  }, []);
  return theme;
}

/** Apparence : sombre (par défaut), clair, ou « auto » (suit le réglage du système). Indépendant de la couleur d'accent. */
export type Mode = 'dark' | 'light' | 'auto';
export const MODE_STORAGE_KEY = 'seeduction-mode';

export function getMode(): Mode {
  try { const v = localStorage.getItem(MODE_STORAGE_KEY); return v === 'light' || v === 'auto' ? v : 'dark'; } catch { return 'dark'; }
}

/** Applique l'apparence sur <html> (attribut data-mode="light" quand le clair est actif). */
export function applyMode(mode: Mode = getMode()) {
  const forced = AMBIANCES.find((a) => a.value === getAmbiance())?.forced;
  const light = forced ? forced === 'light' : mode === 'light' || (mode === 'auto' && !!window.matchMedia?.('(prefers-color-scheme: light)').matches);
  if (light) document.documentElement.setAttribute('data-mode', 'light');
  else document.documentElement.removeAttribute('data-mode');
  applyCustomAccent(); // les liens d'une couleur libre se calculent selon le fond (sombre ou clair)
}

export function setMode(mode: Mode) {
  try { localStorage.setItem(MODE_STORAGE_KEY, mode); } catch { /* stockage indisponible : le choix vaut pour cette visite */ }
  applyMode(mode);
  window.dispatchEvent(new Event('seeduction-theme'));
}

export function useMode(): Mode {
  const [mode, setM] = useState<Mode>(getMode);
  useEffect(() => {
    const update = () => setM(getMode());
    window.addEventListener('seeduction-theme', update);
    return () => window.removeEventListener('seeduction-theme', update);
  }, []);
  return mode;
}

/** En mode « auto », suit le système en direct (à appeler une fois au démarrage). */
export function watchSystemMode() {
  const mq = window.matchMedia?.('(prefers-color-scheme: light)');
  if (!mq) return;
  const on = () => { if (getMode() === 'auto') applyMode('auto'); };
  mq.addEventListener?.('change', on);
}

/* ───────────── Ambiances : Prestige (par défaut), Cinéma, Terminal, Papier ─────────────
 * Une ambiance règle la police des titres, les angles, le grain et la teinte des fonds ; elle est indépendante de la
 * couleur d'accent (mais en propose une). Cinéma et Terminal sont toujours sombres, Papier toujours clair : le choix
 * Sombre / Clair / Auto ne s'applique qu'à Prestige. */
export type Ambiance = 'prestige' | 'cinema' | 'terminal' | 'papier';
export const AMBIANCE_STORAGE_KEY = 'seeduction-ambiance';
const ACCENT_BEFORE_KEY = 'seeduction-accent-before-ambiance';
export const AMBIANCES: { value: Ambiance; label: string; desc: string; forced?: 'dark' | 'light'; accent?: string; sample: [string, string, string] }[] = [
  { value: 'prestige', label: 'Prestige', desc: 'Verre et lueurs, sombre ou clair', sample: ['#0e111d', '#f3f4fb', '#8b5cf6'] },
  { value: 'cinema', label: 'Cinéma', desc: 'Noir chaud, titres à empattements, grain de pellicule', forced: 'dark', accent: '#d9a441', sample: ['#100e0c', '#f3ead8', '#d9a441'] },
  { value: 'terminal', label: 'Terminal', desc: 'Monospace, vert sur noir, angles droits', forced: 'dark', accent: '#2fe38a', sample: ['#07180f', '#a6f5c3', '#2fe38a'] },
  { value: 'papier', label: 'Papier', desc: 'Clair chaud, titres de journal', forced: 'light', accent: '#9a4d1d', sample: ['#fffdf7', '#2a2519', '#9a4d1d'] },
];

export function getAmbiance(): Ambiance {
  const v = document.documentElement.getAttribute('data-ambiance');
  return v === 'cinema' || v === 'terminal' || v === 'papier' ? v : 'prestige';
}

export function setAmbiance(value: Ambiance) {
  const root = document.documentElement;
  const amb = AMBIANCES.find((a) => a.value === value)!;
  const prev = getAmbiance();
  if (value === 'prestige') root.removeAttribute('data-ambiance'); else root.setAttribute('data-ambiance', value);
  try { localStorage.setItem(AMBIANCE_STORAGE_KEY, value); } catch { /* stockage indisponible */ }
  // L'ambiance propose sa couleur ; on retient celle d'avant pour la rendre en revenant à Prestige (si le membre n'en a pas changé entre-temps).
  try {
    if (amb.accent) {
      if (prev === 'prestige') localStorage.setItem(ACCENT_BEFORE_KEY, getAccent());
      setCustomAccent(amb.accent, false);
    } else if (prev !== 'prestige') {
      const before = localStorage.getItem(ACCENT_BEFORE_KEY);
      const sig = AMBIANCES.find((a) => a.value === prev)?.accent;
      if (before && before !== 'custom' && getAccent() === 'custom' && readCustom()?.hex === sig) setAccent(before);
    }
  } catch { /* idem */ }
  applyMode();
  window.dispatchEvent(new Event('seeduction-theme'));
}

export function useAmbiance(): Ambiance {
  const [a, setA] = useState<Ambiance>(getAmbiance);
  useEffect(() => {
    const update = () => setA(getAmbiance());
    window.addEventListener('seeduction-theme', update);
    return () => window.removeEventListener('seeduction-theme', update);
  }, []);
  return a;
}

/* ───────────── Couleur libre ───────────── */
export const CUSTOM_ACCENT_KEY = 'seeduction-accent-custom';
interface CustomAccent { hex: string; dark: Record<string, string>; light: Record<string, string> }
const CUSTOM_VARS = ['--acc1', '--acc2', '--acc-rgb', '--acc2-rgb', '--acc-light', '--acc-link', '--acc-link-hover', '--on-acc', '--aurora-a', '--aurora-b', '--aurora-c', '--aurora-d'];

export function readCustom(): CustomAccent | null {
  try { const v = JSON.parse(localStorage.getItem(CUSTOM_ACCENT_KEY) ?? 'null'); return v && v.hex && v.dark && v.light ? v : null; } catch { return null; }
}

/** Pose (ou retire) les variables de la couleur libre sur <html>. Les lueurs de fond restent celles de l'ambiance quand il y en a une. */
function writeCustomVars() {
  const style = document.documentElement.style;
  CUSTOM_VARS.forEach((k) => style.removeProperty(k));
  if (getAccent() !== 'custom') return;
  const c = readCustom();
  if (!c) return;
  const vars = document.documentElement.getAttribute('data-mode') === 'light' ? c.light : c.dark;
  const ambiance = getAmbiance() !== 'prestige';
  for (const [k, v] of Object.entries(vars)) if (!(ambiance && k.startsWith('--aurora'))) style.setProperty(k, v);
}

function applyCustomAccent() {
  if (!getCategoryAccentEnabled()) writeCustomVars(); // « l'accent suit la catégorie » reste prioritaire quand il est actif
}

/** Choisit une couleur libre. Retourne le résultat du contrôle de lisibilité (pour l'afficher dans le sélecteur). */
export function setCustomAccent(hex: string, notify = true): { dark: FittedAccent; light: FittedAccent } | null {
  const dark = fitAccent(hex, false), light = fitAccent(hex, true);
  if (!dark || !light) return null;
  try { localStorage.setItem(CUSTOM_ACCENT_KEY, JSON.stringify({ hex, dark: dark.vars, light: light.vars })); } catch { /* stockage indisponible */ }
  document.documentElement.setAttribute('data-accent', 'custom');
  try { localStorage.setItem(ACCENT_STORAGE_KEY, 'custom'); } catch { /* idem */ }
  applyCustomAccent();
  if (notify) window.dispatchEvent(new Event('seeduction-theme'));
  return { dark, light };
}
