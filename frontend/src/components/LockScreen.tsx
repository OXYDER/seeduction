import { useEffect, useState } from 'react';
import axios from 'axios';
import { useLockdownStore } from '../store/lockdown';

interface Status { phase: 'OFF' | 'LOCKING' | 'LOCKED' | 'RESTORING'; step: string | null; pct: number; error: string | null; summary: { tables: number; rows: number; files: number; vaultBytes?: number } | null }

/** Écran affiché à tout le monde pendant une alerte générale : progression du chiffrement, puis saisie du mot de passe de déblocage. */
export default function LockScreen() {
  const setLocked = useLockdownStore((s) => s.setLocked);
  const [status, setStatus] = useState<Status | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const { data } = await axios.get<Status>('/api/lockdown/status');
        if (stop) return;
        setStatus(data);
        if (data.phase === 'OFF') { setLocked(false); window.location.reload(); }
      } catch { /* serveur redémarre : on réessaie */ }
    }
    poll();
    const t = setInterval(poll, 2500);
    return () => { stop = true; clearInterval(t); };
  }, [setLocked]);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await axios.post('/api/lockdown/unlock', { password });
      setPassword('');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Déblocage impossible');
    } finally { setBusy(false); }
  }

  const phase = status?.phase;
  const working = phase === 'LOCKING' || phase === 'RESTORING';

  return (
    <div className="auth-form-side" style={{ minHeight: '100vh' }}>
      <div className="panel ornate" style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>{phase === 'RESTORING' ? '🔓' : '🔒'}</div>
        <h2 style={{ marginTop: 6 }}>{phase === 'RESTORING' ? 'Déverrouillage en cours' : 'Site verrouillé'}</h2>
        <p className="muted">
          {phase === 'LOCKING' && "Une alerte de sécurité a été déclenchée : les données sont en train d'être chiffrées. Reviens dans quelques instants."}
          {phase === 'LOCKED' && "Une alerte de sécurité est en cours : toutes les données du site sont chiffrées et le site est inaccessible. Seule une personne qui connaît le mot de passe de déverrouillage peut le rouvrir."}
          {phase === 'RESTORING' && 'Les données sont déchiffrées et remises en place. Ne ferme pas cette page.'}
          {!phase && 'Connexion au serveur…'}
        </p>

        {working && (
          <div style={{ margin: '14px 0' }}>
            <div style={{ height: 10, borderRadius: 6, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(3, Math.round(status?.pct ?? 0))}%`, height: '100%', background: 'var(--gold-bright, #f5c542)', transition: 'width .4s' }} />
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{status?.step} — {Math.round(status?.pct ?? 0)} %</div>
          </div>
        )}

        {phase === 'LOCKED' && (
          <form onSubmit={unlock} className="grid" style={{ gap: 10, marginTop: 12 }}>
            <input
              type="password"
              placeholder="Mot de passe de déverrouillage"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {(error || status?.error) && <div style={{ color: 'var(--danger)' }} className="muted">{error || status?.error}</div>}
            <button type="submit" disabled={busy || !password}>{busy ? 'Vérification…' : 'Déverrouiller le site'}</button>
          </form>
        )}
        {phase === 'RESTORING' && status?.error && <div style={{ color: 'var(--danger)' }} className="muted">{status.error}</div>}
      </div>
    </div>
  );
}
