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
