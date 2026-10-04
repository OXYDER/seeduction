/**
 * Recherche par pertinence dans le wiki, sans service externe : sert aux suggestions du centre de support, aux réponses de
 * l'assistant du canal « Support » et au correcteur de réponses du staff. Les accents et les pluriels sont ignorés, les mots
 * vides (le, comment, pour...) aussi ; un mot rare du titre pèse beaucoup plus qu'un mot courant du texte.
 */

export interface WikiDoc {
  id: string;
  slug: string;
  title: string;
  keywords: string | null;
  content: string;
  isFaq: boolean;
  category: string;
}

export interface WikiHit {
  slug: string;
  title: string;
  category: string;
  score: number;
  excerpt: string;
}

const STOP = new Set((
  'le la les un une des de du et ou en au aux ce ces cet cette que qui quoi quel quelle comment pourquoi quand ou pour par sur sous dans avec sans chez mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs ' +
  'est sont etre etait ete suis es sommes etes pas ne plus non oui je tu il elle on nous vous ils elles se me te lui y a ai as avons avez ont peux peut peuvent puis fait faire fais veux veut voudrais ' +
  'cela ca ceci tout tous toute toutes tres bien mais donc car si alors aussi encore deja meme autre autres chose quelque quelques rien bonjour salut merci svp stp besoin aide help'
).split(/\s+/));

/** Minuscules sans accents. */
export const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Mots utiles d'un texte : sans accents, sans mots vides, pluriels ramenés au singulier. */
export function tokens(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOP.has(t))
    .map((t) => (t.length > 3 && /[sx]$/.test(t) && !/(us|is|ss)$/.test(t) ? t.slice(0, -1) : t));
}

/** Retire le BBCode des articles (le wiki est écrit en BBCode) pour obtenir du texte lisible. */
export function plainBBCode(src: string): string {
  return src
    .replace(/\[img[^\]]*\][\s\S]*?\[\/img\]/gi, ' ')
    .replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/gi, '$1')
    .replace(/\[\/?[a-z][a-z0-9]*(?:=[^\]]*)?\]/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface Indexed extends WikiDoc { titleT: Set<string>; kwT: Set<string>; bodyT: Map<string, number>; plain: string }

export class WikiIndex {
  private docs: Indexed[];
  private df = new Map<string, number>();

  constructor(docs: WikiDoc[]) {
    this.docs = docs.map((d) => {
      const plain = plainBBCode(d.content);
      const bodyT = new Map<string, number>();
      for (const t of tokens(plain)) bodyT.set(t, (bodyT.get(t) ?? 0) + 1);
      return { ...d, titleT: new Set(tokens(d.title)), kwT: new Set(tokens(d.keywords ?? '')), bodyT, plain };
    });
    for (const d of this.docs) {
      const seen = new Set<string>([...d.titleT, ...d.kwT, ...d.bodyT.keys()]);
      for (const t of seen) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
  }

  get size() { return this.docs.length; }

  private idf(t: string) {
    return Math.log(1 + this.docs.length / (1 + (this.df.get(t) ?? 0)));
  }

  /** Les articles les plus pertinents pour une question (les plus pertinents d'abord ; ceux sous `minScore` sont ignorés). */
  search(query: string, limit = 5, minScore = 2): WikiHit[] {
    const qt = [...new Set(tokens(query))];
    if (qt.length === 0) return [];
    const hits: WikiHit[] = [];
    for (const d of this.docs) {
      let score = 0;
      let matched = 0;
      for (const t of qt) {
        const w = this.idf(t);
        const prefix = t.length >= 4;
        let s = 0;
        if (d.titleT.has(t)) s += 6;
        else if (prefix && [...d.titleT].some((x) => x.startsWith(t) || (x.length >= 4 && t.startsWith(x)))) s += 3;
        if (d.kwT.has(t)) s += 5;
        else if (prefix && [...d.kwT].some((x) => x.startsWith(t) || (x.length >= 4 && t.startsWith(x)))) s += 2.5;
        const n = d.bodyT.get(t) ?? 0;
        if (n > 0) s += Math.min(n, 3);
        else if (prefix) for (const [x] of d.bodyT) if (x.startsWith(t)) { s += 0.6; break; }
        if (s > 0) matched++;
        score += s * w;
      }
      if (matched === 0) continue;
      // Une question dont plusieurs mots tombent dans le même article vaut plus que de simples coïncidences.
      score *= 0.6 + (0.4 * matched) / qt.length;
      if (d.isFaq) score *= 1.15;
      if (score >= minScore) hits.push({ slug: d.slug, title: d.title, category: d.category, score: Math.round(score * 100) / 100, excerpt: this.excerpt(d, qt) });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Extrait lisible autour du premier mot de la question trouvé dans le texte. */
  private excerpt(d: Indexed, qt: string[]): string {
    const flat = d.plain.replace(/\s+/g, ' ');
    const folded = fold(flat);
    let at = -1;
    for (const t of qt) { const i = folded.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
    const start = at <= 40 ? 0 : at - 40;
    const piece = flat.slice(start, start + 200).trim();
    return `${start > 0 ? '… ' : ''}${piece}${flat.length > start + 200 ? ' …' : ''}`;
  }

  /** Texte d'un article, tronqué : ce qu'on donne à lire à l'assistant. */
  articleText(slug: string, maxChars: number): string | null {
    const d = this.docs.find((x) => x.slug === slug);
    if (!d) return null;
    return d.plain.length > maxChars ? `${d.plain.slice(0, maxChars)} …` : d.plain;
  }
}
