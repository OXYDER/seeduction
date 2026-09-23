import { useEffect, useState } from 'react';
import { api } from '../api/client';

/** Sécurité du compte : double authentification (2FA), changement de mot de passe, dernières connexions. */
export default function SecurityPanel() {
  const [status, setStatus] = useState<{ enabled: boolean; recoveryLeft: number } | null>(null);
  const [setup, setSetup] = useState<{ base32: string; qrCode: string } | null>(null);
  const [token, setToken] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableToken, setDisableToken] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [logins, setLogins] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadStatus = () => api.get('/auth/2fa/status').then((r) => setStatus(r.data)).catch(() => {});
  useEffect(() => {
    loadStatus();
    api.get('/auth/logins').then((r) => setLogins(r.data)).catch(() => {});
  }, []);

  const fail = (err: any) => { setMessage(''); setError(err.response?.data?.message ?? 'Erreur'); };

  async function startSetup() {
    setError(''); setMessage('');
    try { const { data } = await api.post('/auth/2fa/setup'); setSetup(data); } catch (err) { fail(err); }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/2fa/confirm', { token });
      setCodes(data.recoveryCodes);
      setSetup(null); setToken('');
      loadStatus();
    } catch (err) { fail(err); }
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/auth/2fa/disable', { password: disablePassword, token: disableToken });
      setShowDisable(false); setDisablePassword(''); setDisableToken('');
      setMessage('Double authentification désactivée');
      loadStatus();
    } catch (err) { fail(err); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      setCurrent(''); setNext('');
      setMessage('✓ Mot de passe modifié');
    } catch (err) { fail(err); }
  }

  return (
    <div className="panel">
      <h3>🔐 Sécurité du compte</h3>
      {error && <div style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}
      {message && <div style={{ color: 'var(--success)', marginBottom: 8 }}>{message}</div>}

      <div className="grid" style={{ gap: 18 }}>
        <div>
          <strong>Double authentification (2FA)</strong>{' '}
          {status?.enabled ? <span className="badge freeleech">Activée</span> : <span className="badge" style={{ background: 'rgba(224,90,90,0.2)', color: 'var(--danger)' }}>Désactivée</span>}
          <p className="muted" style={{ margin: '4px 0 8px' }}>
            Ajoute un code à 6 chiffres (Google Authenticator, Aegis, Authy...) à la connexion : même si ton mot de passe fuite, on ne peut pas entrer dans ton compte.
          </p>

          {codes && (
            <div className="panel ornate" style={{ marginBottom: 10 }}>
              <strong>Codes de secours — note-les maintenant, ils ne seront plus affichés :</strong>
              <div style={{ fontFamily: 'monospace', columns: 2, margin: '8px 0' }}>{codes.map((c) => <div key={c}>{c}</div>)}</div>
              <div className="muted">Chaque code ne sert qu'une fois, si tu perds ton téléphone.</div>
              <button type="button" className="secondary" style={{ marginTop: 8 }} onClick={() => setCodes(null)}>J'ai noté mes codes</button>
            </div>
          )}

          {!status?.enabled && !setup && <button type="button" onClick={startSetup}>Activer la 2FA</button>}
          {setup && (
            <form onSubmit={confirm} className="grid" style={{ gap: 8, maxWidth: 360 }}>
              <div className="muted">1. Scanne ce QR code avec ton application d'authentification :</div>
              <img src={setup.qrCode} alt="QR code 2FA" width={180} height={180} style={{ background: '#fff', padding: 6, borderRadius: 6 }} />
              <div className="muted">Ou saisis la clé à la main : <code>{setup.base32}</code></div>
              <div className="muted">2. Entre le code affiché pour confirmer :</div>
              <input inputMode="numeric" placeholder="Code à 6 chiffres" value={token} onChange={(e) => setToken(e.target.value)} maxLength={6} required />
              <div className="row">
                <button type="submit" disabled={token.length < 6}>Confirmer</button>
                <button type="button" className="secondary" onClick={() => setSetup(null)}>Annuler</button>
              </div>
            </form>
          )}
          {status?.enabled && (
            <div>
              <div className="muted">{status.recoveryLeft} code(s) de secours restant(s).</div>
              {!showDisable ? (
                <button type="button" className="secondary" style={{ marginTop: 6 }} onClick={() => setShowDisable(true)}>Désactiver la 2FA</button>
              ) : (
                <form onSubmit={disable} className="grid" style={{ gap: 8, maxWidth: 360, marginTop: 8 }}>
                  <input type="password" placeholder="Mot de passe" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} required />
                  <input placeholder="Code 2FA (ou code de secours)" value={disableToken} onChange={(e) => setDisableToken(e.target.value)} required />
                  <div className="row">
                    <button type="submit" className="danger">Désactiver</button>
                    <button type="button" className="secondary" onClick={() => setShowDisable(false)}>Annuler</button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        <form onSubmit={changePassword} className="grid" style={{ gap: 8, maxWidth: 360 }}>
          <strong>Changer mon mot de passe</strong>
          <input type="password" placeholder="Mot de passe actuel" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          <input type="password" placeholder="Nouveau mot de passe (8 caractères minimum)" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
          <button type="submit" style={{ alignSelf: 'flex-start' }}>Modifier</button>
        </form>

        <div>
          <strong>Dernières connexions</strong>
          <table>
            <tbody>
              {logins.map((l) => (
                <tr key={l.id}>
                  <td className="muted">{new Date(l.createdAt).toLocaleString('fr-FR')}</td>
                  <td>{l.action === 'LOGIN' ? '✅ Connexion' : <span style={{ color: 'var(--danger)' }}>❌ Échec</span>}</td>
                  <td className="muted">{l.ip ?? ''}</td>
                </tr>
              ))}
              {logins.length === 0 && <tr><td className="muted">Aucun historique pour l'instant.</td></tr>}
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: 4 }}>Une connexion ou un échec que tu ne reconnais pas ? Change ton mot de passe tout de suite.</p>
        </div>
      </div>
    </div>
  );
}
