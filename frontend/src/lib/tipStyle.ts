import { useSyncExternalStore } from 'react';

/**
 * Style des info-bulles de torrents (au survol d'un titre ou d'une affiche). Chaque membre choisit le sien dans son
 * compte (stocké côté serveur, voir User.tipStyle) ; « off » désactive les info-bulles.
 */
export type TipStyle = 'poster' | 'classic' | 'cinema' | 'minimal' | 'off';

export const TIP_STYLES: { id: Exclude<TipStyle, 'off'>; icon: string; label: string; hint: string }[] = [
  { id: 'poster', icon: '🎞️', label: 'Affiche', hint: 'Grande affiche avec le titre dessus, genres, synopsis et casting' },
  { id: 'cinema', icon: '🎬', label: 'Cinéma', hint: 'Bandeau panoramique avec la petite affiche, synopsis et casting' },
  { id: 'classic', icon: '🗒️', label: 'Classique', hint: 'Petite affiche à gauche et le détail à droite' },
  { id: 'minimal', icon: '✦', label: 'Minimal', hint: 'Sans image : titre, infos essentielles et un court résumé' },
];

const FALLBACK: TipStyle = 'poster';
const isStyle = (v: unknown): v is TipStyle => v === 'off' || TIP_STYLES.some((s) => s.id === v);

let current: TipStyle = FALLBACK;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Style du membre (chargé avec son profil, ou à l'instant où il le change). */
export function applyTipStyle(style: string | null | undefined) {
  if (isStyle(style) && style !== current) {
    current = style;
    listeners.forEach((l) => l());
  }
}

export function useTipStyle(): TipStyle {
  return useSyncExternalStore(subscribe, () => current);
}
