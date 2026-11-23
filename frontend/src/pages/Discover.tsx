import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import TorrentView, { ViewSwitcher } from '../components/TorrentView';
import { InfiniteFooter, ListModeBar } from '../components/InfiniteList';
import { useViewMode } from '../lib/viewMode';
import { useListPrefs } from '../lib/listMode';
import SectionArt, { type ArtKind } from '../components/SectionArt';
import type { LayoutContext } from '../components/Layout';

type TabId = 'nouveautes' | 'populaires' | 'pour-toi' | 'freeleech' | 'a-seeder';
type Period = '' | 'day' | 'week' | 'month';

const TABS: { id: TabId; icon: string; label: string; title: string; sub: string }[] = [
  { id: 'nouveautes', icon: '🆕', label: 'Nouveautés', title: 'Ajoutés récemment', sub: 'Les derniers torrents du site, du plus frais au plus ancien.' },
  { id: 'populaires', icon: '🔥', label: 'Plus populaires', title: 'Les plus populaires', sub: 'Ce que la communauté télécharge et seede le plus.' },
  { id: 'pour-toi', icon: '✨', label: 'Pour toi', title: 'Recommandé pour toi', sub: 'Choisis d’après ce que tu regardes, tes favoris et tes abonnements.' },
  { id: 'freeleech', icon: '🎁', label: 'Freeleech', title: 'Freeleech en ce moment', sub: 'Téléchargements gratuits : ils ne comptent pas dans ton ratio.' },
  { id: 'a-seeder', icon: '🌱', label: 'À seeder', title: 'À seeder', sub: 'Des torrents à 1 ou 2 seeders : un petit seed les sauve et te rapporte des points.' },
];
const ART_OF: Record<TabId, ArtKind> = { nouveautes: 'film', populaires: 'trophy', 'pour-toi': 'medal', freeleech: 'gift', 'a-seeder': 'seed' };
const PERIODS: { value: Period; label: string }[] = [
  { value: '', label: 'Tout' }, { value: 'day', label: '24 heures' }, { value: 'week', label: 'Cette semaine' }, { value: 'month', label: 'Ce mois' },
];

/**
 * Découvrir : nouveautés, plus populaires, recommandations, freeleech, à seeder, avec leurs filtres. La liste s'affiche comme
 * Parcourir (même sélecteur d'affichage : liste, confortable, grille, affiches…) et se charge au fil du défilement.
 */
export default function Discover() {
  const { categories } = useOutletContext<LayoutContext>();
  const [sp, setSp] = useSearchParams();
  const tab = TABS.find((t) => t.id === sp.get('s'))?.id ?? 'nouveautes';
  const meta = TABS.find((t) => t.id === tab)!;
  const [period, setPeriod] = useState<Period>('');
  const [mode, setMode] = useState<'popularite' | 'seeders'>('popularite');
  const [cat, setCat] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const [view, setView] = useViewMode('discover');
  const [prefs, setPrefs] = useListPrefs();
  const size = prefs.size;
  // Chaque combinaison onglet / filtres / taille de lot a son propre compteur de lots : un changement repart du premier.
  const key = `${tab}|${period}|${mode}|${cat}|${size}|${prefs.infinite}`;
  const [lots, setLots] = useState({ key: '', n: 1 });
  const page = lots.key === key ? lots.n : 1;
  useEffect(() => { setLots((cur) => (cur.key === key ? cur : { key, n: 1 })); }, [key]);

  useEffect(() => {
    const id = ++seq.current;
    setLoading(true);
    const done = (list: any[], n: number, append: boolean) => { if (id !== seq.current) return; setItems((cur) => (append ? [...cur, ...list] : list)); setTotal(n); setLoading(false); };
    const fail = () => { if (id === seq.current) { setItems([]); setTotal(0); setLoading(false); } };
    if (tab === 'pour-toi') {
      api.get('/torrents/mine/recommended', { params: { limit: 60 } }).then((r) => done(r.data, r.data.length, false)).catch(fail);
      return;
    }
    const params: Record<string, string | number> = { page, pageSize: size, sort: 'date' };
    if (tab === 'populaires') params.sort = mode;
    if (tab === 'freeleech') params.freeleech = 'true';
    if (tab === 'a-seeder') { params.minSeeders = 1; params.maxSeeders = 2; params.sort = 'seeders'; params.order = 'asc'; }
    if (period && (tab === 'nouveautes' || tab === 'populaires')) params.period = period;
    if (cat) params.categoryId = cat;
    api.get('/torrents', { params }).then((r) => done(r.data.items, r.data.total, page > 1)).catch(fail);
  }, [tab, period, mode, cat, page, size]);

  const showPeriod = tab === 'nouveautes' || tab === 'populaires';
  const showCats = tab !== 'pour-toi';

  return (
    <div className="dc">
      <header className="dc-head">
        <SectionArt kind={ART_OF[tab]} />
        <div>
          <h1><span aria-hidden="true">{meta.icon}</span> {meta.title}</h1>
          <p className="muted">{meta.sub}</p>
        </div>
        <Link to="/browse" className="dc-all">Recherche avancée →</Link>
      </header>

      <nav className="dc-tabs" aria-label="Rubriques">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={t.id === tab ? 'on' : ''} onClick={() => setSp(t.id === 'nouveautes' ? {} : { s: t.id }, { replace: true })} aria-current={t.id === tab ? 'page' : undefined}>
            <span aria-hidden="true">{t.icon}</span> {t.label}
          </button>
        ))}
      </nav>

      <div className="dc-filters">
        {tab === 'populaires' && (
          <div className="dc-seg" role="group" aria-label="Classement">
            <button type="button" className={mode === 'popularite' ? 'on' : ''} onClick={() => setMode('popularite')}>Les plus téléchargés</button>
            <button type="button" className={mode === 'seeders' ? 'on' : ''} onClick={() => setMode('seeders')}>Les plus seedés</button>
          </div>
        )}
        {showPeriod && (
          <div className="dc-seg" role="group" aria-label="Période">
            {PERIODS.map((p) => <button key={p.value} type="button" className={period === p.value ? 'on' : ''} onClick={() => setPeriod(p.value)}>{p.label}</button>)}
          </div>
        )}
        {showCats && categories.length > 0 && (
          <div className="dc-seg dc-cats" role="group" aria-label="Catégorie">
            <button type="button" className={cat === '' ? 'on' : ''} onClick={() => setCat('')}>Toutes</button>
            {categories.slice(0, 10).map((c) => <button key={c.id} type="button" className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.name}</button>)}
          </div>
        )}
        {!loading && tab !== 'pour-toi' && <span className="dc-count muted">{total} résultat{total > 1 ? 's' : ''}</span>}
        <div className="dc-tools">
          <ViewSwitcher value={view} onChange={setView} modes={['list', 'comfortable', 'details', 'grid', 'posters', 'compact']} />
          {tab !== 'pour-toi' && <ListModeBar prefs={prefs} onChange={setPrefs} manual />}
        </div>
      </div>

      {items.length > 0 && <div className="dc-list" key={`${tab}-${period}-${mode}-${cat}-${view}`}><TorrentView items={items} view={view} hideSummary /></div>}
      {loading && items.length === 0 && <div className="dc-grid">{Array.from({ length: 12 }, (_, i) => <span key={i} className="skeleton-card"><span className="skeleton-poster" /><span className="skeleton-line" /></span>)}</div>}

      {!loading && items.length === 0 && (
        <div className="dc-empty panel">
          <div aria-hidden="true" style={{ fontSize: 34 }}>{meta.icon}</div>
          <strong>{tab === 'pour-toi' ? 'Pas encore de recommandations' : 'Rien à afficher ici pour le moment'}</strong>
          <span className="muted">{tab === 'pour-toi' ? 'Télécharge et ajoute quelques favoris : les suggestions apparaîtront ici.' : 'Essaie un autre filtre ou une autre période.'}</span>
        </div>
      )}
      {tab !== 'pour-toi' && items.length > 0 && (prefs.infinite
        ? <InfiniteFooter shown={items.length} total={total} loading={loading} onMore={() => setLots({ key, n: page + 1 })} />
        : items.length < total && <div className="dc-more"><button type="button" className="secondary" disabled={loading} onClick={() => setLots({ key, n: page + 1 })}>{loading ? 'Chargement…' : `Voir plus (${total - items.length})`}</button></div>)}
    </div>
  );
}
