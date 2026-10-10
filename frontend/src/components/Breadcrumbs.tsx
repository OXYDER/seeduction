import { Link, useLocation, matchPath } from 'react-router-dom';
import { useCrumbStore, type Crumb } from '../store/crumbs';

interface Node { path: string; label: string; parent?: string }

/** Arbre des sections du site : chaque page connaît son parent. Les pages de détail complètent leur libellé via useCrumbTitle. */
const NODES: Node[] = [
  { path: '/browse', label: 'Parcourir' },
  { path: '/torrents/:id', label: 'Torrent', parent: '/browse' },
  { path: '/entities/:id', label: 'Fiche', parent: '/browse' },
  { path: '/news', label: 'Nouvelles' },
  { path: '/news/:id', label: 'Nouvelle', parent: '/news' },
  { path: '/upload', label: 'Envoyer' },
  { path: '/requests', label: 'Demandes' },
  { path: '/favorites', label: 'Favoris' },
  { path: '/collections', label: 'Collections' },
  { path: '/collections/:id', label: 'Collection', parent: '/collections' },
  { path: '/friends', label: 'Amis' },
  { path: '/messages', label: 'Messages' },
  { path: '/teams', label: 'Teams' },
  { path: '/teams/:id', label: 'Team', parent: '/teams' },
  { path: '/team/:slug', label: 'Team', parent: '/teams' },
  { path: '/chat', label: 'Chat' },
  { path: '/forum', label: 'Forums' },
  { path: '/forum/f/:id', label: 'Forum', parent: '/forum' },
  { path: '/forum/latest', label: 'Derniers messages', parent: '/forum' },
  { path: '/forum/search', label: 'Recherche', parent: '/forum' },
  { path: '/forum/topics/:id', label: 'Sujet', parent: '/forum' },
  { path: '/stats', label: 'Stats' },
  { path: '/dead', label: 'Réanimation', parent: '/stats' },
  { path: '/leaderboard', label: 'Classement', parent: '/stats' },
  { path: '/hall-of-fame', label: 'Hall of Fame', parent: '/stats' },
  { path: '/support', label: 'Support' },
  { path: '/support/new', label: 'Nouveau billet', parent: '/support' },
  { path: '/support/:id', label: 'Billet', parent: '/support' },
  { path: '/integrations', label: 'API & flux RSS' },
  { path: '/wiki', label: 'Wiki' },
  { path: '/wiki/:slug', label: 'Article', parent: '/wiki' },
  { path: '/bonus', label: 'Points bonus' },
  { path: '/activity', label: 'Mon activité' },
  { path: '/seeds', label: 'Mes seeds' },
  { path: '/hit-and-run', label: 'Hit & run' },
  { path: '/profile', label: 'Mon profil' },
  { path: '/users/:id', label: 'Profil' },
  { path: '/family', label: 'Compte famille', parent: '/profile' },
  { path: '/player', label: 'Lecteur Seeduction' },
  { path: '/roadmap', label: 'Roadmap' },
  { path: '/moderation', label: 'Modération' },
  { path: '/admin', label: 'Staff' },
];

const byPath = new Map(NODES.map((n) => [n.path, n]));

/** Fil d'Ariane : où je suis dans le site et comment remonter, en haut de chaque page (sauf l'accueil). */
export default function Breadcrumbs() {
  const { pathname } = useLocation();
  const dyn = useCrumbStore();
  if (pathname === '/') return null;

  const node = NODES.find((n) => matchPath({ path: n.path, end: true }, pathname));
  if (!node) return null;

  // Du plus profond au plus haut, puis on inverse.
  const chain: Crumb[] = [];
  const dynamic = dyn.path === pathname ? dyn : null;
  chain.push({ label: dynamic?.title || node.label });
  if (dynamic) for (const p of [...dynamic.parents].reverse()) chain.push(p);
  for (let p = node.parent ? byPath.get(node.parent) : undefined; p; p = p.parent ? byPath.get(p.parent) : undefined) chain.push({ label: p.label, to: p.path });
  chain.push({ label: 'Accueil', to: '/' });
  const crumbs = chain.reverse();

  return (
    <nav className="breadcrumbs" aria-label="Fil d'Ariane">
      <ol>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${i}-${c.label}`} className={last ? 'current' : undefined} aria-current={last ? 'page' : undefined}>
              {c.to && !last ? <Link to={c.to}>{i === 0 ? <span aria-hidden>🏠 </span> : null}{c.label}</Link> : <span title={c.label}>{c.label}</span>}
              {!last && <span className="crumb-sep" aria-hidden>›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
