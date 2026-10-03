import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { bbcodeToHtml } from '../lib/bbcode';
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

export default function Wiki() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tree, setTree] = useState<WikiCategoryNode[] | null>(null);
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [results, setResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [faqOnly, setFaqOnly] = useState(false);

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

  const faqArticles = useMemo(() => {
    if (!tree) return [];
    return tree.flatMap((c) => c.articles.filter((a) => a.isFaq).map((a) => ({ ...a, category: c })));
  }, [tree]);

  if (!tree) return <div className="grid"><p className="muted">Chargement du wiki...</p></div>;

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 20, alignItems: 'start' }}>
      <div className="panel ornate" style={{ position: 'sticky', top: 12 }}>
        <h3 style={{ marginTop: 0 }}>📖 Wiki</h3>
        <input
          placeholder="Rechercher dans le wiki..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 12, width: '100%' }}
        />
        <nav className="grid" style={{ gap: 4 }}>
          <Link to="/wiki" className={!slug ? 'on' : ''} style={{ fontWeight: !slug && !faqOnly ? 700 : undefined }} onClick={() => setFaqOnly(false)}>
            🏠 Accueil du wiki
          </Link>
          <button
            type="button"
            className="secondary"
            style={{ textAlign: 'left', fontWeight: faqOnly ? 700 : undefined }}
            onClick={() => { setFaqOnly(true); navigate('/wiki'); }}
          >
            ⭐ Foire aux questions
          </button>
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '6px 0' }} />
          {tree.map((c) => (
            <div key={c.id} style={{ marginBottom: 8 }}>
              <div className="muted" style={{ fontSize: 13, fontWeight: 700, margin: '4px 0' }}>{c.icon} {c.name}</div>
              {c.articles.map((a) => (
                <Link
                  key={a.id}
                  to={`/wiki/${a.slug}`}
                  onClick={() => setFaqOnly(false)}
                  style={{ display: 'block', padding: '3px 0 3px 12px', fontSize: 13.5, color: slug === a.slug ? 'var(--acc-link)' : undefined, fontWeight: slug === a.slug ? 700 : undefined }}
                >
                  {a.title}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>

      <div className="grid" style={{ gap: 16 }}>
        {query.trim().length >= 2 ? (
          <SearchResults query={query} searching={searching} results={results} />
        ) : slug ? (
          <WikiArticleView slug={slug} />
        ) : faqOnly ? (
          <FaqView articles={faqArticles} />
        ) : (
          <WikiHome tree={tree} onOpenFaq={() => setFaqOnly(true)} />
        )}
      </div>
    </div>
  );
}

function SearchResults({ query, searching, results }: { query: string; searching: boolean; results: any[] | null }) {
  return (
    <div className="panel">
      <h2>Résultats pour « {query} »</h2>
      {searching && <p className="muted">Recherche...</p>}
      {!searching && results && results.length === 0 && <p className="muted">Aucun article ne correspond à cette recherche.</p>}
      {!searching && results && results.length > 0 && (
        <div className="grid" style={{ gap: 12 }}>
          {results.map((a) => (
            <Link key={a.id} to={`/wiki/${a.slug}`} className="panel ornate" style={{ display: 'block' }}>
              <strong>{a.category?.icon} {a.title}</strong>
              <div className="muted" style={{ fontSize: 12 }}>{a.category?.name}</div>
              <p className="muted" style={{ fontSize: 13, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {a.content.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function WikiHome({ tree, onOpenFaq }: { tree: WikiCategoryNode[]; onOpenFaq: () => void }) {
  return (
    <>
      <div className="panel ornate">
        <h1 style={{ marginTop: 0 }}>📖 Wiki Seeduction</h1>
        <p className="muted">
          Tout ce qu'il faut savoir sur le fonctionnement du site et son règlement : ratio, freeleech, points bonus,
          le lecteur Seeduction, la communauté, et plus. Utilise la recherche ou la <button type="button" style={{ background: 'none', border: 'none', padding: 0, color: 'var(--acc-link)', cursor: 'pointer', font: 'inherit' }} onClick={onOpenFaq}>Foire aux questions</button> pour aller vite.
        </p>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {tree.map((c) => (
          <div key={c.id} className="panel">
            <h3 style={{ marginTop: 0 }}>{c.icon} {c.name}</h3>
            <div className="grid" style={{ gap: 4 }}>
              {c.articles.map((a) => (
                <Link key={a.id} to={`/wiki/${a.slug}`}>{a.isFaq ? '⭐ ' : ''}{a.title}</Link>
              ))}
              {c.articles.length === 0 && <span className="muted" style={{ fontSize: 13 }}>Aucun article pour l'instant.</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function FaqView({ articles }: { articles: any[] }) {
  return (
    <div className="panel">
      <h1 style={{ marginTop: 0 }}>⭐ Foire aux questions</h1>
      <div className="grid" style={{ gap: 10 }}>
        {articles.map((a) => (
          <Link key={a.id} to={`/wiki/${a.slug}`} className="panel ornate" style={{ display: 'block' }}>
            <strong>{a.title}</strong>
            <div className="muted" style={{ fontSize: 12 }}>{a.category.icon} {a.category.name}</div>
          </Link>
        ))}
        {articles.length === 0 && <p className="muted">Aucune question fréquente pour l'instant.</p>}
      </div>
    </div>
  );
}

function WikiArticleView({ slug }: { slug: string }) {
  const [article, setArticle] = useState<any>(null);
  useCrumbTitle(article?.title);
  const [error, setError] = useState('');

  useEffect(() => {
    setArticle(null); setError('');
    api.get(`/wiki/articles/${slug}`)
      .then((r) => setArticle(r.data))
      .catch((err) => setError(err.response?.data?.message ?? 'Article introuvable'));
  }, [slug]);

  if (error) return <div className="panel"><p className="muted">{error}</p><Link to="/wiki">← Retour au wiki</Link></div>;
  if (!article) return <p className="muted">Chargement...</p>;

  return (
    <div className="panel ornate">
      <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
        <Link to="/wiki">📖 Wiki</Link> / {article.category.icon} {article.category.name}
      </div>
      <h1 style={{ marginTop: 0 }}>{article.title}</h1>
      <div className="bbcode-content" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(article.content) }} />
    </div>
  );
}
