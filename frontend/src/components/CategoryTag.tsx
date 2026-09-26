import { useNavigate } from 'react-router-dom';
import { CATEGORY_STYLE } from './Layout';

interface Cat { id?: string; name?: string; slug?: string; parent?: { slug?: string; name?: string } | null }

/** Couleur d'une catégorie : celle de sa catégorie principale si c'est une sous-catégorie ; sinon une teinte stable dérivée du nom. */
export function categoryColor(category?: Cat | null): string {
  const slug = category?.parent?.slug ?? category?.slug ?? '';
  const known = CATEGORY_STYLE[slug]?.color;
  if (known) return known;
  let hash = 0;
  for (const ch of slug || 'x') hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${hash}, 72%, 64%)`;
}

/**
 * Pastille de catégorie (icône + nom) sur les affiches : chaque type de contenu a sa couleur, pour s'y retrouver
 * d'un coup d'œil. Cliquable (quand on connaît son id) : ouvre la liste des torrents de cette catégorie, même
 * quand la pastille est affichée à l'intérieur d'une carte elle-même cliquable (fiche du torrent) — on empêche
 * alors ce clic de déclencher aussi la navigation de la carte.
 */
export default function CategoryTag({ category }: { category?: Cat | null }) {
  const navigate = useNavigate();
  if (!category?.name) return null;
  const slug = category.parent?.slug ?? category.slug ?? '';
  const icon = CATEGORY_STYLE[slug]?.icon;
  const goToCategory = category.id
    ? (e: React.SyntheticEvent) => {
        e.preventDefault();
        e.stopPropagation();
        navigate(`/browse?categoryId=${category.id}`);
      }
    : undefined;
  return (
    <span
      className="cat-tag"
      style={{ background: categoryColor(category), cursor: goToCategory ? 'pointer' : undefined }}
      title={category.parent?.name ? `${category.parent.name} › ${category.name}` : category.name}
      role={goToCategory ? 'link' : undefined}
      tabIndex={goToCategory ? 0 : undefined}
      onClick={goToCategory}
      onKeyDown={goToCategory ? (e) => { if (e.key === 'Enter' || e.key === ' ') goToCategory(e); } : undefined}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {category.name}
    </span>
  );
}
