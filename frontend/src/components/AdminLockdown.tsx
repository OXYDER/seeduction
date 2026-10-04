import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useLockdownStore } from '../store/lockdown';

const Go = (n: number | null) => (n === null ? '?' : `${(n / 1e9).toFixed(2)} Go`);

/** Admin > Sécurité : « Alerte générale » (chiffre tout le site avec un mot de passe, déblocable seulement avec ce même mot de passe). */
export function LockdownAdmin() {
  const [pre, setPre] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [accountPassword, setAccountPassword] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [lockPassword, setLockPassword] = useState('');
  const [lockPassword2, setLockPassword2] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [ack, setAck] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/lockdown/preflight').then((r) => setPre(r.data)).catch((e) => setError(e.response?.data?.message ?? 'Contrôle impossible')); }, []);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (lockPassword !== lockPassword2) { setError('Les deux mots de passe de verrouillage ne correspondent pas'); return; }
    setBusy(true);
    try {
      await api.post('/lockdown/start', { accountPassword, totpToken: totpToken || undefined, lockPassword, confirmText });
      useLockdownStore.getState().setLocked(true); // l'écran de verrouillage prend le relais et affiche la progression
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Verrouillage impossible');
      setBusy(false);
    }
  }

  const row = (ok: boolean, text: string, hint?: string) => (
    <div style={{ padding: '3px 0' }}>
      <span style={{ color: ok ? 'var(--success)' : 'var(--danger)' }}>{ok ? '✓' : '✗'}</span> {text}
      {!ok && hint && <div className="muted" style={{ fontSize: 12, marginLeft: 18 }}>{hint}</div>}
    </div>
  );

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel" style={{ borderColor: 'rgba(224,90,90,0.5)' }}>
        <h3 style={{ color: 'var(--danger)' }}>🚨 Alerte générale</h3>
        <p className="muted">
          En cas de piratage ou de doute grave : <strong>chiffre tout le site</strong> avec un mot de passe que toi seul(e) choisis. Le site devient inaccessible pour tout le monde,
          toutes les sessions ouvertes sont coupées, et les données (base de données, torrents, pochettes, fichiers du chat et sauvegardes) sont enfermées dans un coffre chiffré
          (AES-256, clé dérivée du mot de passe) puis <strong>effacées en clair</strong>. Un écran de déverrouillage s'affiche : le même mot de passe remet tout exactement comme avant.
        </p>
        <ul className="muted" style={{ margin: '6px 0 10px 18px', fontSize: 13 }}>
          <li><strong>Si tu perds le mot de passe, les données sont perdues pour toujours</strong> : personne (ni moi, ni le serveur) ne peut le retrouver. Note-le dans un gestionnaire de mots de passe.</li>
          <li>Le coffre reste sur le serveur (volume « lockdown_storage »). Pour une vraie protection contre un pirate qui contrôle la machine, copie-le ailleurs ; il est chiffré, la copie ne risque rien.</li>
          <li>Les anciennes données peuvent subsister dans des zones disque non réécrites (journaux de la base, blocs libérés) : pour ce niveau de protection, chiffre aussi le volume du NAS.</li>
          <li>Après le déverrouillage, tout le monde doit se reconnecter.</li>
        </ul>

        {pre && (
          <div className="panel ornate" style={{ margin: '10px 0' }}>
            <strong>Contrôles avant verrouillage</strong>
            {row(pre.twoFactor, 'Double authentification (2FA) activée sur ton compte', "Active-la dans Profil > Sécurité : sans elle, une personne qui volerait ton mot de passe pourrait verrouiller le site.")}
            {row(pre.dbSuperuser, 'La base de données autorise la restauration complète')}
            {row(pre.writable, 'Le dossier du coffre est accessible en écriture', 'Vérifie le volume Docker « lockdown_storage » (docker-compose.yml, puis ./deploy.sh).')}
            {row(pre.enoughSpace, `Espace disque suffisant (libre : ${Go(pre.freeBytes)})`)}
            {row(pre.backupsIncluded, 'Sauvegardes du NAS (./backups) incluses et chiffrées', "Sans ce montage, les sauvegardes automatiques resteraient en clair : mets à jour docker-compose.yml puis ./deploy.sh.")}
            {row(pre.mailConfigured, "Courriel d'alerte envoyé aux administrateurs", 'Facultatif : configure SMTP dans backend/.env.')}
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>À chiffrer : base de données ({Go(pre.dbBytes)}) et {pre.fileCount} fichier(s) ({Go(pre.fileBytes)}).</div>
          </div>
        )}

        {!open ? (
          <button type="button" className="danger" disabled={!pre?.ready} onClick={() => setOpen(true)}>🔒 Déclencher l'alerte générale…</button>
        ) : (
          <form onSubmit={start} className="grid" style={{ gap: 8, maxWidth: 420 }}>
            <strong style={{ color: 'var(--danger)' }}>Dernière confirmation</strong>
            <input type="password" placeholder="Mot de passe de TON compte" autoComplete="current-password" value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} required />
            <input inputMode="numeric" placeholder="Ton code 2FA (application)" value={totpToken} onChange={(e) => setTotpToken(e.target.value)} required />
            <input type="password" placeholder="Mot de passe de verrouillage (12 caractères minimum, différent du tien)" autoComplete="new-password" value={lockPassword} onChange={(e) => setLockPassword(e.target.value)} minLength={12} required />
            <input type="password" placeholder="Retape le mot de passe de verrouillage" autoComplete="new-password" value={lockPassword2} onChange={(e) => setLockPassword2(e.target.value)} minLength={12} required />
            <input placeholder="Tape VERROUILLER pour confirmer" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} required />
            <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 4 }} />
              <span className="muted" style={{ fontSize: 13 }}>J'ai noté le mot de passe de verrouillage en lieu sûr et je comprends qu'il est impossible de le récupérer.</span>
            </label>
            {error && <div style={{ color: 'var(--danger)' }} className="muted">{error}</div>}
            <div className="row">
              <button type="submit" className="danger" disabled={busy || !ack || confirmText !== 'VERROUILLER'}>{busy ? 'Envoi…' : 'Verrouiller le site maintenant'}</button>
              <button type="button" className="secondary" onClick={() => setOpen(false)}>Annuler</button>
            </div>
          </form>
        )}
        {!open && error && <div style={{ color: 'var(--danger)', marginTop: 8 }} className="muted">{error}</div>}
      </div>
    </div>
  );
}
