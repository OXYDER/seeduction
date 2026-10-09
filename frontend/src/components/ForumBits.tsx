import Pager from './Pager';
import { Link } from 'react-router-dom';
import UserLink from './UserLink';
import { timeAgo } from '../lib/time';

export interface Crumb { id: string; name: string; isCategory?: boolean }

/** Fil d'Ariane : Forum › Catégorie › Forum › Sous-forum. */
export function Breadcrumb({ crumbs, last }: { crumbs: Crumb[]; last?: string }) {
  return (
    <div className="forum-crumbs">
      <Link to="/forum">Forum</Link>
      {crumbs.map((c) => (
        <span key={c.id}>
          {' › '}
          {c.isCategory ? <Link to="/forum">{c.name}</Link> : <Link to={`/forum/f/${c.id}`}>{c.name}</Link>}
        </span>
      ))}
      {last && <span>{' › '}<strong>{last}</strong></span>}
    </div>
  );
}

/** Pagination « ← Préc. 1 … 4 5 6 … 9 Suiv. → » (même composant que Parcourir) ; rien à afficher s'il n'y a qu'une page. */
export function Pagination({ page, total, pageSize, onPage, unit = 'élément', scrollTop }: { page: number; total: number; pageSize: number; onPage: (p: number) => void; unit?: string; scrollTop?: boolean }) {
  if (Math.ceil(total / pageSize) <= 1) return null;
  return <Pager page={page} total={total} pageSize={pageSize} unit={unit} onPage={onPage} scrollTop={scrollTop} />;
}

/** Cellule « dernier message » : titre du sujet, auteur, date. */
export function LastPostCell({ lastPost }: { lastPost: any }) {
  if (!lastPost) return <span className="muted">—</span>;
  return (
    <div className="forum-lastpost">
      {lastPost.topicTitle && <Link to={`/forum/topics/${lastPost.topicId}`} title={lastPost.topicTitle}>{lastPost.topicTitle}</Link>}
      <div className="muted">
        par <UserLink user={lastPost.author} fallback="?" /> · {timeAgo(lastPost.createdAt)}
      </div>
    </div>
  );
}
