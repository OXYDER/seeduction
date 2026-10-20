import { useDeleted } from '../store/deleted';

/** 🗑️ à côté du pseudo d'un compte supprimé : le pseudo, les statistiques et les actions restent, mais le compte n'existe plus. */
export default function DeletedMark({ id }: { id?: string }) {
  const deleted = useDeleted((s) => (id ? s.ids[id] : undefined));
  if (!deleted) return null;
  return <span className="deleted-mark" title="Compte supprimé : le pseudo reste affiché, mais ce compte n'existe plus" aria-label="Compte supprimé">🗑️</span>;
}
