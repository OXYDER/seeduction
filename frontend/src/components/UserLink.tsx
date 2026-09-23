import { Link } from 'react-router-dom';

/** Pseudo cliquable vers le profil du membre (texte simple si on n'a pas son identifiant). */
export default function UserLink({ user, fallback = '' }: { user?: { id?: string; username?: string } | null; fallback?: string }) {
  if (!user?.username) return <>{fallback}</>;
  if (!user.id) return <>{user.username}</>;
  return (
    <Link to={`/users/${user.id}`} onClick={(e) => e.stopPropagation()} className="user-link">
      {user.username}
    </Link>
  );
}
