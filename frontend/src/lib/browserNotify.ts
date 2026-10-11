/** Notifications du navigateur : permission et préférence « notifications du site » (la cloche), propre à chaque appareil. */
export const SITE_NOTIFY_KEY = 'seeduction:site-notify';

export type NotifyPermission = NotificationPermission | 'unsupported';

export function notifyPermission(): NotifyPermission {
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
}

/** Activées par défaut dès que le navigateur a accordé la permission ; le membre peut les couper dans Profil > Compte. */
export function siteNotifyOn(): boolean {
  try { return localStorage.getItem(SITE_NOTIFY_KEY) !== '0'; } catch { return true; }
}

export function setSiteNotify(on: boolean) {
  try { if (on) localStorage.removeItem(SITE_NOTIFY_KEY); else localStorage.setItem(SITE_NOTIFY_KEY, '0'); } catch { /* préférence facultative */ }
}
