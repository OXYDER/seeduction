/** Textes de fiches (TMDB...) affichés en français : statuts, pays, langues, dates. Tout ce qui arrive en anglais est traduit ici, à l'affichage. */

const STATUS_FR: Record<string, string> = {
  'returning series': 'Série en cours',
  ended: 'Série terminée',
  canceled: 'Série annulée',
  cancelled: 'Série annulée',
  'in production': 'En production',
  planned: 'Prévue',
  pilot: 'Pilote',
  released: 'Sorti',
  'post production': 'En post-production',
  rumored: 'Rumeur',
};

/** « Returning Series » → « Série en cours » (statuts TMDB). Un statut inconnu est laissé tel quel. */
export const statusFr = (s?: string | null): string | null => (s ? STATUS_FR[s.trim().toLowerCase()] ?? s : null);

const cap = (s: string) => s.charAt(0).toLocaleUpperCase('fr') + s.slice(1);

let countryByName: Map<string, string> | null = null;
let languageByName: Map<string, string> | null = null;
const letters = 'abcdefghijklmnopqrstuvwxyz';

function regionNames(locale: string): Intl.DisplayNames | null {
  try { return new Intl.DisplayNames([locale], { type: 'region' }); } catch { return null; }
}
function languageNames(locale: string): Intl.DisplayNames | null {
  try { return new Intl.DisplayNames([locale], { type: 'language' }); } catch { return null; }
}

/** Nom de pays (anglais, comme TMDB le donne) → code ISO, construit une fois à partir du navigateur. */
function countries(): Map<string, string> {
  if (countryByName) return countryByName;
  countryByName = new Map();
  const en = regionNames('en');
  if (en) {
    for (const a of letters.toUpperCase()) for (const b of letters.toUpperCase()) {
      const code = a + b;
      let name: string | undefined;
      try { name = en.of(code); } catch { name = undefined; }
      if (name && name !== code) countryByName.set(name.toLowerCase(), code);
    }
  }
  // Noms propres à TMDB qui diffèrent de ceux du navigateur.
  for (const [n, c] of Object.entries({ 'united states of america': 'US', 'czech republic': 'CZ', russia: 'RU', 'south korea': 'KR', 'north korea': 'KP', 'hong kong': 'HK', 'united kingdom': 'GB', 'ivory coast': 'CI', 'burma': 'MM', 'macedonia': 'MK' })) countryByName.set(n, c);
  return countryByName;
}

/** « United States of America » → « États-Unis », « Canada » → « Canada ». Un nom inconnu est laissé tel quel. */
export function countryFr(name: string): string {
  const code = countries().get(String(name).trim().toLowerCase());
  const fr = code ? regionNames('fr') : null;
  try { return (code && fr?.of(code)) || name; } catch { return name; }
}

/** Nom de langue (anglais ou nom natif, comme TMDB le donne) → code ISO 639-1. */
function languages(): Map<string, string> {
  if (languageByName) return languageByName;
  languageByName = new Map();
  const en = languageNames('en');
  for (const a of letters) for (const b of letters) {
    const code = a + b;
    let eng: string | undefined, native: string | undefined;
    try { eng = en?.of(code); } catch { eng = undefined; }
    if (!eng || eng === code) continue; // pas une langue
    languageByName.set(eng.toLowerCase(), code);
    try { native = languageNames(code)?.of(code); } catch { native = undefined; }
    if (native && native !== code) languageByName.set(native.toLowerCase(), code);
  }
  return languageByName;
}

/** « English » → « Anglais », « 日本語 » → « Japonais ». Un nom inconnu est laissé tel quel. */
export function languageFr(name: string): string {
  const code = languages().get(String(name).trim().toLowerCase());
  const fr = code ? languageNames('fr') : null;
  try { const v = code && fr?.of(code); return v && v !== code ? cap(v) : name; } catch { return name; }
}

/** « 2025-08-28 » → « 28 août 2025 » (une date incomplète, « 2025 », reste telle quelle). */
export function dateFr(iso?: string | null): string | null {
  if (!iso) return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Date d'ajout, courte : « 7 oct. 2026 ». */
export function shortDateFr(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** « S02E07 », « S02 » ou « Intégrale » à partir des champs saison / épisode d'un torrent (les valeurs libres sont gardées telles quelles). */
export function episodeCode(season?: string | null, episode?: string | null): string | null {
  if (!season) return null;
  if (!/^\d+$/.test(season)) return season;
  return `S${season.padStart(2, '0')}${/^\d+$/.test(episode ?? '') ? `E${String(episode).padStart(2, '0')}` : ''}`;
}

/** Durée d'une fiche en français : « 21 min », « 1 h 35 ». */
export function minutesFr(min?: number | null): string | null {
  if (!min) return null;
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`;
}

const FACET_VALUE_FR: Record<string, string> = { Lossless: 'Sans perte', Lossy: 'Avec perte' };

/** Valeur d'un filtre de catégorie affichée en français (la valeur stockée, elle, ne change pas : elle sert aux liens et aux filtres). */
export const facetValueFr = (v: string): string => FACET_VALUE_FR[v] ?? v;
