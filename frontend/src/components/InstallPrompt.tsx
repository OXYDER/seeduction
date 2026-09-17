import { useEffect, useState } from 'react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  async function install() {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  return (
    <div className="panel ornate" style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 100, width: 280, padding: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>📲 Installer Seeduction</strong>
        <button className="secondary" style={{ padding: '2px 8px' }} onClick={() => setDismissed(true)}>✕</button>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
        Installe le tracker comme une application pour un accès plus rapide, sans passer par le navigateur.
      </p>
      <button onClick={install}>Installer</button>
    </div>
  );
}
