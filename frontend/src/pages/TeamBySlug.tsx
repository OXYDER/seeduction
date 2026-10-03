import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../api/client';

/** Lien depuis le nom d'une release (« …-TOXIC ») vers la page de sa team. */
export default function TeamBySlug() {
  const { slug } = useParams();
  const [id, setId] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { api.get(`/teams/slug/${encodeURIComponent(slug ?? '')}`).then((r) => setId(r.data.id)).catch(() => setMissing(true)); }, [slug]);
  if (id) return <Navigate to={`/teams/${id}`} replace />;
  if (missing) return <div className="panel"><p className="muted">Cette team n'existe pas (encore).</p><Link to="/teams">← Toutes les teams</Link></div>;
  return <p className="muted">Chargement…</p>;
}
