import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

interface Status { maintenance: { message: string; startedAt: string; endsAt: string } | null; version: string; build: number }

const POLL_MS = 30_000;
const FAST_MS = 8_000;

/**
 * Messages sur l'état du site, pour tout visiteur (même sans connexion) :
 * 1. « Mise à jour en cours » : le message de maintenance lancé par le script de déploiement (ou par un administrateur), avec le rappel d'une éventuelle instabilité ;
 * 2. « Le site redémarre » : le serveur ne répond plus pendant la mise à jour ; la page se reconnecte toute seule ;
 * 3. « Nouvelle version disponible » : le site a changé de version depuis l'ouverture de la page (bouton pour recharger).
 * Interroge un tout petit point d'accès toutes les 30 secondes (toutes les 8 secondes tant qu'il y a un message ou une panne).
 */
export default function MaintenanceBanner() {
  const [status, setStatus] = useState<Status | null>(null);
  const [fails, setFails] = useState(0);
  const [hidden, setHidden] = useState<string | null>(null); // clé du message masqué par le visiteur
  const base = useRef<string | null>(null);
  const wasDown = useRef(false);
  const [justBack, setJustBack] = useState(false);

  useEffect(() => {
    let stop = false;
    let timer = 0;
    async function tick() {
      let next = POLL_MS;
      try {
        const { data } = await axios.get<Status>('/api/system/status', { timeout: 8000 });
        if (stop) return;
        if (base.current === null) base.current = data.version;
        if (wasDown.current) { wasDown.current = false; setJustBack(true); window.setTimeout(() => setJustBack(false), 15_000); }
        setFails(0);
        setStatus(data);
        if (data.maintenance) next = FAST_MS;
      } catch (err: any) {
        if (stop) return;
        // 503 « site verrouillé » : c'est l'écran d'alerte qui parle, pas ce bandeau.
        if (err?.response?.status === 503 && err.response.data?.lockdown) { setFails(0); }
        else { setFails((n) => n + 1); wasDown.current = true; next = FAST_MS; }
      }
      timer = window.setTimeout(tick, next);
    }
    tick();
    const onVisible = () => { if (!document.hidden) { window.clearTimeout(timer); tick(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stop = true; window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const down = fails >= 2;
  const newVersion = !!status && base.current !== null && status.version !== base.current;
  const noticeKey = status?.maintenance ? `m:${status.maintenance.startedAt}` : '';

  let kind: 'down' | 'maintenance' | 'update' | 'back' | null = null;
  let text = '';
  if (down) { kind = 'down'; text = 'Le site redémarre ou est momentanément injoignable (mise à jour probable). Ta page se reconnecte toute seule, inutile de la recharger.'; }
  else if (newVersion) { kind = 'update'; text = justBack ? `✅ Mise à jour terminée : le site est passé à la version ${status!.version}. Recharge la page pour en profiter.` : `✨ Une nouvelle version du site est disponible (${status!.version}). Recharge la page pour en profiter.`; }
  else if (status?.maintenance && hidden !== noticeKey) { kind = 'maintenance'; text = status.maintenance.message; }
  else if (justBack) { kind = 'back'; text = '✅ Le site est de retour.'; }

  const key = kind === 'maintenance' ? noticeKey : kind;
  if (!kind || (kind === 'update' && hidden === `u:${status?.version}`)) return null;

  return (
    <div className={`maint-bar ${kind}`} role="status" aria-live="polite">
      <span className="maint-icon" aria-hidden>{kind === 'down' ? '🔌' : kind === 'maintenance' ? '🔧' : ''}</span>
      <span className="maint-text">{text}</span>
      {kind === 'update' && <button type="button" className="maint-btn" onClick={() => window.location.reload()}>Recharger</button>}
      {(kind === 'maintenance' || kind === 'update' || kind === 'back') && (
        <button type="button" className="maint-x" aria-label="Masquer" title="Masquer" onClick={() => setHidden(kind === 'update' ? `u:${status?.version}` : kind === 'maintenance' ? noticeKey : String(key))}>✕</button>
      )}
    </div>
  );
}
