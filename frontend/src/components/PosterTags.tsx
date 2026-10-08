import MetaChips from './MetaChips';

/**
 * Pastilles d'information au bas d'une affiche, sur un léger dégradé : au repos une seule ligne (date, langue, épisode, résolution, source),
 * au survol toutes les informations. L'overlay ne capte pas la souris : l'affiche reste cliquable partout.
 */
export default function PosterTags({ t }: { t: any }) {
  return (
    <div className="poster-tags">
      <MetaChips t={t} limit={4} className="pt-min" />
      <MetaChips t={t} className="pt-all" explicitEpisode />
    </div>
  );
}
