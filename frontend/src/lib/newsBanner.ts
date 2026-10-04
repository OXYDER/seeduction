/**
 * Bannières de nouvelles générées dans le navigateur (canvas) : le VRAI logo de Seeduction, le titre en texte net, des couleurs et
 * des motifs propres à chaque type de nouvelle. Instantané, gratuit, aucun service externe ; le résultat est un PNG 16:9.
 */
export type BannerKind = 'NEWS' | 'UPDATE' | 'EVENT' | 'MAINTENANCE' | 'IMPORTANT';

const W = 1600;
const H = 900;

interface Palette { from: string; to: string; accent: string; label: string }
const PALETTES: Record<BannerKind, Palette> = {
  NEWS: { from: '#150a33', to: '#4a2185', accent: '#e0b84a', label: 'NOUVEAUTÉ' },
  UPDATE: { from: '#06172e', to: '#0a5f94', accent: '#4cc9f0', label: 'MISE À JOUR' },
  EVENT: { from: '#2e0830', to: '#b0165f', accent: '#ffd166', label: 'ÉVÉNEMENT' },
  MAINTENANCE: { from: '#1e1608', to: '#7a5212', accent: '#f59e0b', label: 'MAINTENANCE' },
  IMPORTANT: { from: '#260810', to: '#8a1422', accent: '#ff6b6b', label: 'IMPORTANT' },
};

/** Générateur pseudo-aléatoire reproductible : le même titre donne toujours les mêmes motifs. */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (h ^ (h >>> 16)) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

type Ctx = CanvasRenderingContext2D;

function rays(c: Ctx, x: number, y: number, color: string, rand: () => number) {
  const n = 22;
  const start = rand() * Math.PI;
  for (let i = 0; i < n; i++) {
    const a0 = start + (i / n) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / n / 2;
    c.beginPath(); c.moveTo(x, y);
    c.lineTo(x + Math.cos(a0) * 2200, y + Math.sin(a0) * 2200);
    c.lineTo(x + Math.cos(a1) * 2200, y + Math.sin(a1) * 2200);
    c.closePath(); c.fillStyle = rgba(color, 0.05 + rand() * 0.05); c.fill();
  }
}

function bokeh(c: Ctx, color: string, rand: () => number, count = 36) {
  for (let i = 0; i < count; i++) {
    const r = 20 + rand() * 120, x = rand() * W, y = rand() * H;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, 0.18 + rand() * 0.12)); g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
}

function grid(c: Ctx, color: string, rand: () => number) {
  c.strokeStyle = rgba(color, 0.12); c.lineWidth = 1.5;
  for (let x = 0; x <= W; x += 80) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = 0; y <= H; y += 80) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  c.fillStyle = rgba(color, 0.5);
  for (let i = 0; i < 40; i++) { c.beginPath(); c.arc(Math.round(rand() * (W / 80)) * 80, Math.round(rand() * (H / 80)) * 80, 4, 0, Math.PI * 2); c.fill(); }
}

function circuit(c: Ctx, color: string, rand: () => number) {
  c.strokeStyle = rgba(color, 0.35); c.fillStyle = rgba(color, 0.7); c.lineWidth = 3;
  for (let i = 0; i < 16; i++) {
    let x = Math.round(rand() * 20) * 80, y = Math.round(rand() * 11) * 80;
    c.beginPath(); c.moveTo(x, y);
    for (let s = 0; s < 4; s++) { if (rand() > 0.5) x += (rand() > 0.5 ? 1 : -1) * 80 * (1 + Math.floor(rand() * 3)); else y += (rand() > 0.5 ? 1 : -1) * 80 * (1 + Math.floor(rand() * 2)); c.lineTo(x, y); }
    c.stroke(); c.beginPath(); c.arc(x, y, 8, 0, Math.PI * 2); c.fill();
  }
}

function gear(c: Ctx, cx: number, cy: number, r: number, teeth: number, color: string, rot: number) {
  c.save(); c.translate(cx, cy); c.rotate(rot); c.strokeStyle = rgba(color, 0.32); c.lineWidth = 6; c.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2, rr = i % 2 === 0 ? r : r * 0.82, a2 = a + (Math.PI * 2) / (teeth * 4);
    c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); c.lineTo(Math.cos(a2) * rr, Math.sin(a2) * rr);
  }
  c.closePath(); c.stroke(); c.beginPath(); c.arc(0, 0, r * 0.35, 0, Math.PI * 2); c.stroke(); c.restore();
}

function confetti(c: Ctx, rand: () => number, colors: string[]) {
  for (let i = 0; i < 140; i++) {
    c.save(); c.translate(rand() * W, rand() * H); c.rotate(rand() * Math.PI);
    c.fillStyle = rgba(colors[Math.floor(rand() * colors.length)], 0.35 + rand() * 0.4);
    c.fillRect(-8, -3, 16 + rand() * 10, 6); c.restore();
  }
}

function stripes(c: Ctx, color: string) {
  c.save(); c.beginPath(); c.rect(0, H - 90, W, 90); c.clip(); c.fillStyle = rgba(color, 0.28);
  for (let x = -200; x < W + 200; x += 70) { c.beginPath(); c.moveTo(x, H); c.lineTo(x + 36, H); c.lineTo(x + 100, H - 90); c.lineTo(x + 64, H - 90); c.closePath(); c.fill(); }
  c.restore();
  c.save(); c.strokeStyle = rgba(color, 0.2); c.lineWidth = 10; c.lineJoin = 'round'; c.beginPath(); c.moveTo(W * 0.74, 90); c.lineTo(W * 0.74 + 150, 350); c.lineTo(W * 0.74 - 150, 350); c.closePath(); c.stroke(); c.restore();
}

function icons(c: Ctx, rand: () => number) {
  const set = ['🎬', '🎵', '🎮', '📄', '💿', '🎞️'];
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let i = 0; i < 14; i++) {
    c.save(); c.globalAlpha = 0.14 + rand() * 0.16; c.font = `${50 + rand() * 80}px sans-serif`;
    c.translate(rand() * W, rand() * H); c.rotate((rand() - 0.5) * 0.7); c.fillText(set[Math.floor(rand() * set.length)], 0, 0); c.restore();
  }
}

/** Motif propre au type de nouvelle (variante 0), ou combinaisons génériques (variantes 1 et 2). */
function decorate(c: Ctx, kind: BannerKind, variant: number, p: Palette, rand: () => number, logoX: number, logoY: number) {
  if (variant === 1) { rays(c, logoX, logoY, p.accent, rand); bokeh(c, p.accent, rand, 26); return; }
  if (variant === 2) { grid(c, p.accent, rand); bokeh(c, '#ffffff', rand, 18); return; }
  switch (kind) {
    case 'UPDATE': circuit(c, p.accent, rand); bokeh(c, p.accent, rand, 14); break;
    case 'EVENT': bokeh(c, p.accent, rand, 20); confetti(c, rand, [p.accent, '#ffffff', '#f472b6', '#a78bfa']); break;
    case 'MAINTENANCE': gear(c, W * 0.86, 150, 150, 10, p.accent, 0.2); gear(c, W * 0.7, 760, 110, 8, p.accent, 0.5); gear(c, W * 0.12, 120, 90, 8, p.accent, 0.1); bokeh(c, p.accent, rand, 12); break;
    case 'IMPORTANT': stripes(c, p.accent); bokeh(c, p.accent, rand, 14); break;
    default: icons(c, rand); bokeh(c, p.accent, rand, 16);
  }
}

function wrap(c: Ctx, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (c.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const kept = lines.slice(0, maxLines); kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s.,;:!?-]+$/, '')}…`; return kept; }
  return lines;
}

/** Charge le logo de Seeduction (servi par le site lui-même). */
export function loadLogo(src = '/logo-full.png'): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Logo introuvable')); img.src = src; });
}

/** Dessine une bannière 16:9 ; `variant` 0 = motif du type, 1 = rayons, 2 = grille. Le logo est à gauche, ou à droite pour la variante 1. */
export function drawBanner(canvas: HTMLCanvasElement, logo: HTMLImageElement, opts: { kind: BannerKind; title: string; summary?: string; variant: number }) {
  const { kind, title, summary, variant } = opts;
  const p = PALETTES[kind] ?? PALETTES.NEWS;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d') as Ctx;
  const rand = rng(`${title}|${kind}|${variant}`);
  const logoOnRight = variant === 1;
  const logoSize = 620;
  const logoX = logoOnRight ? W - 90 - logoSize / 2 - 40 : 90 + logoSize / 2 + 40;
  const logoY = H / 2;

  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, p.from); bg.addColorStop(1, p.to);
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  decorate(c, kind, variant, p, rand, logoX, logoY);

  // Halo derrière le logo, puis le logo lui-même (jamais déformé : même largeur et hauteur).
  const halo = c.createRadialGradient(logoX, logoY, 40, logoX, logoY, logoSize * 0.75);
  halo.addColorStop(0, rgba(p.accent, 0.38)); halo.addColorStop(1, rgba(p.accent, 0));
  c.fillStyle = halo; c.fillRect(0, 0, W, H);
  c.save(); c.shadowColor = rgba(p.accent, 0.7); c.shadowBlur = 50;
  c.drawImage(logo, logoX - logoSize / 2, logoY - logoSize / 2, logoSize, logoSize); c.restore();

  // Texte : pastille du type, titre, résumé.
  const textW = 640;
  const x = logoOnRight ? 110 : W - 110 - textW;
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.font = '700 64px Inter, "Segoe UI", system-ui, sans-serif';
  const titleLines = wrap(c, title.trim() || 'Nouvelle', textW, 4);
  c.font = '400 32px Inter, "Segoe UI", system-ui, sans-serif';
  const sumLines = summary?.trim() ? wrap(c, summary.trim(), textW, 3) : [];
  const blockH = 52 + 28 + titleLines.length * 76 + (sumLines.length ? 28 + sumLines.length * 44 : 0);
  let y = H / 2 - blockH / 2;

  c.font = '800 26px Inter, "Segoe UI", system-ui, sans-serif';
  const badgeW = c.measureText(p.label).width + 44;
  c.fillStyle = rgba(p.accent, 0.22); c.beginPath(); c.roundRect(x, y, badgeW, 52, 26); c.fill();
  c.strokeStyle = rgba(p.accent, 0.9); c.lineWidth = 2; c.stroke();
  c.fillStyle = p.accent; c.fillText(p.label, x + 22, y + 36);
  y += 52 + 28;

  c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 14; c.shadowOffsetY = 3;
  c.fillStyle = '#ffffff'; c.font = '700 64px Inter, "Segoe UI", system-ui, sans-serif';
  for (const line of titleLines) { y += 62; c.fillText(line, x, y); y += 14; }
  c.restore();

  if (sumLines.length) {
    y += 14; c.fillStyle = 'rgba(255,255,255,0.82)'; c.font = '400 32px Inter, "Segoe UI", system-ui, sans-serif';
    for (const line of sumLines) { y += 34; c.fillText(line, x, y); y += 10; }
  }

  // Liseré aux couleurs du type, en bas.
  const bar = c.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, rgba(p.accent, 0)); bar.addColorStop(0.5, rgba(p.accent, 0.9)); bar.addColorStop(1, rgba(p.accent, 0));
  c.fillStyle = bar; c.fillRect(0, H - 8, W, 8);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image impossible à créer'))), 'image/png'));
}
