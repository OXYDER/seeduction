/**
 * Import en lot de questions du quiz (logique pure). Deux formats acceptés :
 *  - des lignes « catégorie ; question ; bonne réponse ; mauvaise 1 ; mauvaise 2 ; mauvaise 3 ; explication (facultative) » (séparateur « ; », « | » ou tabulation :
 *    un copier-coller depuis un tableur fonctionne) ; les lignes vides et celles qui commencent par # sont ignorées ;
 *  - un tableau JSON d'objets { category, text, choices: [4 réponses], answer: indice de la bonne, explain? }.
 * La bonne réponse est écrite en premier dans le format en lignes : l'ordre est mélangé à chaque partie.
 */
import { QuestionInput, validateQuestion } from './quiz';

export interface ImportError { line: number; reason: string }
export interface ImportResult { items: QuestionInput[]; errors: ImportError[] }

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
export const questionKey = norm;

function splitLine(line: string): string[] {
  const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : '|';
  return line.split(sep).map((c) => c.trim());
}

/** Analyse le texte collé. `known` : textes déjà dans la banque (en minuscules normalisées), pour écarter les doublons. */
export function parseImport(text: string, known: Set<string> = new Set()): ImportResult {
  const items: QuestionInput[] = [];
  const errors: ImportError[] = [];
  const seen = new Set(known);
  const accept = (raw: any, line: number) => {
    const v = validateQuestion(raw);
    if (!v.ok) { errors.push({ line, reason: v.error }); return; }
    const k = norm(v.value.text);
    if (seen.has(k)) { errors.push({ line, reason: 'Question déjà présente (ou en double dans l\'import)' }); return; }
    seen.add(k); items.push(v.value);
  };

  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    let data: unknown;
    try { data = JSON.parse(trimmed); } catch { return { items, errors: [{ line: 1, reason: 'JSON invalide' }] }; }
    if (!Array.isArray(data)) return { items, errors: [{ line: 1, reason: 'Le JSON doit être un tableau de questions' }] };
    if (data.length > 500) return { items, errors: [{ line: 1, reason: 'Trop de questions d\'un coup (500 au maximum)' }] };
    data.forEach((q, i) => accept(q, i + 1));
    return { items, errors };
  }

  const lines = text.split(/\r?\n/);
  if (lines.length > 1000) return { items, errors: [{ line: 1, reason: 'Trop de lignes d\'un coup (1 000 au maximum)' }] };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const c = splitLine(line);
    if (i === 0 && /^cat[ée]gorie$/i.test(c[0] ?? '')) return; // ligne d'en-tête d'un tableur
    if (c.length < 6) { errors.push({ line: i + 1, reason: `Il faut au moins 6 colonnes (catégorie, question, bonne réponse et trois mauvaises) : ${c.length} trouvée(s)` }); return; }
    accept({ category: c[0], text: c[1], choices: [c[2], c[3], c[4], c[5]], answer: 0, explain: c[6] ?? '' }, i + 1);
  });
  return { items, errors };
}
