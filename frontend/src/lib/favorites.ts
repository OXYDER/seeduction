import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

/** Torrents mis de côté (« à télécharger plus tard ») par le membre connecté. */
export function useFavorites() {
  const user = useAuthStore((s) => s.user);
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    api.get('/favorites/ids').then((r) => setIds(new Set(r.data))).catch(() => {});
  }, [user]);

  const toggle = useCallback(async (torrentId: string) => {
    const wasFavorite = ids.has(torrentId);
    // Mise à jour immédiate, annulée si le serveur refuse.
    setIds((prev) => {
      const next = new Set(prev);
      if (wasFavorite) next.delete(torrentId); else next.add(torrentId);
      return next;
    });
    try {
      if (wasFavorite) await api.delete(`/favorites/${torrentId}`);
      else await api.put(`/favorites/${torrentId}`);
    } catch {
      setIds((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.add(torrentId); else next.delete(torrentId);
        return next;
      });
    }
  }, [ids]);

  return { ids, toggle, enabled: !!user };
}
