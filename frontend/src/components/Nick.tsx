import { useRanks, rankClass } from '../store/ranks';
import { ProfileName } from './UserLink';

/** Pseudo en texte simple, dans la couleur de son rang (pour les classements et listes qui n'ont pas de lien vers le profil). Par identifiant si on l'a, sinon par pseudo. */
export default function Nick({ id, name }: { id?: string; name: string }) {
  const rank = useRanks((s) => (id ? s.ranks[id] : undefined) ?? s.byName[String(name ?? '').toLowerCase()]);
  return <span className={`nick${rankClass(rank)}`}><ProfileName username={name} /></span>;
}
