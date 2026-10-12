import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../api/client';

/** Lien d'un @pseudo (chat, forum, commentaires...) : retrouve le membre et ouvre son profil. */
export default function UserByName() {
  const { username } = useParams();
  const [id, setId] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { api.get(`/users/by-name/${encodeURIComponent(username ?? '')}`).then((r) => setId(r.data.id)).catch(() => setMissing(true)); }, [username]);
  if (id) return <Navigate to={`/users/${id}`} replace />;
  if (missing) return <div className="panel"><p className="muted">Aucun membre ne s'appelle « {username} ».</p><Link to="/">← Accueil</Link></div>;
  return <p className="muted">Chargement…</p>;
}
