import { Link, useLocation } from 'react-router-dom';
import { useMyUploads } from '../store/myUploads';

/** Icône « Mes envois » à côté des messages privés, seulement pour un membre qui a déjà partagé du contenu ; la bulle compte les torrents à corriger. */
export default function MyUploadsIcon() {
  const { total, hold, rejected, pending } = useMyUploads();
  const location = useLocation();
  if (total === 0) return null;
  const parts = [
    hold > 0 ? `${hold} torrent${hold > 1 ? 's' : ''} à corriger (demande de l'équipe)` : '',
    rejected > 0 ? `${rejected} rejeté${rejected > 1 ? 's' : ''}` : '',
    pending > 0 ? `${pending} en attente de validation` : '',
  ].filter(Boolean);
  const title = parts.length ? `Mes envois : ${parts.join(' · ')}` : 'Mes envois';
  return (
    <Link to="/mes-envois" className={`icon-pill${location.pathname.startsWith('/mes-envois') ? ' active' : ''}`} title={title} aria-label={title}>
      📦{hold > 0 && <span className="dot-badge">{hold > 99 ? '99+' : hold}</span>}
    </Link>
  );
}
