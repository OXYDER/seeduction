import { api } from '../api/client';

/** Notifications push et installation de l'application (PWA) : tout ce que la page doit savoir faire côté navigateur. */
export const pushSupported = (): boolean => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isStandalone = (): boolean => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
export const isIos = (): boolean => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const b64ToBytes = (b64: string): Uint8Array => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  return existing ?? navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready);
}

/** Abonnement actuel de cet appareil (ou null). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try { return await (await registration()).pushManager.getSubscription(); } catch { return null; }
}

/** Demande la permission, abonne cet appareil et l'enregistre sur le site. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error("Ce navigateur ne sait pas recevoir de notifications push.");
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? "Les notifications sont bloquées pour ce site dans le navigateur : autorise-les dans les réglages du site (le cadenas, à gauche de l'adresse)." : 'Permission non accordée.');
  const { data } = await api.get('/push/key');
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(data.publicKey) as BufferSource }));
  await api.post('/push/subscribe', { ...sub.toJSON(), userAgent: navigator.userAgent });
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (sub) { await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined); await sub.unsubscribe().catch(() => undefined); }
}

/** L'événement « installer l'application » du navigateur, gardé pour un bouton à nous. */
let deferred: any = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; listeners.forEach((l) => l()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((l) => l()); });
}
export const canInstall = (): boolean => !!deferred;
export const onInstallChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export async function installApp(): Promise<boolean> {
  if (!deferred) return false;
  deferred.prompt();
  const choice = await deferred.userChoice.catch(() => null);
  deferred = null; listeners.forEach((l) => l());
  return choice?.outcome === 'accepted';
}
