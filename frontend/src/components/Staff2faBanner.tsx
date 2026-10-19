import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];

/** Bandeau pour une personne de l'équipe sans 2FA quand l'administration l'a rendue obligatoire. */
export default function Staff2faBanner() {
  const role = useAuthStore((s) => s.user?.role ?? '');
  const token = useAuthStore((s) => s.accessToken);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!token || !STAFF.includes(role)) { setMissing(false); return; }
    api.get('/auth/staff-2fa').then((r) => setMissing(r.data.required && !r.data.enabled)).catch(() => setMissing(false));
  }, [token, role]);
  if (!missing) return null;
  return (
    <div className="panel" role="alert" style={{ borderColor: 'var(--danger)', marginBottom: 12 }}>
      🔐 <strong>La double authentification est obligatoire pour l'équipe.</strong> Tant qu'elle n'est pas activée, les outils de l'équipe (modération, administration, courriel) restent fermés.{' '}
      <Link to="/profile">Activer la 2FA dans Profil &gt; Sécurité →</Link>
    </div>
  );
}
