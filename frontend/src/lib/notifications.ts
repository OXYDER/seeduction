/** Catégories de notifications (onglets de la page Notifications, préférences) : même liste que le serveur. */
export const CATEGORY_ICON: Record<string, string> = {
  messages: '💬', forum: '🗨️', torrents: '🎬', requests: '🙏', social: '👥', announcements: '📯', pot: '🍯', support: '🎫', system: '🛡️',
};

export interface AppNotification {
  id: string;
  type: string;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  count: number;
  createdAt: string;
}

const EVENT = 'notifications:changed';
/** Prévient la cloche et la page Notifications qu'une notification a changé (lue, supprimée...). */
export function notifyChanged() { window.dispatchEvent(new Event(EVENT)); }
export function onNotificationsChanged(fn: () => void) {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

export type NotifEntry = { kind: 'one'; n: AppNotification } | { kind: 'stack'; id: string; category: string; items: AppNotification[] };

/**
 * Regroupe d'un seul bloc 3 notifications ou plus qui se suivent dans la liste, de même catégorie, du même jour et dans le même état (toutes lues ou toutes non lues) :
 * « 5 notifications · Séries et alertes ». Les notifications isolées restent seules ; l'ordre de la liste ne change jamais.
 */
export function stackNotifications(items: AppNotification[], minRun = 3): NotifEntry[] {
  const day = (n: AppNotification) => new Date(n.createdAt).toDateString();
  const out: NotifEntry[] = [];
  let i = 0;
  while (i < items.length) {
    let j = i + 1;
    while (j < items.length && items[j].category === items[i].category && day(items[j]) === day(items[i]) && items[j].read === items[i].read) j++;
    if (j - i >= minRun) out.push({ kind: 'stack', id: items[i].id, category: items[i].category, items: items.slice(i, j) });
    else for (let k = i; k < j; k++) out.push({ kind: 'one', n: items[k] });
    i = j;
  }
  return out;
}
