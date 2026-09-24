import { useEffect, useState } from 'react';

export const THEME_STORAGE_KEY = 'seeduction-theme';
/** Thème appliqué à ceux qui n'en ont jamais choisi. Les anciens thèmes restent disponibles dans le sélecteur 🎨. */
export const DEFAULT_THEME = 'prestige';

export const THEMES: { label: string; value: string }[] = [
  { label: '✨ Prestige (nouveau)', value: 'prestige' },
  { label: '🟡 Doré classique', value: 'dore' },
  { label: '🔴 Écarlate', value: 'ecarlate' },
  { label: '🔵 Nuit Argentée', value: 'nuit' },
];

export const ACCENT_STORAGE_KEY = 'seeduction-accent';
export const ACCENTS: { value: string; label: string; color: string }[] = [
  { value: 'violet', label: 'Violet et rose', color: 'linear-gradient(135deg, #8b5cf6, #ec4899)' },
  { value: 'bleu', label: 'Bleu', color: 'linear-gradient(135deg, #3b82f6, #06b6d4)' },
  { value: 'rouge', label: 'Rouge', color: 'linear-gradient(135deg, #ef4444, #f97316)' },
  { value: 'vert', label: 'Vert', color: 'linear-gradient(135deg, #10b981, #84cc16)' },
  { value: 'or', label: 'Doré', color: 'linear-gradient(135deg, #f0c45c, #f59e0b)' },
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
