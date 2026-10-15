// Habillages des machines à sous : la même mécanique (voir backend/src/common/utils/slots.ts), six décors.
// Chaque symbole est un petit dessin vectoriel de 64 × 64. Ordre des huit symboles : 0 = le plus rare et le plus payant ... 5 = le plus courant, 6 = joker, 7 = bonus.

import { ART, type EventId } from './eventArt';

export type MachineId = 'cinema' | 'or' | 'hockey' | 'erable' | 'saison' | 'pirate';

export interface Skin {
  id: MachineId;
  name: string;
  tagline: string;
  icon: string;
  /** Couleurs : fond de la machine, cadre, accent, fond des rouleaux, lueur. */
  vars: Record<string, string>;
  /** Noms des huit symboles (pour la table des gains). */
  names: string[];
  /** Dessins SVG (contenu intérieur d'un <svg viewBox="0 0 64 64">). */
  art: string[];
  /** Pluie de particules lors d'un gros gain. */
  rain: string[];
}

let uid = 0;
/** Dégradé vertical ou diagonal ; les identifiants sont uniques pour ne jamais se mélanger d'un dessin à l'autre. */
function g(a: string, b: string, diag = false): { def: string; ref: string } {
  const id = `sg${++uid}`;
  return { def: `<linearGradient id="${id}" x1="0" y1="0" x2="${diag ? 1 : 0}" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`, ref: `url(#${id})` };
}
const art = (build: (grad: typeof g) => string): string => build(g);

const RIBBON = (label: string, color = '#d9382f') =>
  `<g><rect x="6" y="48" width="52" height="13" rx="3" fill="${color}" stroke="#fff6c8" stroke-width="1.5"/><text x="32" y="58.2" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="10" fill="#fff6c8" letter-spacing="1">${label}</text></g>`;

const GOLD: [string, string] = ['#fff0a0', '#c98a10'];

// ------------------------------------------------------------------ Cinéma
const cinema: string[] = [
  art((G) => { const a = G(...GOLD); return `<defs>${a.def}</defs><path d="M32 4l8.5 17.5 19 2.8-13.8 13.5 3.3 19L32 47.6 15 56.8l3.3-19L4.5 24.3l19-2.8z" fill="${a.ref}" stroke="#8a5600" stroke-width="2" stroke-linejoin="round"/><path d="M32 11l5 10.5-5 2z" fill="#fff9d8" opacity=".7"/>`; }),
  art((G) => { const a = G('#3a3a44', '#14141a'); return `<defs>${a.def}</defs><rect x="7" y="26" width="50" height="30" rx="3" fill="${a.ref}" stroke="#000" stroke-width="2"/><g transform="rotate(-9 8 25)"><rect x="7" y="13" width="50" height="11" rx="2" fill="#16161c" stroke="#000" stroke-width="2"/><path d="M14 13l-6 11h8l6-11zM30 13l-6 11h8l6-11zM46 13l-6 11h8l6-11z" fill="#fff"/></g><path d="M12 34h40M12 41h28M12 48h34" stroke="#c9c9d4" stroke-width="2.5" stroke-linecap="round"/>`; }),
  art((G) => { const a = G('#8a8a99', '#32323c'); return `<defs>${a.def}</defs><circle cx="32" cy="32" r="26" fill="${a.ref}" stroke="#111" stroke-width="2.5"/><circle cx="32" cy="32" r="5" fill="#d8d8e2" stroke="#111" stroke-width="1.5"/>${[0, 72, 144, 216, 288].map((d) => `<circle cx="${32 + 15 * Math.cos(((d - 90) * Math.PI) / 180)}" cy="${32 + 15 * Math.sin(((d - 90) * Math.PI) / 180)}" r="6" fill="#0d0d12"/>`).join('')}<circle cx="32" cy="32" r="26" fill="none" stroke="#e6c24a" stroke-width="1.5" stroke-dasharray="3 3"/>`; }),
  art((G) => { const a = G('#ff5a4a', '#b5231a'); return `<defs>${a.def}</defs><g fill="#fff4d6" stroke="#e0b866" stroke-width="1.2"><circle cx="22" cy="16" r="7"/><circle cx="32" cy="12" r="8"/><circle cx="43" cy="16" r="7"/><circle cx="27" cy="22" r="7"/><circle cx="38" cy="22" r="7"/></g><path d="M12 24h40l-5 34H17z" fill="#fff" stroke="#8c1d14" stroke-width="2"/><path d="M19 24l2 34M28 24v34M37 24l-1 34M45 24l-3 34" stroke="${a.ref}" stroke-width="5"/><rect x="10" y="22" width="44" height="5" rx="2" fill="#b5231a"/>`; }),
  art((G) => { const a = G('#ffd75e', '#d98a1c'); return `<defs>${a.def}</defs><g transform="rotate(-12 32 32)"><path d="M6 18h52v10a4 4 0 0 0 0 8v10H6V36a4 4 0 0 0 0-8z" fill="${a.ref}" stroke="#7a4a00" stroke-width="2" stroke-linejoin="round"/><path d="M40 18v28" stroke="#7a4a00" stroke-width="2" stroke-dasharray="3 3"/><path d="M12 27h22M12 33h18M12 39h22" stroke="#7a4a00" stroke-width="2.5" stroke-linecap="round"/></g>`; }),
  art(() => `<g fill="none" stroke="#1b1b22" stroke-width="3.5" stroke-linejoin="round"><rect x="5" y="22" width="24" height="18" rx="4" fill="#ff4b4b" fill-opacity=".85"/><rect x="35" y="22" width="24" height="18" rx="4" fill="#33d6ff" fill-opacity=".85"/><path d="M29 29h6M5 28L2 20M59 28l3-8"/></g><path d="M9 26l8 4M39 26l8 4" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>`),
  art((G) => { const a = G('#5b5b6b', '#25252d'); return `<defs>${a.def}</defs><circle cx="20" cy="14" r="8" fill="${a.ref}" stroke="#000" stroke-width="2"/><circle cx="38" cy="14" r="8" fill="${a.ref}" stroke="#000" stroke-width="2"/><rect x="8" y="22" width="36" height="24" rx="3" fill="${a.ref}" stroke="#000" stroke-width="2"/><path d="M44 28l12-7v22l-12-7z" fill="#a8a8b8" stroke="#000" stroke-width="2" stroke-linejoin="round"/><circle cx="26" cy="34" r="7" fill="#162033" stroke="#e6c24a" stroke-width="2"/><circle cx="24" cy="32" r="2" fill="#fff" opacity=".8"/>${RIBBON('WILD')}`; }),
  art((G) => { const a = G('#e24a4a', '#8b1313'); return `<defs>${a.def}</defs><rect x="4" y="4" width="56" height="44" rx="4" fill="${a.ref}" stroke="#4a0a0a" stroke-width="2"/><path d="M16 4c4 14 2 30-4 44M32 4c0 14 0 30 0 44M48 4c-4 14-2 30 4 44" stroke="#6a0e0e" stroke-width="3" fill="none"/><rect x="2" y="2" width="60" height="7" rx="2" fill="#e6c24a" stroke="#8a5a00" stroke-width="1.5"/><circle cx="32" cy="30" r="9" fill="#fff6c8" opacity=".85"/><path d="M32 23l2.4 5 5.3.7-3.9 3.7 1 5.3L32 35.2l-4.8 2.5 1-5.3-3.9-3.7 5.3-.7z" fill="#e6a010"/>${RIBBON('BONUS', '#3a1ba8')}`; }),
];

// ------------------------------------------------------------------ Seeduction Or
const or: string[] = [
  art((G) => { const a = G(...GOLD); return `<defs>${a.def}</defs><path d="M32 4c5 8 9 12 9 19 0 5-4 8-9 8s-9-3-9-8c0-7 4-11 9-19z" fill="${a.ref}" stroke="#8a5600" stroke-width="2" stroke-linejoin="round"/><path d="M23 28c-8-6-16-2-16 6 0 7 8 9 13 5-4 6-10 7-10 12h12c0-4 2-6 2-12zM41 28c8-6 16-2 16 6 0 7-8 9-13 5 4 6 10 7 10 12H42c0-4-2-6-2-12z" fill="${a.ref}" stroke="#8a5600" stroke-width="2" stroke-linejoin="round"/><rect x="22" y="48" width="20" height="6" rx="2" fill="${a.ref}" stroke="#8a5600" stroke-width="2"/>`; }),
  art((G) => { const a = G(...GOLD); return `<defs>${a.def}</defs><path d="M6 48V20l13 12 13-20 13 20 13-12v28z" fill="${a.ref}" stroke="#8a5600" stroke-width="2" stroke-linejoin="round"/><rect x="6" y="48" width="52" height="8" rx="2" fill="${a.ref}" stroke="#8a5600" stroke-width="2"/><circle cx="32" cy="38" r="4" fill="#e24a6a" stroke="#6a1020" stroke-width="1.2"/><circle cx="16" cy="40" r="3" fill="#38c6a0"/><circle cx="48" cy="40" r="3" fill="#38c6a0"/>`; }),
  art((G) => { const a = G('#bdf3ff', '#1c8fd0'); return `<defs>${a.def}</defs><path d="M16 14h32l12 14-28 30L4 28z" fill="${a.ref}" stroke="#0c4a72" stroke-width="2" stroke-linejoin="round"/><path d="M4 28h56M24 14l-6 14 14 30M40 14l6 14-14 30M16 14l8 14M48 14l-8 14" stroke="#e8fbff" stroke-width="1.5" fill="none" opacity=".85"/>`; }),
  art((G) => { const a = G(...GOLD); return `<defs>${a.def}</defs><circle cx="32" cy="32" r="26" fill="${a.ref}" stroke="#8a5600" stroke-width="2.5"/><circle cx="32" cy="32" r="19" fill="none" stroke="#a86c0a" stroke-width="2"/><path d="M32 18c3 5 5 7 5 10 0 3-2 5-5 5s-5-2-5-5c0-3 2-5 5-10zM27 34c-4-2-7 0-7 4 0 3 3 4 6 3-2 3-5 4-5 6h12c0-3 1-5 1-9z" fill="#a86c0a" opacity=".85"/>`; }),
  art((G) => { const a = G('#8be36e', '#2d8a2a'); return `<defs>${a.def}</defs><path d="M32 56V30" stroke="#2d6a22" stroke-width="4" stroke-linecap="round"/><path d="M32 34C18 34 10 26 10 14c13 0 22 6 22 20z" fill="${a.ref}" stroke="#1f5a1a" stroke-width="2" stroke-linejoin="round"/><path d="M32 28c0-12 8-20 22-20 0 12-8 20-22 20z" fill="${a.ref}" stroke="#1f5a1a" stroke-width="2" stroke-linejoin="round"/><ellipse cx="32" cy="56" rx="14" ry="5" fill="#7a4a24"/>`; }),
  art((G) => { const a = G('#a7f08c', '#2f9a3a'); return `<defs>${a.def}</defs><g fill="${a.ref}" stroke="#1f6a28" stroke-width="2"><circle cx="22" cy="22" r="11"/><circle cx="42" cy="22" r="11"/><circle cx="22" cy="42" r="11"/><circle cx="42" cy="42" r="11"/></g><path d="M32 32L46 58" stroke="#1f6a28" stroke-width="4" stroke-linecap="round"/>`; }),
  art((G) => { const a = G(...GOLD); return `<defs>${a.def}</defs><circle cx="32" cy="26" r="21" fill="${a.ref}" stroke="#8a5600" stroke-width="2.5"/><circle cx="32" cy="26" r="15" fill="#2b1a5c" stroke="#8a5600" stroke-width="1.5"/><path d="M32 14c3 4 5 6 5 9 0 3-2 5-5 5s-5-2-5-5c0-3 2-5 5-9zM27 29c-3-2-6 0-6 3 0 3 3 4 6 3-1 2-4 3-4 5h10c0-3 1-4 1-8z" fill="${a.ref}"/>${RIBBON('WILD', '#6a2bd0')}`; }),
  art((G) => { const a = G('#c98a3a', '#6a3a12'); const b = G(...GOLD); return `<defs>${a.def}${b.def}</defs><path d="M6 30c0-14 12-22 26-22s26 8 26 22z" fill="${a.ref}" stroke="#3a1c06" stroke-width="2"/><rect x="6" y="28" width="52" height="20" rx="3" fill="${a.ref}" stroke="#3a1c06" stroke-width="2"/><path d="M6 36h52" stroke="${b.ref}" stroke-width="4"/><rect x="26" y="30" width="12" height="12" rx="2" fill="${b.ref}" stroke="#7a4a00" stroke-width="1.5"/><circle cx="32" cy="36" r="2" fill="#7a4a00"/>${RIBBON('BONUS', '#3a1ba8')}`; }),
];

// ------------------------------------------------------------------ Hockey
const hockey: string[] = [
  art((G) => { const a = G(...GOLD); return `<defs>${a.def}</defs><path d="M16 6h32v18c0 9-7 15-16 15S16 33 16 24z" fill="${a.ref}" stroke="#8a5600" stroke-width="2" stroke-linejoin="round"/><path d="M16 10H6c0 10 4 15 11 17M48 10h10c0 10-4 15-11 17" fill="none" stroke="#8a5600" stroke-width="3" stroke-linecap="round"/><rect x="29" y="38" width="6" height="10" fill="${a.ref}" stroke="#8a5600" stroke-width="1.5"/><rect x="20" y="48" width="24" height="8" rx="2" fill="${a.ref}" stroke="#8a5600" stroke-width="2"/>`; }),
  art(() => `<path d="M8 54V18c0-6 6-10 24-10s24 4 24 10v36" fill="#dfe6f5" fill-opacity=".6" stroke="#3a4a6a" stroke-width="4" stroke-linejoin="round"/><path d="M12 22h40M12 30h40M12 38h40M12 46h40M18 16v38M26 14v40M34 14v40M42 14v40M50 16v38" stroke="#6a7a9a" stroke-width="1.4" opacity=".8"/><rect x="6" y="52" width="52" height="5" rx="2" fill="#d9382f"/>`),
  art((G) => { const a = G('#9fb4d8', '#4a5f8a'); return `<defs>${a.def}</defs><path d="M8 14h22v20h22l4 14H8z" fill="${a.ref}" stroke="#2a3040" stroke-width="2" stroke-linejoin="round"/><path d="M6 54h54" stroke="#6a7a9a" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="22" r="2" fill="#fff"/><circle cx="16" cy="30" r="2" fill="#fff"/>`; }),
  art((G) => { const a = G('#d9a76a', '#8a5a26'); return `<defs>${a.def}</defs><path d="M14 4l10 0 4 36 26 10c3 1 4 4 3 7l-2 3H20c-4 0-6-3-6-6z" fill="${a.ref}" stroke="#4a2c0a" stroke-width="2" stroke-linejoin="round"/><path d="M18 46h34" stroke="#f4f4fa" stroke-width="3" opacity=".85"/>`; }),
  art((G) => { const a = G('#4a8cff', '#1a3fa0'); return `<defs>${a.def}</defs><path d="M8 34C8 16 18 6 32 6s24 10 24 28v8c0 4-3 6-6 6H14c-3 0-6-2-6-6z" fill="${a.ref}" stroke="#0a1a50" stroke-width="2.5" stroke-linejoin="round"/><path d="M16 34h32v12H16z" fill="#0d1840" opacity=".55"/><path d="M20 38h24M20 43h24" stroke="#cfe0ff" stroke-width="1.5"/><path d="M26 10c2 6 2 14 0 20" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5" fill="none"/>`; }),
  art((G) => { const a = G('#4a4a56', '#101015'); return `<defs>${a.def}</defs><ellipse cx="32" cy="42" rx="24" ry="10" fill="#08080c"/><path d="M8 28v14c0 6 11 10 24 10s24-4 24-10V28z" fill="${a.ref}" stroke="#000" stroke-width="2"/><ellipse cx="32" cy="28" rx="24" ry="10" fill="#33333d" stroke="#000" stroke-width="2"/><ellipse cx="32" cy="27" rx="17" ry="6" fill="none" stroke="#6a6a78" stroke-width="1.5"/>`; }),
  art((G) => { const a = G('#f6f6fa', '#aab2c6'); return `<defs>${a.def}</defs><path d="M10 28C10 14 20 6 32 6s22 8 22 22v14c0 8-6 14-12 14H22c-6 0-12-6-12-14z" fill="${a.ref}" stroke="#2a3040" stroke-width="2.5"/><path d="M20 24h24v22H20z" fill="#1a2030" stroke="#2a3040" stroke-width="2"/><path d="M26 24v22M32 24v22M38 24v22M20 32h24M20 40h24" stroke="#cfd6e6" stroke-width="1.5"/>${RIBBON('WILD', '#2a5fd0')}`; }),
  art((G) => { const a = G('#ff6a5a', '#b3151a'); return `<defs>${a.def}</defs><rect x="22" y="40" width="20" height="10" rx="2" fill="#2a2a34" stroke="#000" stroke-width="2"/><path d="M20 40V26c0-8 5-14 12-14s12 6 12 14v14z" fill="${a.ref}" stroke="#4a0a0a" stroke-width="2.5" stroke-linejoin="round"/><path d="M26 18c2-3 5-4 8-3" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6" fill="none"/><path d="M8 20l8 4M8 32h8M56 20l-8 4M56 32h-8M14 8l7 8M50 8l-7 8" stroke="#ffd24a" stroke-width="3" stroke-linecap="round"/>${RIBBON('BONUS', '#b3151a')}`; }),
];

// ------------------------------------------------------------------ Érable / Québec
const erable: string[] = [
  art((G) => { const a = G('#ff6a5a', '#b3151a'); return `<defs>${a.def}</defs><path d="M32 4l5 11 7-3-3 14 9-5-3 9 8 3-12 9 2 8-10-1v10h-6V49l-10 1 2-8-12-9 8-3-3-9 9 5-3-14 7 3z" fill="${a.ref}" stroke="#6a0a0a" stroke-width="2" stroke-linejoin="round"/>`; }),
  art((G) => { const a = G('#b98a5a', '#6a4426'); return `<defs>${a.def}</defs><path d="M8 10l10 8M56 10L46 18" stroke="#6a4426" stroke-width="4" stroke-linecap="round"/><path d="M4 8c6-2 10 2 12 8M60 8c-6-2-10 2-12 8" fill="none" stroke="#6a4426" stroke-width="4" stroke-linecap="round"/><path d="M18 18c0-4 5-6 14-6s14 2 14 6l3 20c0 6-5 10-17 10S15 44 15 38z" fill="${a.ref}" stroke="#2a1608" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="32" cy="42" rx="9" ry="7" fill="#8a5a36" stroke="#2a1608" stroke-width="2"/><circle cx="24" cy="30" r="2.5" fill="#1a0e04"/><circle cx="40" cy="30" r="2.5" fill="#1a0e04"/><circle cx="29" cy="42" r="1.5" fill="#1a0e04"/><circle cx="35" cy="42" r="1.5" fill="#1a0e04"/>`; }),
  art((G) => { const a = G('#f2d49a', '#b98a46'); const b = G('#a85a22', '#6a3010'); return `<defs>${a.def}${b.def}</defs><path d="M6 28h52c0 14-10 26-26 26S6 42 6 28z" fill="#e9ecf2" stroke="#4a4a56" stroke-width="2.5"/><path d="M10 28c0-8 10-12 22-12s22 4 22 12z" fill="${b.ref}" stroke="#3a1c06" stroke-width="2"/><g fill="${a.ref}" stroke="#8a5a1c" stroke-width="1.5"><rect x="16" y="14" width="8" height="8" rx="2"/><rect x="30" y="11" width="8" height="8" rx="2"/><rect x="42" y="15" width="8" height="8" rx="2"/></g><path d="M20 22c-2 3-1 5 1 4M36 20c-2 3-1 5 1 4" stroke="#fff4c8" stroke-width="2.5" fill="none" stroke-linecap="round"/>`; }),
  art((G) => { const a = G('#f0b050', '#a85a14'); return `<defs>${a.def}</defs><rect x="25" y="4" width="14" height="8" rx="2" fill="#6a3a12" stroke="#2a1608" stroke-width="2"/><path d="M26 12h12v6c8 4 12 8 12 16v18c0 4-3 6-6 6H20c-3 0-6-2-6-6V34c0-8 4-12 12-16z" fill="${a.ref}" stroke="#4a2808" stroke-width="2.5" stroke-linejoin="round"/><rect x="20" y="32" width="24" height="14" rx="3" fill="#fff4d6" stroke="#4a2808" stroke-width="1.5"/><path d="M32 34c3 3 4 4 4 6s-2 3-4 3-4-1-4-3 1-3 4-6z" fill="#d9382f"/>`; }),
  art((G) => { const a = G('#e24a4a', '#9a1414'); return `<defs>${a.def}</defs><path d="M10 40C10 20 18 10 32 10s22 10 22 30z" fill="${a.ref}" stroke="#4a0a0a" stroke-width="2.5" stroke-linejoin="round"/><rect x="8" y="38" width="48" height="12" rx="6" fill="#f6f6fa" stroke="#9aa0b4" stroke-width="2"/><path d="M14 44h36M16 40h32M16 48h32" stroke="#cfd4e4" stroke-width="2" opacity=".8"/><circle cx="32" cy="8" r="6" fill="#f6f6fa" stroke="#9aa0b4" stroke-width="2"/><path d="M26 22l12 8M24 28l14 8" stroke="#fff" stroke-width="3" opacity=".35"/>`; }),
  art(() => `<g stroke="#bfe4ff" stroke-width="4" stroke-linecap="round" fill="none"><path d="M32 6v52M8.5 19.5l47 25M8.5 44.5l47-25"/><path d="M26 10l6 5 6-5M26 54l6-5 6 5M5 27l8 1-2 8M59 37l-8-1 2-8M5 37l8-1-2-8M59 27l-8 1 2 8"/></g><circle cx="32" cy="32" r="4" fill="#e9f6ff"/>`),
  art((G) => { const a = G('#ff6a5a', '#b3151a'); return `<defs>${a.def}</defs><rect x="4" y="12" width="56" height="30" rx="3" fill="#fff" stroke="#9aa0b4" stroke-width="2"/><rect x="4" y="12" width="14" height="30" fill="${a.ref}"/><rect x="46" y="12" width="14" height="30" fill="${a.ref}"/><path d="M32 16l3 6 4-2-2 8 5-3-2 5 5 2-7 5 1 5-7-1v6h-1v-6l-7 1 1-5-7-5 5-2-2-5 5 3-2-8 4 2z" fill="${a.ref}"/>${RIBBON('WILD', '#1a4fb5')}`; }),
  art((G) => { const a = G('#c98a52', '#6a3a1a'); return `<defs>${a.def}</defs><path d="M6 30L32 8l26 22z" fill="#a8342a" stroke="#4a0a0a" stroke-width="2.5" stroke-linejoin="round"/><rect x="10" y="30" width="44" height="18" fill="${a.ref}" stroke="#2a1608" stroke-width="2.5"/><rect x="26" y="34" width="12" height="14" fill="#2a1608"/><rect x="14" y="34" width="8" height="8" fill="#ffd27a"/><rect x="42" y="34" width="8" height="8" fill="#ffd27a"/><path d="M44 8v8h6V9z" fill="#6a3a1a"/>${RIBBON('BONUS', '#8a5a1c')}`; }),
];

// ------------------------------------------------------------------ Pirates
const pirate: string[] = [
  art((G) => { const a = G('#c98a3a', '#6a3a12'); const b = G(...GOLD); return `<defs>${a.def}${b.def}</defs><path d="M6 28c0-12 11-20 26-20s26 8 26 20z" fill="${a.ref}" stroke="#2a1608" stroke-width="2.5" stroke-linejoin="round"/><rect x="6" y="28" width="52" height="24" rx="3" fill="${a.ref}" stroke="#2a1608" stroke-width="2.5"/><path d="M6 36h52M20 8v44M44 8v44" stroke="#2a1608" stroke-width="3"/><rect x="26" y="30" width="12" height="14" rx="2" fill="${b.ref}" stroke="#7a4a00" stroke-width="2"/><circle cx="32" cy="37" r="2.5" fill="#7a4a00"/><path d="M12 24l5 6M48 24l-5 6" stroke="${b.ref}" stroke-width="3" opacity=".8"/>`; }),
  art(() => `<path d="M10 28C10 14 20 6 32 6s22 8 22 22c0 6-3 10-7 13v7H17v-7c-4-3-7-7-7-13z" fill="#f2f2f6" stroke="#2a2a34" stroke-width="2.5"/><circle cx="23" cy="28" r="6" fill="#14141a"/><circle cx="41" cy="28" r="6" fill="#14141a"/><path d="M32 33l-3 6h6z" fill="#14141a"/><path d="M23 48v5M29 48v5M35 48v5M41 48v5" stroke="#2a2a34" stroke-width="2.5"/><path d="M6 54l52-8M6 46l52 8" stroke="#e8e8ee" stroke-width="4" stroke-linecap="round"/><path d="M6 54l52-8M6 46l52 8" stroke="#2a2a34" stroke-width="1.2" stroke-linecap="round"/>`),
  art((G) => { const a = G('#b9803e', '#5a3412'); return `<defs>${a.def}</defs><path d="M30 6v34" stroke="#3a2008" stroke-width="3"/><path d="M30 8c14 2 20 14 20 26H30z" fill="#fbf2dc" stroke="#7a5a2a" stroke-width="2" stroke-linejoin="round"/><path d="M28 14C16 16 10 26 10 36h18z" fill="#f4e8c8" stroke="#7a5a2a" stroke-width="2" stroke-linejoin="round"/><path d="M6 42h52l-8 12H14z" fill="${a.ref}" stroke="#2a1608" stroke-width="2.5" stroke-linejoin="round"/><path d="M30 6l9 4-9 4z" fill="#d9382f"/>`; }),
  art((G) => { const a = G('#cfd6e6', '#6a7388'); return `<defs>${a.def}</defs><circle cx="32" cy="12" r="6" fill="none" stroke="#3a4258" stroke-width="3.5"/><path d="M32 18v36M20 28h24" stroke="#3a4258" stroke-width="4" stroke-linecap="round"/><path d="M10 40c2 12 12 16 22 16s20-4 22-16" fill="none" stroke="#3a4258" stroke-width="4.5" stroke-linecap="round"/><path d="M6 44l6-8 4 10M58 44l-6-8-4 10" fill="#3a4258"/><path d="M32 18v36" stroke="${a.ref}" stroke-width="1.5" opacity=".9"/>`; }),
  art((G) => { const a = G('#ff5a4a', '#b3151a'); const b = G('#4aa0ff', '#1a4fb5'); return `<defs>${a.def}${b.def}</defs><path d="M40 8c10 2 14 10 10 20-2 6-6 10-6 18l-10 4c-6-10-6-20-4-28 2-8 4-14 10-14z" fill="${a.ref}" stroke="#4a0a0a" stroke-width="2.5" stroke-linejoin="round"/><path d="M34 40c-8 4-16 8-20 20 12-2 20-6 24-14z" fill="${b.ref}" stroke="#0a1a50" stroke-width="2" stroke-linejoin="round"/><path d="M48 14l10 6-10 4z" fill="#ffd24a" stroke="#7a5a00" stroke-width="1.5"/><circle cx="43" cy="17" r="3" fill="#fff"/><circle cx="44" cy="17.5" r="1.4" fill="#111"/>`; }),
  art((G) => { const a = G(...GOLD); return `<defs>${a.def}</defs><circle cx="32" cy="32" r="26" fill="#2a3a6a" stroke="${a.ref}" stroke-width="4"/><circle cx="32" cy="32" r="20" fill="#f4e8c8" stroke="#8a5a1c" stroke-width="1.5"/><path d="M32 12l5 20-5 20-5-20z" fill="#d9382f" stroke="#6a0a0a" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 32l20-5 20 5-20 5z" fill="#f6f6fa" stroke="#6a7388" stroke-width="1.5" stroke-linejoin="round"/><circle cx="32" cy="32" r="3" fill="${a.ref}" stroke="#8a5a1c"/>`; }),
  art((G) => { const a = G('#2a2a34', '#0f0f14'); return `<defs>${a.def}</defs><path d="M4 38c4-8 10-14 28-14s24 6 28 14c-6 2-10-2-14-2-6 0-10 4-14 4s-8-4-14-4c-4 0-8 4-14 2z" fill="${a.ref}" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/><path d="M14 26c0-12 8-20 18-20s18 8 18 20c-6-3-12-4-18-4s-12 1-18 4z" fill="${a.ref}" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/><circle cx="32" cy="15" r="4" fill="#f2f2f6"/><path d="M30 13l4 4M34 13l-4 4" stroke="#14141a" stroke-width="1.2"/>${RIBBON('WILD', '#7a1fb5')}`; }),
  art((G) => { const a = G('#f2d49a', '#b98a46'); return `<defs>${a.def}</defs><path d="M6 8l16 4 18-4 18 4v44l-18-4-18 4-16-4z" fill="${a.ref}" stroke="#5a3a12" stroke-width="2.5" stroke-linejoin="round"/><path d="M22 12v44M40 8v44" stroke="#8a6a2a" stroke-width="1.5" stroke-dasharray="3 3"/><path d="M26 22l12 12M38 22L26 34" stroke="#d9382f" stroke-width="5" stroke-linecap="round"/><path d="M10 40c6-6 10 2 16-2" fill="none" stroke="#6a4a22" stroke-width="2" stroke-dasharray="2 3"/>${RIBBON('BONUS', '#3a1ba8')}`; }),
];

// ------------------------------------------------------------------ Saisonnière (images de l'événement en cours)
const SEASON_SYMBOLS: Record<EventId, string[]> = {
  halloween: ['ev-pumpkin', 'ev-ghost', 'ev-bat', 'ev-flame', 'ev-ember', 'ev-sparkle', 'ev-star', 'ev-firework'],
  noel: ['ev-tree', 'ev-snowman', 'ev-gift', 'ev-bulb', 'ev-star', 'ev-flake', 'ev-sparkle', 'ev-popper'],
  valentin: ['ev-heartface', 'ev-heart', 'ev-letter', 'ev-sparkle', 'ev-bulb', 'ev-balloon', 'ev-star', 'ev-champagne'],
  paques: ['ev-bunny', 'ev-chick', 'ev-egg', 'ev-tulip', 'ev-leaf', 'ev-sparkle', 'ev-star', 'ev-balloon'],
  saintjean: ['ev-lis', 'ev-flame', 'ev-star', 'ev-ember', 'ev-firework', 'ev-sparkle', 'ev-flag', 'ev-popper'],
  canada: ['ev-canada', 'ev-leaf', 'ev-firework', 'ev-flag', 'ev-star', 'ev-sparkle', 'ev-balloon', 'ev-popper'],
  nouvelan: ['ev-clock', 'ev-champagne', 'ev-popper', 'ev-firework', 'ev-balloon', 'ev-confetti', 'ev-star', 'ev-sparkle'],
};

/** Habillage de la machine saisonnière pour un événement : les dessins viennent du décor de l'événement (<use href="#ev-...">). */
export function seasonArt(event: EventId): string[] {
  return SEASON_SYMBOLS[event].map((sym, i) => `<use href="#${sym}" width="64" height="64"/>${i === 6 ? RIBBON('WILD', '#6a2bd0') : i === 7 ? RIBBON('BONUS', '#3a1ba8') : ''}`);
}

/** Couleurs par événement : fond de la machine, accent et fond des rouleaux (sombre : les dessins de fête sont clairs). */
export const SEASON_COLORS: Record<EventId, [string, string, string]> = {
  halloween: ['#2a1238', '#f08a24', '#33214d'], noel: ['#0f2a1c', '#d9382f', '#1d3a56'], valentin: ['#3a0f26', '#ff6aa0', '#4a1a3a'], paques: ['#26204a', '#c084fc', '#3a3470'],
  saintjean: ['#0f1f4a', '#6aa0ff', '#1a2f6a'], canada: ['#3a0f14', '#ff5a5a', '#4a1a22'], nouvelan: ['#1a1440', '#fbbf24', '#2a2060'],
};

export const SKINS: Record<MachineId, Skin> = {
  cinema: {
    id: 'cinema', name: 'Grand Écran', tagline: 'Lumières, caméra, jackpot !', icon: '🎬',
    vars: { '--sl-bg': 'linear-gradient(160deg,#3a0a12,#12060a)', '--sl-frame': '#e6b84a', '--sl-accent': '#ff4b4b', '--sl-reel': '#fff7e6', '--sl-glow': '#ffd24a' },
    names: ['Étoile d\'or', 'Clap', 'Bobine', 'Pop-corn', 'Billet', 'Lunettes 3D', 'Caméra (joker)', 'Rideau (bonus)'], art: cinema, rain: ['🎬', '⭐', '🍿', '🎟️'],
  },
  or: {
    id: 'or', name: 'Seeduction Or', tagline: 'La fleur de lys qui rapporte', icon: '⚜️',
    vars: { '--sl-bg': 'linear-gradient(160deg,#0f2a1a,#06120c)', '--sl-frame': '#f0c040', '--sl-accent': '#38d68a', '--sl-reel': '#f4fff4', '--sl-glow': '#9af0a8' },
    names: ['Fleur de lys', 'Couronne', 'Diamant', 'Pièce', 'Pousse', 'Trèfle', 'Médaillon (joker)', 'Coffre (bonus)'], art: or, rain: ['⚜️', '💎', '👑', '🪙'],
  },
  hockey: {
    id: 'hockey', name: 'Rondelle d\'Or', tagline: 'Il lance… il compte !', icon: '🏒',
    vars: { '--sl-bg': 'linear-gradient(160deg,#0a2a5a,#060f24)', '--sl-frame': '#cfe0ff', '--sl-accent': '#e24a4a', '--sl-reel': '#f2f7ff', '--sl-glow': '#7fb4ff' },
    names: ['Coupe', 'Filet', 'Patin', 'Bâton', 'Casque', 'Rondelle', 'Masque (joker)', 'Lumière de but (bonus)'], art: hockey, rain: ['🏒', '🥅', '🏆', '🚨'],
  },
  erable: {
    id: 'erable', name: 'Cabane à Sucre', tagline: 'Du sirop pour les gros gagnants', icon: '🍁',
    vars: { '--sl-bg': 'linear-gradient(160deg,#4a1a10,#1a0a06)', '--sl-frame': '#e8a050', '--sl-accent': '#e24a3a', '--sl-reel': '#fff4e6', '--sl-glow': '#ffb060' },
    names: ['Feuille d\'érable', 'Orignal', 'Poutine', 'Sirop', 'Tuque', 'Flocon', 'Drapeau (joker)', 'Cabane (bonus)'], art: erable, rain: ['🍁', '🫙', '❄️', '🦌'],
  },
  saison: {
    id: 'saison', name: 'Fête du Moment', tagline: 'Change avec les événements du site', icon: '🎉',
    vars: { '--sl-bg': 'linear-gradient(160deg,#2a1440,#0f0818)', '--sl-frame': '#ffd24a', '--sl-accent': '#ff6aa0', '--sl-reel': '#fffaf0', '--sl-glow': '#ffd24a' },
    names: ['Vedette', 'Deuxième', 'Troisième', 'Quatrième', 'Cinquième', 'Étincelle', 'Étoile (joker)', 'Surprise (bonus)'], art: seasonArt('nouvelan'), rain: ['🎉', '✨', '🎊', '⭐'],
  },
  pirate: {
    id: 'pirate', name: 'Trésor des Mers', tagline: 'Les torrents… version pirate', icon: '🏴‍☠️',
    vars: { '--sl-bg': 'linear-gradient(160deg,#0a3a4a,#06151c)', '--sl-frame': '#d9a84a', '--sl-accent': '#2ac0b0', '--sl-reel': '#fff6e0', '--sl-glow': '#5ae0d0' },
    names: ['Coffre', 'Tête de mort', 'Bateau', 'Ancre', 'Perroquet', 'Boussole', 'Chapeau (joker)', 'Carte au trésor (bonus)'], art: pirate, rain: ['🏴‍☠️', '💰', '⚓', '🦜'],
  },
};

export const MACHINE_ORDER: MachineId[] = ['cinema', 'or', 'hockey', 'erable', 'saison', 'pirate'];

/** Habillage final d'une machine (la machine saisonnière prend les couleurs et les dessins de l'événement en cours). */
export function skinFor(id: MachineId, event: EventId | null): Skin {
  const base = SKINS[id];
  if (id !== 'saison' || !event) return base;
  const [bg, accent, reel] = SEASON_COLORS[event];
  return { ...base, name: `Fête : ${ART[event].name}`, art: seasonArt(event), vars: { ...base.vars, '--sl-bg': `linear-gradient(160deg,${bg},#0a0610)`, '--sl-accent': accent, '--sl-reel': reel } };
}
