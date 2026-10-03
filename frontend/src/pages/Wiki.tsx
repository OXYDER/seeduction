import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { bbcodeToHtml } from '../lib/bbcode';
import { plainText, readingMinutes, snippet, splitWiki, type WikiSection } from '../lib/wikiSections';
import { useCrumbTitle } from '../store/crumbs';

interface WikiArticleListItem {
  id: string;
  categoryId: string;
  title: string;
  slug: string;
  isFaq: boolean;
}

interface WikiCategoryNode {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  articles: WikiArticleListItem[];
}

/** Wiki : navigation par catégories repliables, recherche avec extraits, articles découpés en sections avec table des matières. */
export default function Wiki() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const [tree, setTree] = useState<WikiCategoryNode[] | null>(null);
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [results, setResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [view, setView] = useState<'home' | 'faq'>('home');
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [navOpen, setNavOpen] = useState(false); // téléphone : le menu est replié pour ne pas pousser l'article hors de l'écran
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setNavOpen(false); }, [slug]);

  useEffect(() => { api.get('/wiki').then((r) => setTree(r.data)); }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(null); return; }
    setSearching(true);
    const handle = setTimeout(() => {
      api.get('/wiki/search', { params: { q } })
        .then((r) => setResults(r.data))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  // « / » met le curseur dans la recherche, comme sur la plupart des documentations.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(el.tagName) && !el.isContentEditable) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const flat = useMemo(() => (tree ?? []).flatMap((c) => c.articles.map((a) => ({ ...a, category: c }))), [tree]);
  const faqArticles = useMemo(() => flat.filter((a) => a.isFaq), [flat]);
  const currentCat = slug ? flat.find((a) => a.slug === slug)?.category.id : undefined;

  // La catégorie de l'article ouvert est toujours dépliée dans le menu.
  useEffect(() => { if (currentCat) setOpenCats((s) => (s.has(currentCat) ? s : new Set(s).add(currentCat))); }, [currentCat]);

  if (!tree) return <div className="grid"><p className="muted">Chargement du wiki...</p></div>;

  const toggleCat = (id: string) => setOpenCats((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const searching2 = query.trim().length >= 2;

  return (
    <div className="wiki-layout">
      <aside className={`wiki-side panel ornate${navOpen ? ' nav-open' : ''}`}>
        <div className="wiki-side-head">
          <h3 style={{ margin: 0 }}>📖 Wiki</h3>
          <button type="button" className="secondary wiki-nav-toggle" aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}>{navOpen ? 'Fermer le menu' : '☰ Tous les articles'}</button>
        </div>
        <div className="wiki-search">
          <input ref={searchRef} placeholder="Rechercher…  ( / )" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher dans le wiki" />
          {query && <button type="button" className="wiki-clear" onClick={() => setQuery('')} aria-label="Effacer la recherche">×</button>}
        </div>
        <nav className="wiki-nav">
          <Link to="/wiki" className={`wiki-nav-link${!slug && view === 'home' ? ' on' : ''}`} onClick={() => { setView('home'); setQuery(''); }}>🏠 Accueil du wiki</Link>
          <Link to="/wiki" className={`wiki-nav-link${!slug && view === 'faq' ? ' on' : ''}`} onClick={() => { setView('faq'); setQuery(''); }}>⭐ Questions fréquentes <span className="wiki-count">{faqArticles.length}</span></Link>
          <div className="wiki-sep" />
          {tree.map((c) => {
            const open = openCats.has(c.id);
            return (
              <div key={c.id} className="wiki-cat">
                <button type="button" className="wiki-cat-head" aria-expanded={open} onClick={() => toggleCat(c.id)}>
                  <span className="wiki-chevron" aria-hidden>{open ? '▾' : '▸'}</span>
                  <span>{c.icon} {c.name}</span>
                  <span className="wiki-count">{c.articles.length}</span>
                </button>
                {open && (
                  <div className="wiki-cat-items">
                    {c.articles.map((a) => (
                      <Link key={a.id} to={`/wiki/${a.slug}`} className={`wiki-item${slug === a.slug ? ' on' : ''}`} onClick={() => setQuery('')}>{a.isFaq ? '⭐ ' : ''}{a.title}</Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="wiki-main">
        {searching2 ? (
          <SearchResults query={query.trim()} searching={searching} results={results} onPick={() => setQuery('')} />
        ) : slug ? (
          <WikiArticleView slug={slug} flat={flat} />
        ) : view === 'faq' ? (
          <FaqView articles={faqArticles} />
        ) : (
          <WikiHome tree={tree} faq={faqArticles} query={query} onQuery={setQuery} onOpenFaq={() => setView('faq')} />
        )}
      </div>
    </div>
  );
}

function SearchResults({ query, searching, results, onPick }: { query: string; searching: boolean; results: any[] | null; onPick: () => void }) {
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Résultats pour « {query} »</h2>
      {searching && <p className="muted">Recherche...</p>}
      {!searching && results && results.length === 0 && <p className="muted">Aucun article ne correspond à cette recherche. Essaie un mot plus simple (« ratio », « seed », « invitation »).</p>}
      {!searching && results && results.length > 0 && (
        <div className="grid" style={{ gap: 10 }}>
          <span className="muted" style={{ fontSize: 13 }}>{results.length} article{results.length > 1 ? 's' : ''}</span>
          {results.map((a) => {
            const s = snippet(a.content, query);
            return (
              <Link key={a.id} to={`/wiki/${a.slug}`} onClick={onPick} className="wiki-result">
                <strong>{a.category?.icon} {a.title}</strong>
                <span className="muted" style={{ fontSize: 12 }}> · {a.category?.name}</span>
                <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>{s.before}{s.hit && <mark>{s.hit}</mark>}{s.after}</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WikiHome({ tree, faq, query, onQuery, onOpenFaq }: { tree: WikiCategoryNode[]; faq: (WikiArticleListItem & { category: WikiCategoryNode })[]; query: string; onQuery: (q: string) => void; onOpenFaq: () => void }) {
  const total = tree.reduce((n, c) => n + c.articles.length, 0);
  return (
    <>
      <div className="panel ornate wiki-hero">
        <h1 style={{ marginTop: 0 }}>📖 Wiki Seeduction</h1>
        <p className="muted" style={{ marginTop: 0 }}>Une question ? Tape quelques mots, ou choisis un thème ci-dessous. {total} articles, chacun découpé en petites sections.</p>
        <input className="wiki-hero-search" placeholder="Que cherches-tu ? (ratio, hit & run, invitation, lecteur…)" value={query} onChange={(e) => onQuery(e.target.value)} aria-label="Rechercher dans le wiki" />
      </div>

      {faq.length > 0 && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>⭐ Les questions qu'on nous pose le plus</h3>
            <button type="button" className="secondary" onClick={onOpenFaq}>Tout voir ({faq.length})</button>
          </div>
          <div className="wiki-chips">
            {faq.slice(0, 8).map((a) => <Link key={a.id} to={`/wiki/${a.slug}`} className="wiki-chip">{a.title}</Link>)}
          </div>
        </div>
      )}

      <div className="wiki-cards">
        {tree.map((c) => (
          <div key={c.id} className="panel wiki-card">
            <h3 style={{ marginTop: 0 }}>{c.icon} {c.name} <span className="wiki-count">{c.articles.length}</span></h3>
            <div className="grid" style={{ gap: 2 }}>
              {c.articles.map((a) => <Link key={a.id} to={`/wiki/${a.slug}`}>{a.isFaq ? '⭐ ' : ''}{a.title}</Link>)}
              {c.articles.length === 0 && <span className="muted" style={{ fontSize: 13 }}>Aucun article pour l'instant.</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function FaqView({ articles }: { articles: (WikiArticleListItem & { category: WikiCategoryNode })[] }) {
  return (
    <div className="panel">
      <h1 style={{ marginTop: 0 }}>⭐ Questions fréquentes</h1>
      <div className="grid" style={{ gap: 8 }}>
        {articles.map((a) => (
          <Link key={a.id} to={`/wiki/${a.slug}`} className="wiki-result">
            <strong>{a.title}</strong>
            <div className="muted" style={{ fontSize: 12 }}>{a.category.icon} {a.category.name}</div>
          </Link>
        ))}
        {articles.length === 0 && <p className="muted">Aucune question fréquente pour l'instant.</p>}
      </div>
    </div>
  );
}

function WikiArticleView({ slug, flat }: { slug: string; flat: (WikiArticleListItem & { category: WikiCategoryNode })[] }) {
  const [article, setArticle] = useState<any>(null);
  useCrumbTitle(article?.title);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    setArticle(null); setError('');
    api.get(`/wiki/articles/${slug}`)
      .then((r) => setArticle(r.data))
      .catch((err) => setError(err.response?.data?.message ?? 'Article introuvable'));
  }, [slug]);

  const parts = useMemo(() => {
    if (!article) return { intro: '', sections: [] as WikiSection[] };
    const p = splitWiki(article.content);
    // Une introduction longue ou en liste n'est pas un « chapeau » : elle devient la première section.
    if (p.intro && (p.intro.length > 450 || /(^|\n)• /.test(p.intro))) {
      return { intro: '', sections: [{ id: 's0', title: 'En bref', body: p.intro }, ...p.sections] };
    }
    return p;
  }, [article]);

  // Court : tout est ouvert. Long : seule la première section l'est, la table des matières sert à naviguer.
  useEffect(() => {
    if (!article) return;
    const ids = parts.sections.map((s) => s.id);
    const wanted = window.location.hash.replace('#', '');
    setOpen(new Set(parts.sections.length > 4 ? [wanted && ids.includes(wanted) ? wanted : ids[0]].filter(Boolean) : ids));
    window.scrollTo({ top: 0 });
    if (wanted) setTimeout(() => document.getElementById(wanted)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }, [article, parts]);

  if (error) return <div className="panel"><p className="muted">{error}</p><Link to="/wiki">← Retour au wiki</Link></div>;
  if (!article) return <p className="muted">Chargement...</p>;

  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const jump = (id: string) => {
    setOpen((s) => new Set(s).add(id));
    history.replaceState(null, '', `#${id}`);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };
  const allOpen = parts.sections.length > 0 && open.size === parts.sections.length;

  const idx = flat.findIndex((a) => a.slug === slug);
  const prev = idx > 0 && flat[idx - 1].categoryId === flat[idx].categoryId ? flat[idx - 1] : null;
  const next = idx >= 0 && idx < flat.length - 1 && flat[idx + 1].categoryId === flat[idx].categoryId ? flat[idx + 1] : null;
  const related = flat.filter((a) => a.categoryId === article.categoryId && a.slug !== slug).slice(0, 5);
  const minutes = readingMinutes(article.content);

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="panel ornate">
        <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
          <Link to="/wiki">📖 Wiki</Link> / {article.category.icon} {article.category.name}
        </div>
        <h1 style={{ margin: '0 0 6px' }}>{article.title}</h1>
        <div className="wiki-meta">
          <span>⏱️ ≈ {minutes} min de lecture</span>
          {parts.sections.length > 1 && <span>📑 {parts.sections.length} sections</span>}
          {article.isFaq && <span>⭐ Question fréquente</span>}
        </div>
        {parts.intro && <div className="bbcode-content wiki-lead" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(parts.intro) }} />}

        {parts.sections.length > 1 && (
          <nav className="wiki-toc" aria-label="Sur cette page">
            <div className="wiki-toc-head">
              <strong>Sur cette page</strong>
              <button type="button" className="secondary" onClick={() => setOpen(allOpen ? new Set() : new Set(parts.sections.map((s) => s.id)))}>{allOpen ? 'Tout replier' : 'Tout déplier'}</button>
            </div>
            <ol>
              {parts.sections.map((s) => <li key={s.id}><button type="button" onClick={() => jump(s.id)}>{plainText(s.title)}</button></li>)}
            </ol>
          </nav>
        )}
      </div>

      {parts.sections.map((s) => {
        const isOpen = open.has(s.id);
        return (
          <section key={s.id} id={s.id} className={`panel wiki-section${isOpen ? ' open' : ''}`}>
            <button type="button" className="wiki-section-head" aria-expanded={isOpen} onClick={() => toggle(s.id)}>
              <span className="wiki-chevron" aria-hidden>{isOpen ? '▾' : '▸'}</span>
              <h2>{plainText(s.title)}</h2>
            </button>
            {isOpen && s.body && <div className="bbcode-content wiki-body" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(s.body) }} />}
          </section>
        );
      })}

      {parts.sections.length === 0 && !parts.intro && <div className="panel"><p className="muted">Cet article est vide.</p></div>}

      {(prev || next) && (
        <div className="wiki-prevnext">
          {prev ? <Link to={`/wiki/${prev.slug}`} className="panel"><span className="muted">← Précédent</span><strong>{prev.title}</strong></Link> : <span />}
          {next ? <Link to={`/wiki/${next.slug}`} className="panel" style={{ textAlign: 'right' }}><span className="muted">Suivant →</span><strong>{next.title}</strong></Link> : <span />}
        </div>
      )}

      {related.length > 0 && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Dans la même catégorie</h3>
          <div className="wiki-chips">{related.map((a) => <Link key={a.id} to={`/wiki/${a.slug}`} className="wiki-chip">{a.title}</Link>)}</div>
        </div>
      )}
    </div>
  );
}
