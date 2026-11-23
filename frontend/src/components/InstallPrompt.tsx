import { useEffect, useState } from 'react';

const HIDE_KEY = 'seeduction:install-prompt-hidden';
const isHidden = () => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } };

/** Invitation à installer Seeduction comme une application. « Ne plus afficher » la cache jusqu'à ce que les données du site (cookies / stockage) soient effacées. */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(isHidden);

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
  function never() {
    try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* stockage indisponible : caché pour cette visite seulement */ }
    setDismissed(true);
  }

  return (
    <div className="panel ornate install-prompt" style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 100, width: 280, padding: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>📲 Installer Seeduction</strong>
        <button className="secondary" style={{ padding: '2px 8px' }} onClick={() => setDismissed(true)} aria-label="Fermer" title="Fermer (reviendra à ta prochaine visite)">✕</button>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
        Installe le tracker comme une application pour un accès plus rapide, sans passer par le navigateur.
      </p>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <button onClick={install}>Installer</button>
        <button type="button" className="install-never" onClick={never} title="Ne plus proposer d'installer l'application (jusqu'à l'effacement des données du site)">Ne plus afficher</button>
      </div>
    </div>
  );
}
