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
export function useTheme(): string {
  const [theme, setThemeState] = useState(getTheme);
  useEffect(() => {
    const update = () => setThemeState(getTheme());
    window.addEventListener('seeduction-theme', update);
    return () => window.removeEventListener('seeduction-theme', update);
  }, []);
  return theme;
}
