import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';
import { canInstall, currentSubscription, disablePush, enablePush, installApp, isIos, isStandalone, onInstallChange, pushSupported } from '../lib/push';

interface Device { id: string; endpoint: string; userAgent: string; createdAt: string; lastPushAt: string | null }
const errorOf = (e: any) => e?.response?.data?.message ?? e?.message ?? 'Erreur';

/** « 📲 Application et notifications push » : installer Seeduction comme une application et recevoir les notifications sur cet appareil, site fermé. */
export default function PushSettings() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [here, setHere] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [installable, setInstallable] = useState(canInstall());
  const supported = pushSupported();
  const ios = isIos();
  const standalone = isStandalone();

  const load = useCallback(async () => {
    try { setDevices((await api.get('/push/status')).data.devices); } catch { /* pas connecté */ }
    setHere((await currentSubscription())?.endpoint ?? null);
  }, []);
  useEffect(() => { void load(); return onInstallChange(() => setInstallable(canInstall())); }, [load]);
  // le navigateur a renouvelé la clé : on se réabonne tout seul
  useEffect(() => {
    const h = (e: MessageEvent) => { if (e.data?.type === 'push-resubscribe') void enablePush().then(load).catch(() => undefined); };
    navigator.serviceWorker?.addEventListener('message', h);
    return () => navigator.serviceWorker?.removeEventListener('message', h);
  }, [load]);

  const subscribedHere = !!here && devices.some((d) => d.endpoint === here);
  async function toggle() {
    setBusy(true); setError(''); setMsg('');
    try {
      if (subscribedHere) { await disablePush(); setMsg('Notifications coupées sur cet appareil.'); }
      else { await enablePush(); setMsg('Notifications activées sur cet appareil.'); }
      await load();
    } catch (e) { setError(errorOf(e)); } finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setError(''); setMsg('');
    try { const r = await api.post('/push/test'); setMsg(r.data.sent > 0 ? `Essai envoyé à ${r.data.sent} appareil${r.data.sent > 1 ? 's' : ''} : il arrive dans quelques secondes (si le site est ouvert et visible, il n'est pas affiché : regarde la cloche).` : 'Aucun appareil abonné.'); } catch (e) { setError(errorOf(e)); } finally { setBusy(false); }
  }
  async function remove(d: Device) {
    try { await api.delete(`/push/devices/${d.id}`); if (d.endpoint === here) await disablePush(); await load(); } catch (e) { setError(errorOf(e)); }
  }
  async function install() { const ok = await installApp(); if (ok) setMsg('Application installée.'); }
  const label = (ua: string) => (/iphone|ipad/i.test(ua) ? 'iPhone / iPad' : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'Windows' : /mac/i.test(ua) ? 'Mac' : /linux/i.test(ua) ? 'Linux' : 'Appareil') + (/firefox/i.test(ua) ? ' · Firefox' : /edg/i.test(ua) ? ' · Edge' : /chrome/i.test(ua) ? ' · Chrome' : /safari/i.test(ua) ? ' · Safari' : '');

  return (
    <div className="panel" style={{ display: 'grid', gap: 10 }}>
      <h3 style={{ margin: 0 }}>📲 Application et notifications push</h3>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Installe Seeduction comme une application et reçois tes notifications (messages privés, mentions, buts du Canadien, torrents approuvés, alertes de recherche…) même quand le site est fermé. Tu gardes le choix des catégories ci-dessus.</p>
      {!standalone && (
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {installable ? <button type="button" onClick={install}>⬇ Installer l'application</button> : ios
            ? <span className="muted" style={{ fontSize: 13 }}>Sur iPhone / iPad : touche <strong>Partager</strong> puis <strong>« Sur l'écran d'accueil »</strong> ; les notifications ne fonctionnent qu'une fois l'application installée (iOS 16.4 ou plus).</span>
            : <span className="muted" style={{ fontSize: 13 }}>Pour installer : menu du navigateur → « Installer Seeduction » (ou l'icône d'installation dans la barre d'adresse).</span>}
        </div>
      )}
      {standalone && <span className="muted" style={{ fontSize: 13 }}>✅ Tu utilises l'application installée.</span>}
      {!supported ? <span className="muted" style={{ fontSize: 13 }}>{ios && !standalone ? "Installe d'abord l'application sur l'écran d'accueil pour activer les notifications." : 'Ce navigateur ne sait pas recevoir de notifications push.'}</span> : (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className={subscribedHere ? 'secondary' : ''} disabled={busy} onClick={toggle}>{subscribedHere ? '🔕 Couper les notifications sur cet appareil' : '🔔 Activer les notifications sur cet appareil'}</button>
          {devices.length > 0 && <button type="button" className="secondary" disabled={busy} onClick={test}>Envoyer un essai</button>}
        </div>
      )}
      {error && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</span>}
      {msg && <span style={{ color: 'var(--success)', fontSize: 13 }}>{msg}</span>}
      {devices.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          <div className="muted" style={{ fontSize: 12 }}>Appareils abonnés ({devices.length}/5) :</div>
          {devices.map((d) => (
            <div key={d.id} className="row" style={{ gap: 8, justifyContent: 'space-between', fontSize: 13 }}>
              <span>{label(d.userAgent)}{d.endpoint === here && <span className="badge" style={{ marginLeft: 6 }}>cet appareil</span>} <span className="muted" style={{ fontSize: 12 }}>· ajouté {timeAgo(d.createdAt)}{d.lastPushAt ? ` · dernier envoi ${timeAgo(d.lastPushAt)}` : ''}</span></span>
              <button type="button" className="secondary" onClick={() => remove(d)} aria-label="Retirer cet appareil">🗑️</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
