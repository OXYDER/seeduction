// Génère src/skin-light.css : la version « thème clair » de index.css + skin5.css (+ les autres feuilles du site).
//
// Le site est dessiné en sombre avec des milliers de couleurs écrites en dur (blancs translucides, bleus nuit, texte clair...).
// Plutôt que de les réécrire à la main, ce script relit chaque règle et en produit une copie « clair » :
//   - surfaces sombres  → surfaces claires teintées ; blancs translucides → noirs translucides (même opacité) ;
//   - textes clairs      → textes sombres ; pastels sur fond sombre → même teinte, plus foncée (lisible sur blanc) ;
//   - ombres             → gardées sombres mais adoucies ; texte blanc sur un fond d'accent (boutons) → inchangé.
// Chaque copie est préfixée par :root[data-mode="light"] (elle ne s'applique donc que quand le thème clair est choisi).
// À relancer après un changement de couleurs dans les feuilles de style :   npm run light
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'src');
const FILES = ['index.css', 'skin5.css', 'games.css', 'mail.css'].filter((f) => fs.existsSync(path.join(src, f)));

// ── couleurs ─────────────────────────────────────────────────────────────────
function parseColor(token) {
  let m = /^#([0-9a-f]{3,8})$/i.exec(token);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  m = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/i.exec(token);
  if (m) {
    let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  if (/^white$/i.test(token)) return { r: 255, g: 255, b: 255, a: 1 };
  if (/^black$/i.test(token)) return { r: 0, g: 0, b: 0, a: 1 };
  return null;
}
function toHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}
function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}
const fmt = ({ r, g, b }, a) => (a >= 0.999 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${+a.toFixed(3)})`);
const isSaturated = (c) => { const { s, l } = toHsl(c); return s >= 0.28 && l >= 0.22 && l <= 0.85; };

const SHADOW = /^(box-shadow|text-shadow|drop-shadow)$/;
const BORDER = /^(border|outline|column-rule)/;

/** Convertit une couleur pour le thème clair ; null = inchangée. */
function lighten(c, prop) {
  const { h, s, l } = toHsl(c);
  if (SHADOW.test(prop)) {
    if (l < 0.35) return fmt({ r: 15, g: 23, b: 42 }, c.a * 0.28); // ombre sombre : adoucie
    return null; // reflet clair : inchangé
  }
  if (BORDER.test(prop)) {
    if (l >= 0.92 && s < 0.28) return fmt({ r: 15, g: 23, b: 42 }, c.a); // trait blanc translucide → trait sombre translucide
    if (l < 0.3) return fmt(fromHsl(h, Math.min(s, 0.3) * 0.5, 0.84), c.a >= 0.999 ? 1 : Math.min(1, c.a + 0.2));
  }
  if (l < 0.22) return fmt(fromHsl(h, Math.min(s, 0.3) * 0.5, 0.965), c.a); // fond sombre → fond clair
  if (s < 0.28) return fmt(fromHsl(h, s, 1 - l), c.a); // gris, blanc, noir : lumière inversée (blanc translucide → noir translucide)
  if (l > 0.6) return fmt(fromHsl(h, Math.min(1, s * 1.05), Math.max(0.3, l - 0.34)), c.a); // pastel sur fond sombre → plus foncé
  return null; // accent de milieu de gamme : inchangé
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\)|\b(?:white|black)\b/g;
function convertValue(value, prop) {
  if (/url\(/.test(value) && !/gradient/.test(value)) return null;
  let changed = false;
  const out = value.replace(COLOR_RE, (tok, offset) => {
    // un « #fff » à l'intérieur d'une url() ou d'un identifiant n'est pas une couleur
    if (/url\([^)]*$/.test(value.slice(0, offset))) return tok;
    const c = parseColor(tok);
    if (!c || (c.a === 0)) return tok;
    const n = lighten(c, prop);
    if (!n) return tok;
    changed = true;
    return n;
  });
  return changed ? out : null;
}

const COLOR_PROPS = /^(color|background|background-color|background-image|border|border-color|border-top|border-right|border-bottom|border-left|border-top-color|border-right-color|border-bottom-color|border-left-color|outline|outline-color|box-shadow|text-shadow|fill|stroke|caret-color|column-rule|-webkit-text-fill-color|text-decoration-color)$/;

function ruleHasAccentBackground(rule) {
  let found = false;
  rule.walkDecls(/^background/, (d) => {
    // Teinte d'accent translucide (rgba(var(--acc-rgb), .2), color-mix(... transparent)) : ce n'est pas un fond plein, le texte doit devenir sombre.
    const v = d.value
      .replace(/rgba\(\s*var\(--[\w-]+\)\s*,\s*([\d.]+)\s*\)/g, (m, al) => (parseFloat(al) < 0.6 ? 'translucide' : m))
      .replace(/color-mix\((?:[^()]|\([^()]*\))*\)/g, (m) => (/transparent/.test(m) ? 'translucide' : m));
    if (/var\(--(acc|accent|gold|green|danger|team-accent)/.test(v) || /hsla?\(/.test(v)) found = true;
    for (const tok of v.match(COLOR_RE) ?? []) { const c = parseColor(tok); if (c && c.a > 0.5 && isSaturated(c)) found = true; }
  });
  return found;
}

function prefixSelector(sel) {
  const s = sel.trim();
  if (/^:root/.test(s)) return s.replace(/^:root/, ':root[data-mode="light"]');
  return `:root[data-mode="light"] ${s}`;
}

/** Fond blanc plein voulu (pastille de logo, bouton clair) : on le garde, et son texte sombre aussi. */
function ruleHasSolidWhiteBg(rule) {
  let found = false;
  rule.walkDecls(/^background(-color)?$/, (d) => {
    const c = parseColor(d.value.trim().replace(/\s*!important$/, ''));
    if (c && c.a >= 0.999 && toHsl(c).l >= 0.97) found = true;
  });
  return found;
}

function lightRule(rule) {
  if (ruleHasSolidWhiteBg(rule)) return null;
  const accentBg = ruleHasAccentBackground(rule);
  const decls = [];
  rule.walkDecls((d) => {
    if (d.parent !== rule || !COLOR_PROPS.test(d.prop)) return;
    if (d.prop === 'color' || d.prop === '-webkit-text-fill-color') {
      // Texte clair sur un fond d'accent (bouton, pastille) : reste clair.
      const c = parseColor(d.value.trim());
      if (accentBg && c && toHsl(c).l > 0.78) return;
    }
    const prop = d.prop.replace(/^-webkit-/, '');
    const v = convertValue(d.value, d.prop === 'box-shadow' || d.prop === 'text-shadow' ? d.prop : prop);
    if (v && v !== d.value) decls.push([d.prop, v + (d.important ? ' !important' : '')]);
  });
  if (decls.length === 0) return null;
  const selectors = rule.selectors.map(prefixSelector).join(',\n');
  return `${selectors} { ${decls.map(([p, v]) => `${p}: ${v};`).join(' ')} }`;
}

function walk(container, out) {
  container.each((node) => {
    if (node.type === 'rule') {
      if (node.parent && node.parent.type === 'atrule' && /keyframes$/i.test(node.parent.name)) return;
      const r = lightRule(node);
      if (r) out.push(r);
    } else if (node.type === 'atrule' && /^(media|supports)$/i.test(node.name)) {
      const inner = [];
      walk(node, inner);
      if (inner.length) out.push(`@${node.name} ${node.params} {\n${inner.map((l) => '  ' + l.replace(/\n/g, '\n  ')).join('\n')}\n}`);
    }
  });
}

const parts = [];
for (const f of FILES) {
  const root = postcss.parse(fs.readFileSync(path.join(src, f), 'utf8'));
  const out = [];
  walk(root, out);
  parts.push(`/* ── ${f} ── */\n${out.join('\n')}`);
}
const header = `/* GÉNÉRÉ par scripts/make-light.mjs (npm run light) à partir de ${FILES.join(', ')} : ne pas modifier à la main.
   Les retouches faites à la main du thème clair sont dans skin-light-fixes.css. */\n`;
fs.writeFileSync(path.join(src, 'skin-light.css'), header + parts.join('\n\n') + '\n');
console.log('skin-light.css :', parts.reduce((n, p) => n + p.split('\n').length, 0), 'lignes');
