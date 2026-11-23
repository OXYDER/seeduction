import { Link } from 'react-router-dom';

export type TabId = 'nouveautes' | 'populaires' | 'pour-toi' | 'freeleech' | 'a-seeder';
export const TABS: { id: TabId; icon: string; label: string; title: string; sub: string }[] = [
  { id: 'nouveautes', icon: '🆕', label: 'Nouveautés', title: 'Ajoutés récemment', sub: 'Les derniers torrents du site, du plus frais au plus ancien.' },
  { id: 'populaires', icon: '🔥', label: 'Plus populaires', title: 'Les plus populaires', sub: 'Ce que la communauté télécharge et seede le plus.' },
  { id: 'pour-toi', icon: '✨', label: 'Pour toi', title: 'Recommandé pour toi', sub: 'Choisis d’après ce que tu regardes, tes favoris et tes abonnements.' },
  { id: 'freeleech', icon: '🎁', label: 'Freeleech', title: 'Freeleech en ce moment', sub: 'Téléchargements gratuits : ils ne comptent pas dans ton ratio.' },
  { id: 'a-seeder', icon: '🌱', label: 'À seeder', title: 'À seeder', sub: 'Des torrents à 1 ou 2 seeders : un petit seed les sauve et te rapporte des points.' },
];

/**
 * Les rubriques du catalogue (Catalogue complet, Nouveautés, Plus populaires, Pour toi, Freeleech, À seeder), affichées en haut de
 * Découvrir ET du catalogue complet pour passer de l'une à l'autre sans repasser par le menu.
 */
export default function CatalogTabs({ active }: { active: 'catalogue' | TabId }) {
  return (
    <nav className="dc-tabs" aria-label="Rubriques du catalogue">
      <Link to="/browse" className={active === 'catalogue' ? 'on' : ''} aria-current={active === 'catalogue' ? 'page' : undefined}>
        <span aria-hidden="true">📚</span> Catalogue complet
      </Link>
      {TABS.map((t) => (
        <Link key={t.id} to={t.id === 'nouveautes' ? '/decouvrir' : `/decouvrir?s=${t.id}`} className={t.id === active ? 'on' : ''} aria-current={t.id === active ? 'page' : undefined}>
          <span aria-hidden="true">{t.icon}</span> {t.label}
        </Link>
      ))}
    </nav>
  );
}
