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

/** Pagination « 1 2 3 … 9 » avec précédent / suivant. */
export function Pagination({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const shown = new Set([1, pages, page - 1, page, page + 1]);
  const list = [...shown].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  return (
    <div className="forum-pager">
      <button type="button" className="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
      {list.map((p, i) => (
        <span key={p}>
          {i > 0 && p - list[i - 1] > 1 && <span className="muted"> … </span>}
          <button type="button" className={p === page ? '' : 'secondary'} onClick={() => onPage(p)}>{p}</button>
        </span>
      ))}
      <button type="button" className="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>›</button>
      <span className="muted" style={{ marginLeft: 8 }}>{total} élément(s)</span>
    </div>
  );
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
