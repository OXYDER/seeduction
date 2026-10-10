/**
 * Rattachement AUTOMATIQUE d'une fiche ThePornDB à une release adulte, seulement quand le résultat est clair (jamais au hasard : sinon la release
 * attend dans « À vérifier »). Deux familles de noms :
 *  - une SCÈNE : « Site.24.01.15.Prénom.Nom.XXX.1080p.MP4-GRP » (site, date de sortie, interprètes) : il faut le même jour, le même site, et un seul candidat
 *    (ou un seul dont les interprètes figurent dans le nom) ;
 *  - un FILM : « Titre.2023.XXX.1080p… » : même titre exact (accents, casse et ponctuation ignorés) et même année (à un an près), un seul candidat.
 */
export interface PorndbHit {
  id: string; // « scene:… » ou « movie:… »
  kind: 'scene' | 'movie';
  title: string;
  date?: string; // AAAA-MM-JJ
  site?: string;
  performers: string[];
}

export interface ParsedAdultName { kind: 'scene' | 'movie'; site: string; date?: string; rest: string; title: string; year?: number }

const flat = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const QUALITY = /\s(?:xxx|\d{3,4}[pi]|[248]k|uhd|web|webrip|web-dl|webdl|hdtv|dvdrip|bluray|bdrip|mp4|mkv|avi|wmv|h26[45]|x26[45]|hevc|avc|aac|ac3|vr|sd|hd)(?=\s|$)/i;

export function parseAdultName(name: string): ParsedAdultName {
  const spaced = String(name).replace(/\.(?:torrent|mp4|mkv|avi|wmv)$/i, '').replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  const cut = spaced.search(QUALITY);
  const head = (cut > 0 ? spaced.slice(0, cut) : spaced).trim();
  const m = head.match(/^(.*?)\s(\d{2}|\d{4})\s(\d{2})\s(\d{2})(?:\s(.*))?$/);
  if (m) {
    const yy = Number(m[2]), mm = Number(m[3]), dd = Number(m[4]);
    const year = m[2].length === 4 ? yy : 2000 + yy;
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && year >= 2000 && year <= new Date().getFullYear() + 1 && m[1].trim()) {
      return { kind: 'scene', site: m[1].trim(), date: `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`, rest: (m[5] ?? '').trim(), title: head };
    }
  }
  const y = head.match(/^(.*?)\s((?:19|20)\d{2})$/);
  return { kind: 'movie', site: '', rest: '', title: (y ? y[1] : head).trim(), year: y ? Number(y[2]) : undefined };
}

const siteMatches = (a: string, b: string) => {
  const x = flat(a), y = flat(b);
  if (x.length < 3 || y.length < 3) return false;
  return x === y || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)));
};

/** La fiche qui correspond sans ambiguïté, ou null (le choix revient alors à un humain). */
export function pickPorndbMatch(name: string, hits: PorndbHit[]): PorndbHit | null {
  const p = parseAdultName(name);
  if (p.kind === 'scene') {
    const same = hits.filter((h) => h.kind === 'scene' && h.date === p.date && !!h.site && siteMatches(h.site, p.site));
    if (same.length === 0) return null;
    const restFlat = flat(p.rest);
    const score = (h: PorndbHit) => h.performers.filter((n) => flat(n).length >= 4 && restFlat.includes(flat(n))).length;
    if (same.length === 1) {
      const h = same[0];
      // Des interprètes sont écrits dans le nom : au moins l'un d'eux doit être dans la fiche (sinon c'est probablement une autre scène du même jour).
      if (restFlat.length >= 6 && h.performers.length > 0 && score(h) === 0) return null;
      return h;
    }
    const ranked = same.map((h) => ({ h, s: score(h) })).sort((a, b) => b.s - a.s);
    return ranked[0].s >= 1 && ranked[0].s > ranked[1].s ? ranked[0].h : null;
  }
  const wanted = flat(p.title);
  if (wanted.length < 3) return null;
  const same = hits.filter((h) => h.kind === 'movie' && flat(h.title) === wanted && (!p.year || !h.date || Math.abs(Number(h.date.slice(0, 4)) - p.year) <= 1));
  return same.length === 1 ? same[0] : null;
}

// ------------------------------------------------------------------ studios proposés dans les résultats de recherche
//
// Un pack (plusieurs films ou scènes d'un même studio dans une seule release) ne correspond à aucun film en particulier : parmi les résultats on propose donc
// aussi le STUDIO (le site), pour rattacher la release au studio plutôt qu'à l'un de ses films.
export interface StudioChoice { id: string; name: string; logo: string | null; count: number; direct: boolean }

/**
 * Studios à proposer : ceux que renvoie la recherche de sites (« direct »), puis ceux des films et scènes trouvés (les plus fréquents d'abord).
 * L'identifiant embarque le nom (« studio:<uuid>:<nom> ») : la fiche reste créable même si le détail du studio est momentanément indisponible.
 */
export function collectStudios(direct: any[], fromResults: any[], max = 5): StudioChoice[] {
  const byKey = new Map<string, StudioChoice>();
  const add = (s: any, isDirect: boolean) => {
    const name = String(s?.name ?? '').trim();
    const ref = s?.uuid ?? s?.id;
    if (!name || ref === undefined || ref === null || ref === '') return;
    const key = String(ref);
    const cur = byKey.get(key);
    if (cur) { cur.count++; cur.direct = cur.direct || isDirect; cur.logo = cur.logo ?? (s.logo || s.favicon || null); return; }
    byKey.set(key, { id: `studio:${key}:${encodeURIComponent(name)}`, name, logo: s.logo || s.favicon || s.poster || null, count: isDirect ? 0 : 1, direct: isDirect });
  };
  for (const s of direct.slice(0, 3)) add(s, true);
  for (const r of fromResults) add(r?.site ?? r?.studio, false);
  return [...byKey.values()].sort((a, b) => Number(b.direct) - Number(a.direct) || b.count - a.count).slice(0, max);
}

/** « studio:<uuid>:<nom encodé> » -> ses parties. */
export function parseStudioId(id: string): { uuid: string; name: string } | null {
  const m = String(id).match(/^studio:([^:]+)(?::(.*))?$/);
  if (!m) return null;
  let name = '';
  try { name = decodeURIComponent(m[2] ?? ''); } catch { name = m[2] ?? ''; }
  return { uuid: m[1], name };
}

/**
 * Images d'une fiche ThePornDB, dans l'ordre d'essai : les formats « large » / « medium » d'abord (l'affiche d'origine peut dépasser les 8 Mo acceptés et ne
 * serait alors jamais enregistrée), puis l'affiche, l'image, et en dernier recours le fond (une scène sans affiche garde ainsi une pochette).
 */
export function porndbCovers(g: any): { coverUrl: string | null; coverFallbacks: string[] } {
  const pick = (o: any, ...keys: string[]) => keys.map((k) => o?.[k]).filter((v) => typeof v === 'string' && v);
  const list = [...new Set<string>([
    ...pick(g?.posters, 'large', 'medium'),
    ...pick(g, 'poster', 'image'),
    ...pick(g?.posters, 'full', 'small'),
    ...pick(g?.background, 'large', 'medium', 'full'),
  ])];
  return { coverUrl: list[0] ?? null, coverFallbacks: list.slice(1) };
}
