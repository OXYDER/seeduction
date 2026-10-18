import { ComponentType, lazy } from 'react';

const FLAG = 'seeduction-chunk-reload';

/**
 * Charge une page à la demande. Après un déploiement, une page ouverte depuis longtemps peut chercher un fichier qui n'existe plus : on recharge alors la page une seule fois
 * (pour récupérer la nouvelle version du site) au lieu d'afficher une erreur ; si le problème persiste, l'erreur est transmise normalement.
 */
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await load();
      try { sessionStorage.removeItem(FLAG); } catch { /* ignoré */ }
      return mod;
    } catch (e) {
      let already = true;
      try { already = sessionStorage.getItem(FLAG) === '1'; if (!already) sessionStorage.setItem(FLAG, '1'); } catch { /* stockage indisponible : pas de rechargement automatique */ }
      if (!already) { window.location.reload(); return new Promise<never>(() => undefined); }
      throw e;
    }
  });
}
