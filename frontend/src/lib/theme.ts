import { useEffect, useState } from 'react';

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
  window.dispatchEvent(new Event('seeduction-theme'));
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
