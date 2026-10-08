/**
 * Instructions d'installation / d'utilisation d'une release (logiciel, jeu), extraites de son NFO : la plupart des NFO « scène » ont des rubriques
 * « INSTALL NOTES », « HOW TO », « INSTRUCTIONS », « USAGE », « NOTES »... Rien n'est inventé : seules les lignes qui suivent une rubrique reconnue sont gardées.
 */
export interface InstallSection { title: string; lines: string[] }

/** Rubriques reconnues -> titre affiché (en français). */
const HEADINGS: [RegExp, string][] = [
  [/^(?:system\s+requirements?|requirements?|configuration\s+requise|config(?:uration)?\s+minimale)$/i, 'Configuration requise'],
  [/^(?:how\s*to\s*(?:install|setup|set\s*up)|install(?:ation)?(?:\s+(?:notes?|instructions?|guide|steps?|procedure))?|installer|comment\s+installer|setup(?:\s+notes?)?)$/i, 'Installation'],
  [/^(?:how\s*to\s*(?:crack|activate|register|patch)|activation|crack(?:ing)?|patch(?:ing)?|registration|enregistrement|comment\s+activer)$/i, 'Activation'],
  [/^(?:how\s*to\s*use|usage|instructions?|utilisation|comment\s+utiliser|mode\s+d[’']emploi|how\s*to)$/i, 'Utilisation'],
  [/^(?:release\s+notes?|notes?|remarks?|remarques?|important|post[- ]install(?:ation)?)$/i, 'Notes'],
];

const clean = (raw: string) => raw
  .replace(/^[\s─-╿▀-▟|*+>·•~=_#\-³º°ª]+/, '') // cadres ASCII / CP437 du NFO et puces décoratives
  .replace(/[\s─-╿▀-▟|*+<·•~=_#\-³º°ª]+$/, '')
  .replace(/\s{2,}/g, ' ')
  .trim();

const isArt = (s: string) => s.length === 0 || !/[A-Za-zÀ-ÿ0-9]/.test(s);

function headingOf(line: string): { title: string; rest: string } | null {
  const colon = line.indexOf(':');
  const label = (colon >= 0 ? line.slice(0, colon) : line).replace(/[\s.\-–—]+$/, '').trim(); // « INSTALL NOTES: », « Notes ..... : »
  const rest = colon >= 0 ? line.slice(colon + 1).trim() : '';
  if (label.length < 3 || label.length > 40) return null;
  for (const [re, title] of HEADINGS) if (re.test(label)) return { title, rest };
  return null;
}

/** Une autre rubrique (en capitales, finissant souvent par « : ») : fin de la rubrique en cours. */
const isOtherHeading = (line: string) => /^[A-Z][A-Z0-9 /&'’-]{3,40}:?$/.test(line) && !/^\d/.test(line);

export function extractInstallNotes(nfo: string, maxSections = 4, maxLines = 30): InstallSection[] {
  const lines = String(nfo ?? '').split(/\r?\n/).map(clean);
  const out: InstallSection[] = [];
  for (let i = 0; i < lines.length && out.length < maxSections; i++) {
    const h = headingOf(lines[i]);
    if (!h) continue;
    const body: string[] = [];
    if (h.rest) body.push(h.rest);
    let blanks = 0;
    let j = i + 1;
    for (; j < lines.length && body.length < maxLines; j++) {
      const l = lines[j];
      if (isArt(l)) { if (++blanks >= 2 && body.length) break; continue; }
      if (headingOf(l) || (isOtherHeading(l) && body.length > 0)) break;
      blanks = 0;
      body.push(l);
    }
    if (body.length > 0 && !out.some((s) => s.title === h.title)) out.push({ title: h.title, lines: body });
    i = j - 1;
  }
  return out;
}
