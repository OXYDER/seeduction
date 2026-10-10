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
