// Dessins et réglages visuels des thèmes d'événements. Le calendrier (quand chaque thème est actif) est côté serveur : backend/src/common/utils/event-themes.ts.
// Chaque personnage est un <symbol> vectoriel de 40 × 40, utilisé partout par <use href="#ev-...">.

export type EventId = 'valentin' | 'paques' | 'saintjean' | 'canada' | 'halloween' | 'noel';

/** Tous les dessins (à inclure une fois dans la page). */
export const SPRITE = `
<symbol id="ev-pumpkin" viewBox="0 0 40 40"><rect x="18" y="3" width="4" height="8" rx="2" fill="#5f8a2e"/><ellipse cx="20" cy="24" rx="17" ry="14" fill="#f08a24"/><ellipse cx="12" cy="24" rx="7" ry="13" fill="#d9701a"/><ellipse cx="28" cy="24" rx="7" ry="13" fill="#d9701a"/><ellipse cx="20" cy="24" rx="7" ry="14" fill="#f5a03d"/><path d="M11 20l4 4-5 0z M29 20l-4 4 5 0z" fill="#2b1b0a"/><path d="M13 29q7 6 14 0q-3 1-4-2l-2 2l-2-2l-2 2q-1 1-4 0z" fill="#2b1b0a"/></symbol>
<symbol id="ev-ghost" viewBox="0 0 40 40"><path d="M6 36V18C6 9 12 4 20 4s14 5 14 14v18l-4-4-4 4-6-4-6 4-4-4z" fill="#f4f1ff"/><ellipse cx="15" cy="17" rx="2.6" ry="3.4" fill="#2a1838"/><ellipse cx="25" cy="17" rx="2.6" ry="3.4" fill="#2a1838"/><ellipse cx="20" cy="25" rx="3" ry="3.6" fill="#2a1838"/><circle cx="11" cy="23" r="2.4" fill="#ffb3c8"/><circle cx="29" cy="23" r="2.4" fill="#ffb3c8"/></symbol>
<symbol id="ev-bat" viewBox="0 0 40 40"><path d="M20 12c2 0 3 2 4 3 2-3 6-5 12-4-2 3-2 6-1 9-2-1-4-1-5 1-1-2-3-3-5-3l-2 6-2-6c-2 0-4 1-5 3-1-2-3-2-5-1 1-3 1-6-1-9 6-1 10 1 12 4 1-1 2-3 4-3z" fill="#6b3fa0"/><circle cx="18" cy="15" r="1.3" fill="#ffd54a"/><circle cx="22" cy="15" r="1.3" fill="#ffd54a"/></symbol>
<symbol id="ev-snowman" viewBox="0 0 40 40"><circle cx="20" cy="29" r="10" fill="#f4f8ff"/><circle cx="20" cy="15" r="7" fill="#f4f8ff"/><rect x="14" y="4" width="12" height="6" rx="1" fill="#2a2f45"/><rect x="11" y="9" width="18" height="2.5" rx="1" fill="#2a2f45"/><circle cx="17.5" cy="14" r="1.1" fill="#2a2f45"/><circle cx="22.5" cy="14" r="1.1" fill="#2a2f45"/><path d="M20 16l7 1.5-7 1.5z" fill="#f08a24"/><path d="M13 21q7 4 14 0l0 3q-7 4-14 0z" fill="#e04848"/><circle cx="20" cy="29" r="1.2" fill="#2a2f45"/><circle cx="20" cy="33" r="1.2" fill="#2a2f45"/></symbol>
<symbol id="ev-tree" viewBox="0 0 40 40"><rect x="17.5" y="31" width="5" height="6" fill="#7a4a24"/><path d="M20 6l9 11H11z M20 13l11 12H9z M20 21l13 12H7z" fill="#2f9e58"/><path d="M20 3l1.6 3.4 3.7.5-2.7 2.6.7 3.7L20 11.4l-3.3 1.8.7-3.7-2.7-2.6 3.7-.5z" fill="#ffd54a"/><circle cx="16" cy="19" r="1.8" fill="#e04848"/><circle cx="24" cy="26" r="1.8" fill="#4aa8ff"/><circle cx="14" cy="29" r="1.8" fill="#ffd54a"/><circle cx="26" cy="19" r="1.5" fill="#ffd54a"/></symbol>
<symbol id="ev-flake" viewBox="0 0 40 40"><g stroke="#cfe6ff" stroke-width="2.4" stroke-linecap="round" fill="none"><path d="M20 4v32M6 12l28 16M6 28l28-16"/><path d="M16 7l4 4 4-4M16 33l4-4 4 4"/></g></symbol>
<symbol id="ev-gift" viewBox="0 0 40 40"><rect x="6" y="17" width="28" height="18" rx="2" fill="#e04848"/><rect x="4" y="12" width="32" height="7" rx="2" fill="#f25f5f"/><rect x="18" y="12" width="4" height="23" fill="#ffd54a"/><path d="M20 12c-6-9-14-2-8 0M20 12c6-9 14-2 8 0" stroke="#ffd54a" stroke-width="3" fill="none" stroke-linecap="round"/></symbol>
<symbol id="ev-heart" viewBox="0 0 40 40"><path d="M20 35C8 26 4 19 4 13a8.5 8.5 0 0 1 16-3 8.5 8.5 0 0 1 16 3c0 6-4 13-16 22z" fill="#ff5c8a"/><path d="M10 12q1-4 5-4" stroke="#ffd1df" stroke-width="2.4" stroke-linecap="round" fill="none"/></symbol>
<symbol id="ev-heartface" viewBox="0 0 40 40"><path d="M20 36C8 27 4 20 4 14a8.5 8.5 0 0 1 16-3 8.5 8.5 0 0 1 16 3c0 6-4 13-16 22z" fill="#ff5c8a"/><path d="M10 12q1-4 5-4" stroke="#ffd1df" stroke-width="2.4" stroke-linecap="round" fill="none"/><ellipse cx="15.500" cy="20" rx="1.800" ry="2.400" fill="#4a1230"/><ellipse cx="24.500" cy="20" rx="1.800" ry="2.400" fill="#4a1230"/><path d="M17.500 24.500q2.500 2.500 5 0" stroke="#4a1230" stroke-width="1.600" fill="none" stroke-linecap="round"/><circle cx="12" cy="24" r="2.200" fill="#ff93b4"/><circle cx="28" cy="24" r="2.200" fill="#ff93b4"/></symbol>
<symbol id="ev-letter" viewBox="0 0 40 40"><rect x="5" y="9" width="30" height="22" rx="3" fill="#ffe3ec"/><path d="M5 12l15 11 15-11" stroke="#ff5c8a" stroke-width="2.2" fill="none" stroke-linejoin="round"/><path d="M20 21c-4-3-5-5-5-6.600a2.800 2.800 0 0 1 5-1 2.800 2.800 0 0 1 5 1c0 1.600-1 3.600-5 6.600z" fill="#ff5c8a"/></symbol>
<symbol id="ev-egg" viewBox="0 0 40 40"><ellipse cx="20" cy="23" rx="12.500" ry="15.500" fill="#ffd9ec"/><path d="M8.500 23q3-3 5.500 0t5.500 0 5.500 0 5.500 0" stroke="#ff8fb8" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M9.500 31q3-3 5.500 0t5.500 0 5.500 0 4.500-2" stroke="#8fd3ff" stroke-width="2.600" fill="none" stroke-linecap="round"/><circle cx="15" cy="15" r="2" fill="#8fd3ff"/><circle cx="24.500" cy="14" r="2" fill="#ffd54a"/><path d="M13 10q1-4 5-5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/></symbol>
<symbol id="ev-bunny" viewBox="0 0 40 40"><g stroke="#d9cdea" stroke-width="1"><ellipse cx="13" cy="11" rx="4.200" ry="10" fill="#fff"/><ellipse cx="27" cy="11" rx="4.200" ry="10" fill="#fff"/><circle cx="20" cy="26" r="12" fill="#fff"/></g><ellipse cx="13" cy="12" rx="2" ry="7" fill="#ffb3c8"/><ellipse cx="27" cy="12" rx="2" ry="7" fill="#ffb3c8"/><circle cx="15.500" cy="25" r="1.700" fill="#2a2f45"/><circle cx="24.500" cy="25" r="1.700" fill="#2a2f45"/><ellipse cx="20" cy="28.500" rx="2" ry="1.500" fill="#ff8fb8"/><path d="M20 30v2M17.500 32.500q2.500 2 5 0" stroke="#2a2f45" fill="none" stroke-width="1.200" stroke-linecap="round"/><circle cx="12.500" cy="29.500" r="2.200" fill="#ffc2d6"/><circle cx="27.500" cy="29.500" r="2.200" fill="#ffc2d6"/></symbol>
<symbol id="ev-chick" viewBox="0 0 40 40"><circle cx="20" cy="21" r="14" fill="#ffd93d"/><path d="M18 8q2-4 4 0" stroke="#f5c518" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="9.500" cy="24" rx="3" ry="5" fill="#f5c518"/><circle cx="15" cy="18" r="1.800" fill="#2a2f45"/><circle cx="25" cy="18" r="1.800" fill="#2a2f45"/><path d="M16.500 22.500l3.500 5 3.500-5z" fill="#ff9a3c"/><circle cx="12" cy="23" r="2" fill="#ffb3a0"/><circle cx="28" cy="23" r="2" fill="#ffb3a0"/><path d="M4 31l4-3 4 3 4-3 4 3 4-3 4 3 4-3 4 3v3c0 3-3 5-6 5H10c-3 0-6-2-6-5z" fill="#fff6e0"/></symbol>
<symbol id="ev-tulip" viewBox="0 0 40 40"><path d="M20 22v15" stroke="#3fa34d" stroke-width="3" stroke-linecap="round"/><path d="M20 34q-9-1-11-9 8 0 11 9z" fill="#4cc065"/><path d="M11 8l4 5 5-7 5 7 4-5-2 13a7 7 0 0 1-14 0z" fill="#ff6fa1"/><path d="M20 6l-3 8 3 9 3-9z" fill="#ff9cc0"/></symbol>
<symbol id="ev-lis" viewBox="0 0 40 40"><path d="M20.600 34.200C9.500 26.400 4.200 19.200 5.200 12.600 6 7.400 11.600 5.400 15.800 7.600 17.800 8.700 19.400 10.400 20 11.800 21.200 8.700 25 6.600 29 6.900 34 7.400 36.600 12.600 34.800 18.200 33 24.600 27 30 20.600 34.200Z" fill="#1550c0"/><g transform="translate(20.400 20.600) scale(.84) translate(-20.400 -20.600)" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"><path d="M20.600 34.200C9.500 26.400 4.200 19.200 5.200 12.600 6 7.400 11.600 5.400 15.800 7.600 17.800 8.700 19.400 10.400 20 11.800 21.200 8.700 25 6.600 29 6.900 34 7.400 36.600 12.600 34.800 18.200 33 24.600 27 30 20.600 34.200Z" stroke-width="1.100" stroke-dasharray="26 3 14 4 20 3 9 5"/></g><g transform="translate(20.400 20.600) scale(.77) translate(-20.400 -20.600)" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"><path d="M20.600 34.200C9.500 26.400 4.200 19.200 5.200 12.600 6 7.400 11.600 5.400 15.800 7.600 17.800 8.700 19.400 10.400 20 11.800 21.200 8.700 25 6.600 29 6.900 34 7.400 36.600 12.600 34.800 18.200 33 24.600 27 30 20.600 34.200Z" stroke-width=".55" stroke-dasharray="16 11 22 40" stroke-dashoffset="-30"/></g><g fill="#fff" transform="translate(20 21.500) scale(1.14) translate(-20 -21.500)"><path d="M20 12.200C22.600 15 23.400 18.600 21.700 22.300L21.700 24.200 18.300 24.200 18.300 22.300C16.600 18.600 17.400 15 20 12.200Z"/><path d="M18.400 22.100C16.300 19 12.200 19.300 10.900 22.400 10.100 24.600 11.400 26.700 13.600 26.700L14.700 25.200C13.500 25.200 12.900 24.100 13.600 23.200 14.800 21.800 16.700 22.500 18.400 24.100Z"/><path d="M21.600 22.100C23.700 19 27.800 19.300 29.100 22.400 29.900 24.600 28.600 26.700 26.400 26.700L25.300 25.200C26.500 25.200 27.100 24.100 26.400 23.200 25.200 21.800 23.300 22.500 21.600 24.100Z"/><rect x="15.400" y="25.500" width="9.200" height="1.800" rx=".4"/><path d="M18.600 27.500C19.200 28.800 19.500 30 20 31.400 20.500 30 20.800 28.800 21.400 27.500Z"/></g></symbol>
<symbol id="ev-flame" viewBox="0 0 40 40"><path d="M20 3C23 9 30 13 30 22c0 7-4.500 12-10 12S10 29 10 22c0-4 2-6 3.500-8 .5 3 2 4.500 3.500 5C16.500 12 18 7 20 3z" fill="#ff7a1a"/><path d="M20 17c2 3.500 5 5.500 5 10 0 3.500-2.500 6-5 6s-5-2.500-5-6c0-2 1-3.500 2-4.500.5 1.500 1.200 2.200 2 2.500 0-3 .5-5 1-8z" fill="#ffd54a"/><rect x="5" y="33" width="30" height="4" rx="2" fill="#7a4a24" transform="rotate(-5 20 35)"/><rect x="5" y="33" width="30" height="4" rx="2" fill="#92603a" transform="rotate(5 20 35)"/></symbol>
<symbol id="ev-leaf" viewBox="0 0 40 40"><path d="M20 3l3 6 5-2-1.500 8 6.500-2-2.500 7 5.500 1.500-8 6 1 2.500-7.500-1.500V37h-3v-7.500L11 31l1-2.500-8-6 5.500-1.500-2.500-7 6.500 2L12 7l5 2z" fill="#e53935"/><circle cx="16.500" cy="20" r="1.800" fill="#fff"/><circle cx="23.500" cy="20" r="1.800" fill="#fff"/><circle cx="16.800" cy="20.200" r=".9" fill="#4a1010"/><circle cx="23.800" cy="20.200" r=".9" fill="#4a1010"/><path d="M17.500 24q2.500 2.500 5 0" stroke="#7a1212" stroke-width="1.500" fill="none" stroke-linecap="round"/></symbol>
<symbol id="ev-firework" viewBox="0 0 40 40"><g stroke-linecap="round" stroke-width="2.800"><path d="M20 4v8" stroke="#ffd54a"/><path d="M20 28v8" stroke="#ffd54a"/><path d="M4 20h8" stroke="#ff5c8a"/><path d="M28 20h8" stroke="#ff5c8a"/><path d="M8.700 8.700l5.600 5.600" stroke="#4aa8ff"/><path d="M25.700 25.700l5.600 5.600" stroke="#4aa8ff"/><path d="M31.300 8.700l-5.600 5.600" stroke="#7bdc7b"/><path d="M14.300 25.700l-5.600 5.600" stroke="#7bdc7b"/></g><circle cx="20" cy="20" r="3.200" fill="#fff"/></symbol>
<symbol id="ev-sparkle" viewBox="0 0 40 40"><path d="M20 3l3.500 12.500L36 20l-12.500 4.500L20 37l-3.500-12.500L4 20l12.500-4.500z" fill="#ffd54a"/></symbol>
<symbol id="ev-ember" viewBox="0 0 40 40"><circle cx="20" cy="20" r="9" fill="#ff7a1a"/><circle cx="20" cy="20" r="5" fill="#ffd54a"/></symbol>
<symbol id="ev-star" viewBox="0 0 40 40"><path d="M20 4l4.500 10 10.500 1-8 7.500 2.500 10.500L20 27.500 10.500 33 13 22.500 5 15l10.500-1z" fill="#ffd54a"/></symbol>
<symbol id="ev-bulb" viewBox="0 0 40 40"><rect x="16" y="3" width="8" height="7" rx="1.500" fill="#59607a"/><ellipse cx="20" cy="23" rx="9" ry="13" fill="currentColor"/><ellipse cx="16" cy="18" rx="2.200" ry="4" fill="#fff" opacity=".55"/></symbol>
<symbol id="ev-flag" viewBox="0 0 40 40"><path d="M3 5h34L20 36z" fill="currentColor"/></symbol>
`;

export type ParticleKind = 'fall' | 'rise' | 'fly' | 'drift';
export interface ParticleSpec { sym: string; kind: ParticleKind; count: number; size: [number, number]; dur: [number, number] }

export interface EventArt {
  id: EventId;
  name: string;
  greeting: string;
  /** Personnage de l'en-tête (grand, qui se balance). */
  mascot: string;
  /** Petites icônes ajoutées devant les forums, dans le menu, etc. (utilisées à tour de rôle). */
  icons: string[];
  particles: ParticleSpec[];
  /** Éléments accrochés à la guirlande, à tour de rôle ; `color` colore les ampoules et fanions (symboles en currentColor). */
  garland: { sym: string; color?: string }[];
  /** Couleur de la ficelle de la guirlande. */
  string: string;
}

export const ART: Record<EventId, EventArt> = {
  halloween: {
    id: 'halloween', name: 'Halloween', greeting: 'Joyeuse Halloween !', mascot: 'ev-pumpkin', icons: ['ev-ghost', 'ev-pumpkin', 'ev-bat'], string: '#f08a24',
    particles: [{ sym: 'ev-bat', kind: 'fly', count: 4, size: [22, 32], dur: [14, 24] }, { sym: 'ev-ghost', kind: 'rise', count: 4, size: [20, 30], dur: [14, 22] }],
    garland: [{ sym: 'ev-bat' }, { sym: 'ev-pumpkin' }, { sym: 'ev-ghost' }, { sym: 'ev-pumpkin' }],
  },
  noel: {
    id: 'noel', name: 'Noël', greeting: 'Joyeux Noël !', mascot: 'ev-snowman', icons: ['ev-tree', 'ev-snowman', 'ev-gift'], string: '#5fbf7a',
    particles: [{ sym: 'ev-flake', kind: 'fall', count: 16, size: [12, 26], dur: [10, 20] }],
    garland: [{ sym: 'ev-bulb', color: '#e04848' }, { sym: 'ev-bulb', color: '#ffd54a' }, { sym: 'ev-bulb', color: '#4aa8ff' }, { sym: 'ev-bulb', color: '#2f9e58' }],
  },
  valentin: {
    id: 'valentin', name: 'Saint-Valentin', greeting: 'Joyeuse Saint-Valentin !', mascot: 'ev-heartface', icons: ['ev-heart', 'ev-letter', 'ev-heartface'], string: '#ff8fb8',
    particles: [{ sym: 'ev-heart', kind: 'rise', count: 12, size: [14, 28], dur: [10, 18] }],
    garland: [{ sym: 'ev-heart' }, { sym: 'ev-letter' }],
  },
  paques: {
    id: 'paques', name: 'Pâques', greeting: 'Joyeuses Pâques !', mascot: 'ev-bunny', icons: ['ev-egg', 'ev-chick', 'ev-tulip'], string: '#c084fc',
    particles: [{ sym: 'ev-egg', kind: 'fall', count: 8, size: [18, 28], dur: [14, 24] }, { sym: 'ev-tulip', kind: 'fall', count: 6, size: [18, 28], dur: [16, 26] }],
    garland: [{ sym: 'ev-egg' }, { sym: 'ev-tulip' }, { sym: 'ev-chick' }],
  },
  saintjean: {
    id: 'saintjean', name: 'Saint-Jean-Baptiste', greeting: 'Bonne fête nationale !', mascot: 'ev-lis', icons: ['ev-lis', 'ev-flame', 'ev-star'], string: '#93c5fd',
    particles: [{ sym: 'ev-ember', kind: 'rise', count: 14, size: [8, 14], dur: [8, 14] }, { sym: 'ev-lis', kind: 'fall', count: 4, size: [18, 26], dur: [16, 24] }],
    garland: [{ sym: 'ev-flag', color: '#1f5fbf' }, { sym: 'ev-flag', color: '#f1f5ff' }],
  },
  canada: {
    id: 'canada', name: 'Fête du Canada', greeting: 'Bonne fête du Canada !', mascot: 'ev-leaf', icons: ['ev-leaf', 'ev-firework', 'ev-leaf'], string: '#fda4af',
    particles: [{ sym: 'ev-leaf', kind: 'fall', count: 10, size: [18, 30], dur: [12, 22] }, { sym: 'ev-sparkle', kind: 'drift', count: 6, size: [12, 20], dur: [8, 14] }],
    garland: [{ sym: 'ev-flag', color: '#e53935' }, { sym: 'ev-flag', color: '#f8fafc' }],
  },
};

export const EVENT_LIST: EventArt[] = ['valentin', 'paques', 'saintjean', 'canada', 'halloween', 'noel'].map((id) => ART[id as EventId]);

// ------------------------------------------------------------------ préférences du membre (cet appareil)

export type EventMode = 'full' | 'static' | 'off';
export const MODE_KEY = 'seeduction-event-mode';
export const COLORS_KEY = 'seeduction-event-colors';

export function readMode(): EventMode {
  try { const v = localStorage.getItem(MODE_KEY); return v === 'static' || v === 'off' ? v : 'full'; } catch { return 'full'; }
}
export function readColors(): boolean {
  try { return localStorage.getItem(COLORS_KEY) !== '0'; } catch { return true; }
}
