import { useDonors } from '../store/donors';

/** ❤️ à côté du pseudo d'un donateur actif, 🤍 pour un ancien donateur (statut jamais retiré). */
export default function DonorMark({ id }: { id?: string }) {
  const active = useDonors((s) => (id ? s.donors[id] : undefined));
  if (active === undefined) return null;
  return <span className={`donor-mark${active ? '' : ' past'}`} title={active ? 'Donateur ❤️ : merci de soutenir Seeduction' : 'Ancien donateur : merci d\'avoir soutenu Seeduction'} aria-label={active ? 'Donateur' : 'Ancien donateur'}>{active ? '❤️' : '🤍'}</span>;
}
