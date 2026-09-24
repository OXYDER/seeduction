import { CATEGORY_STYLE } from './Layout';

interface Cat { name?: string; slug?: string; parent?: { slug?: string; name?: string } | null }

/** Couleur d'une catégorie : celle de sa catégorie principale si c'est une sous-catégorie ; sinon une teinte stable dérivée du nom. */
export function categoryColor(category?: Cat | null): string {
  const slug = category?.parent?.slug ?? category?.slug ?? '';
  const known = CATEGORY_STYLE[slug]?.color;
  if (known) return known;
  let hash = 0;
  for (const ch of slug || 'x') hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${hash}, 72%, 64%)`;
}

/** Pastille de catégorie (icône + nom) sur les affiches : chaque type de contenu a sa couleur, pour s'y retrouver d'un coup d'œil. */
export default function CategoryTag({ category }: { category?: Cat | null }) {
  if (!category?.name) return null;
  const slug = category.parent?.slug ?? category.slug ?? '';
  const icon = CATEGORY_STYLE[slug]?.icon;
  return (
    <span className="cat-tag" style={{ background: categoryColor(category) }} title={category.parent?.name ? `${category.parent.name} › ${category.name}` : category.name}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {category.name}
    </span>
  );
}
