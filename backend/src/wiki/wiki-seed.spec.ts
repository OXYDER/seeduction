import { WIKI_SEED } from './wiki-seed';

const ROUTES = new Set(['/browse', '/upload', '/profile', '/player', '/pot', '/integrations', '/wiki', '/bonus', '/hit-and-run', '/seeds', '/activity', '/dead', '/stats', '/support', '/news', '/teams', '/forum', '/requests', '/friends', '/chat', '/messages', '/favorites', '/collections', '/family', '/roadmap', '/leaderboard']);
const all = WIKI_SEED.flatMap((c) => c.articles.map((a) => ({ ...a, category: c.slug })));

describe('contenu du wiki et des guides', () => {
  it('chaque article a un identifiant (slug) unique', () => {
    const seen = new Set<string>();
    const dup = all.filter((a) => (seen.has(a.slug) ? true : (seen.add(a.slug), false))).map((a) => a.slug);
    expect(dup).toEqual([]);
  });

  it('chaque lien vers un autre article du wiki mène à un article qui existe', () => {
    const slugs = new Set(all.map((a) => a.slug));
    const broken: string[] = [];
    for (const a of all) for (const m of a.content.matchAll(/\[url=\/wiki\/([a-z0-9-]+)\]/g)) if (!slugs.has(m[1])) broken.push(`${a.slug} -> ${m[1]}`);
    expect(broken).toEqual([]);
  });

  it('chaque lien vers une page du site mène à une page qui existe', () => {
    const broken: string[] = [];
    for (const a of all) for (const m of a.content.matchAll(/\[url=(\/[a-z0-9-]*)\]/g)) if (!ROUTES.has(m[1])) broken.push(`${a.slug} -> ${m[1]}`);
    expect(broken).toEqual([]);
  });

  it('les balises de mise en forme sont bien fermées', () => {
    const bad: string[] = [];
    for (const a of all) {
      for (const tag of ['b', 'i', 'code', 'url']) {
        const open = (a.content.match(new RegExp(`\\[${tag}(=[^\\]]*)?\\]`, 'g')) ?? []).length;
        const close = (a.content.match(new RegExp(`\\[/${tag}\\]`, 'g')) ?? []).length;
        if (open !== close) bad.push(`${a.slug} : [${tag}] ${open} ouvertes / ${close} fermées`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('aucun reste de code dans les textes (${…}) et aucun saut de ligne dans un bloc de code', () => {
    const bad = all.filter((a) => /\$\{/.test(a.content) || /\[code\][^\]]*\n[^\]]*\[\/code\]/.test(a.content)).map((a) => a.slug);
    expect(bad).toEqual([]);
  });

  it('les guides sont découpés en sections (titres en gras) pour le sommaire', () => {
    const HEAD = /^\[b\]([^\[\]\n]{2,90}?)\[\/b\]([ \t]*\([^)\n]{0,70}\))?[ \t]*(:[ \t]*|\n|$)/;
    const poor: string[] = [];
    for (const c of WIKI_SEED.filter((x) => x.slug.startsWith('guides-'))) {
      for (const a of c.articles) {
        const blocks = a.content.split(/\n{2,}/);
        const heads = blocks.filter((b) => HEAD.test(b.trim())).length;
        if (a.slug !== 'guides' && heads < 3) poor.push(`${a.slug} : ${heads} section(s)`);
      }
    }
    expect(poor).toEqual([]);
  });

  it('les guides listés dans le sommaire existent tous, et le sommaire les cite tous', () => {
    const index = all.find((a) => a.slug === 'guides')!;
    const cited = new Set([...index.content.matchAll(/\[url=\/wiki\/([a-z0-9-]+)\]/g)].map((m) => m[1]));
    const guides = all.filter((a) => a.category.startsWith('guides-') && a.slug !== 'guides').map((a) => a.slug);
    const missing = guides.filter((g) => !cited.has(g));
    expect(missing).toEqual([]);
  });

  it('le texte {SITE} (remplacé à l\'affichage par l\'adresse du site) est écrit exactement ainsi', () => {
    const bad = all.filter((a) => /\{site\}|\{Site\}|\{SITE_URL\}/.test(a.content)).map((a) => a.slug);
    expect(bad).toEqual([]);
  });
});
