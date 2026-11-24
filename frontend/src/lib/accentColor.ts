/**
 * Couleur d'accent libre : à partir d'une teinte choisie par le membre, calcule toutes les variables CSS du site
 * (dégradé des boutons, liens, lueurs) en garantissant la lisibilité : texte des boutons et liens à au moins 4,5:1
 * (norme WCAG AA). Si la couleur choisie ne le permet pas, elle est éclaircie ou assombrie juste ce qu'il faut.
 * Fonctions pures, sans accès au DOM.
 */
type RGB = [number, number, number];

export const MIN_CONTRAST = 4.5;
const TARGET = 4.6; // petite marge au-dessus du seuil
/** Fonds de référence les plus défavorables : un fond sombre plutôt clair, un fond clair plutôt foncé. */
const BG_DARK = '#12161f';
const BG_LIGHT = '#f4f1ea';
const TEXT_LIGHT = '#ffffff';
const TEXT_DARK = '#10131c';

export function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}
export const toHex = (c: RGB) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export function contrast(a: RGB, b: RGB): number { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }

function toHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
const clampL = (l: number) => Math.max(0.05, Math.min(0.96, l));
const rgbStr = (c: RGB) => c.map((v) => Math.round(v)).join(', ');

export interface FittedAccent {
  /** Variables CSS à poser sur <html>. */
  vars: Record<string, string>;
  /** Contraste du texte des boutons sur le dégradé (le plus faible des deux bouts). */
  buttonRatio: number;
  /** Contraste des liens sur le fond. */
  linkRatio: number;
  /** La couleur choisie a dû être éclaircie ou assombrie pour rester lisible. */
  adjusted: boolean;
}

export function fitAccent(hex: string, light: boolean): FittedAccent | null {
  const base = parseHex(hex);
  if (!base) return null;
  const [h, s, l0] = toHsl(base);
  let l1 = l0, l2 = clampL(l0 - 0.06);
  const grad = () => [fromHsl(h, s, l1), fromHsl(h - 28, s, l2)] as [RGB, RGB];
  const white = parseHex(TEXT_LIGHT)!, dark = parseHex(TEXT_DARK)!;
  const worst = (t: RGB) => { const [a, b] = grad(); return Math.min(contrast(a, t), contrast(b, t)); };
  let text = worst(white) >= worst(dark) ? white : dark;
  let adjusted = false;
  for (let i = 0; i < 40 && worst(text) < TARGET; i++) {
    adjusted = true;
    const step = text === white ? -0.025 : 0.025;
    l1 = clampL(l1 + step); l2 = clampL(l2 + step);
    if (l1 === 0.05 || l1 === 0.96) { text = text === white ? dark : white; }
  }
  const [a1, a2] = grad();
  const bg = parseHex(light ? BG_LIGHT : BG_DARK)!;
  let ll = toHsl(a1)[2];
  const linkAt = (v: number) => fromHsl(h, s, v);
  for (let i = 0; i < 40 && contrast(linkAt(ll), bg) < TARGET; i++) ll = clampL(ll + (light ? -0.025 : 0.025));
  const link = linkAt(ll);
  const hover = linkAt(clampL(ll + (light ? -0.1 : 0.12)));
  // Lueurs de fond (aurore) : version assombrie de la teinte, plus une seconde teinte décalée.
  const au = (hh: number, ss: number, v: number) => rgbStr(fromHsl(hh, ss, v));
  return {
    vars: {
      '--acc1': toHex(a1), '--acc2': toHex(a2), '--acc-rgb': rgbStr(a1), '--acc2-rgb': rgbStr(a2),
      '--acc-light': toHex(link), '--acc-link': toHex(link), '--acc-link-hover': toHex(hover), '--on-acc': toHex(text),
      '--aurora-a': au(h, Math.min(0.7, s), 0.36), '--aurora-b': au(h - 28, Math.min(0.7, s), 0.42), '--aurora-c': au(h, Math.min(0.6, s), 0.2), '--aurora-d': au(h + 20, Math.min(0.6, s), 0.24),
    },
    buttonRatio: worst(text), linkRatio: contrast(link, bg), adjusted,
  };
}
