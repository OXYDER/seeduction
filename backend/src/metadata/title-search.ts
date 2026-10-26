/**
 * Aides à la recherche de fiches (TMDB) : un titre collé ou déduit d'un nom de release n'est presque jamais identique à celui de la base
 * (« Zombie Cars - Sauvé de la scrap » pour « Zombie Car »). On génère donc des variantes (sans sous-titre, au singulier ou au pluriel, sans article,
 * plus courtes...) et on classe les résultats par ressemblance plutôt que de laisser l'utilisateur sans rien.
 */
const deaccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const ARTICLES = ['the', 'le', 'la', 'les', 'l', 'un', 'une', 'a', 'an', 'de', 'du', 'des', 'd', 'of', 'and', 'et'];

/** Mots d'un titre : sans accents ni ponctuation, en minuscules, « œ » → « oe », « & » → « and ». */
export function titleTokens(t: string): string[] {
  return deaccent(t).toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);
}

/** Singulier approximatif d'un mot (anglais et français) : « cars » → « car », « stories » → « story », « series » reste « series ». */
export function singularWord(w: string): string {
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (/(ss|us|is)$/.test(w)) return w; // « class », « bus », « tennis »
  if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y';
  if (/(ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}

/** Clé de comparaison tolérante au pluriel : « Zombie Cars » et « Zombie Car » donnent la même clé. */
export function looseKey(t: string): string {
  const tokens = titleTokens(t);
  if (tokens.length > 1 && ARTICLES.includes(tokens[0])) tokens.shift();
  return tokens.map(keyWord).join('');
}

/** Mot de la clé de comparaison : « zombies » et « zombie » (comme « stories » et « story ») s'écrivent pareil. */
function keyWord(w: string): string {
  const s = w.length > 4 && /ies$/.test(w) ? w.slice(0, -1) : singularWord(w);
  return s.length > 3 && /y$/.test(s) ? s.slice(0, -1) + 'ie' : s;
}

/** Le titre sans son sous-titre (« Zombie Cars - Sauvé de la scrap » → « Zombie Cars », « Titre : suite » → « Titre »). */
export function withoutSubtitle(t: string): string {
  return t.split(/\s*[:–—|]\s*|\s+-\s+/)[0].trim();
}

const bigrams = (s: string) => { const out: string[] = []; for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2)); return out; };

/** Ressemblance de deux titres, de 0 à 1 (coefficient de Dice sur les paires de lettres, après clé tolérante au pluriel). */
export function similarity(a: string, b: string): number {
  const ka = looseKey(a), kb = looseKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  const ba = bigrams(ka), bb = bigrams(kb);
  if (!ba.length || !bb.length) return 0;
  const counts = new Map<string, number>();
  for (const g of bb) counts.set(g, (counts.get(g) ?? 0) + 1);
  let common = 0;
  for (const g of ba) { const c = counts.get(g) ?? 0; if (c > 0) { common++; counts.set(g, c - 1); } }
  return (2 * common) / (ba.length + bb.length);
}

/** Pluriel ou singulier du dernier mot : on tente l'autre forme (« Zombie Car » ↔ « Zombie Cars »). */
function togglePlural(q: string): string[] {
  const words = q.split(/\s+/);
  const last = words[words.length - 1];
  if (!last || last.length < 3 || /\d/.test(last)) return [];
  let lastForm: string;
  if (/s$/i.test(last)) {
    const lower = last.toLowerCase();
    const sing = singularWord(lower);
    if (sing === lower) return [];
    lastForm = /ies$/i.test(last) && sing.endsWith('y') ? `${last.slice(0, -3)}y` : last.slice(0, last.length - (lower.length - sing.length));
  } else lastForm = `${last}s`;
  return [[...words.slice(0, -1), lastForm].join(' ')];
}

export interface Variant { q: string; y?: string }

/**
 * Les requêtes à essayer, de la plus précise à la plus large (sans doublons) : la requête telle quelle (avec puis sans l'année), la ligature, le titre sans sous-titre,
 * le singulier / pluriel, sans article ou mot de liaison, avec ou sans tiret, puis des titres raccourcis (premiers mots).
 */
export function searchVariants(query: string, year?: string): Variant[] {
  const out: Variant[] = [];
  const seen = new Set<string>();
  const add = (q: string, y?: string) => {
    const clean = q.replace(/\s+/g, ' ').trim();
    if (clean.length < 2) return;
    const key = `${deaccent(clean).toLowerCase()}|${y ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ q: clean, y });
  };
  const q = query.replace(/\s+/g, ' ').trim();
  add(q, year);
  if (year) add(q);
  if (/oe/i.test(q)) add(q.replace(/oe/gi, 'œ'), year);

  const base = withoutSubtitle(q);
  if (base !== q) { add(base, year); add(base); }
  for (const form of base === q ? [q] : [base]) for (const alt of togglePlural(form)) { add(alt, year); add(alt); }
  // Singulier de tous les mots (« Les Zombies Cars » → « Zombie Car »)
  const singular = base.split(/\s+/).map((w) => singularWord(w.toLowerCase())).join(' ');
  if (singular && singular !== base.toLowerCase()) add(singular);

  const words = base.split(/\s+/);
  const content = words.filter((w) => !ARTICLES.includes(deaccent(w).toLowerCase().replace(/['’]$/, '')));
  if (content.length && content.length < words.length) add(content.join(' '));
  if (/[-–]/.test(base)) add(base.replace(/[-–]/g, ' '));
  if (words.length > 2) {
    add(words.slice(0, -1).join(' '));
    add(words.slice(0, 2).join(' '));
  }
  if (words.length > 3) add(words.slice(0, 3).join(' '));
  return out.slice(0, 12);
}
