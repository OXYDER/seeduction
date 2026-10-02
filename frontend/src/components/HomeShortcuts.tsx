import { Link, useOutletContext } from 'react-router-dom';
import { useMessenger, privateUnreadOf, publicUnreadOf } from '../store/messenger';
import { CATEGORY_STYLE, type LayoutContext } from './Layout';

const TILES: { to: string; icon: string; label: string; hint: string }[] = [
  { to: '/browse', icon: '🔍', label: 'Parcourir', hint: 'Tout le catalogue' },
  { to: '/upload', icon: '⬆️', label: 'Envoyer', hint: 'Partager un torrent' },
  { to: '/requests', icon: '🙋', label: 'Demandes', hint: 'Ce que la communauté cherche' },
  { to: '/favorites', icon: '⭐', label: 'Ma liste', hint: 'À télécharger plus tard' },
  { to: '/collections', icon: '📚', label: 'Collections', hint: 'Sagas et sélections' },
  { to: '/chat', icon: '💬', label: 'Chat', hint: 'Messages et canaux' },
  { to: '/forum', icon: '👥', label: 'Forum', hint: 'Discussions' },
  { to: '/news', icon: '📰', label: 'Nouvelles', hint: 'Annonces du site' },
];

/** Accès rapides de l'accueil : grosses tuiles vers les sections utiles (avec les non-lus du chat) et raccourcis par catégorie. */
export default function HomeShortcuts({ canUpload = true }: { canUpload?: boolean }) {
  const { categories } = useOutletContext<LayoutContext>();
  const priv = useMessenger((s) => privateUnreadOf(s.conversations));
  const pub = useMessenger((s) => publicUnreadOf(s.conversations));

  return (
    <section className="home-shortcuts" aria-label="Accès rapides">
      <div className="hs-tiles">
        {TILES.filter((t) => canUpload || t.to !== '/upload').map((t) => (
          <Link key={t.to} to={t.to} className="hs-tile">
            <span className="hs-icon" aria-hidden="true">{t.icon}</span>
            <span className="hs-text"><strong>{t.label}</strong><small>{t.hint}</small></span>
            {t.to === '/chat' && priv > 0 && <span className="hs-badge">{priv}</span>}
            {t.to === '/chat' && pub > 0 && <span className="hs-badge outline"># {pub}</span>}
          </Link>
        ))}
      </div>
      {categories?.length > 0 && (
        <div className="hs-cats">
          {categories.map((c) => {
            const style = CATEGORY_STYLE[c.slug];
            return <Link key={c.id} to={`/browse?categoryId=${c.id}`} className="hs-cat" style={style ? { borderColor: `${style.color}66` } : undefined}>{style?.icon ?? '📁'} {c.name}</Link>;
          })}
        </div>
      )}
    </section>
  );
}
