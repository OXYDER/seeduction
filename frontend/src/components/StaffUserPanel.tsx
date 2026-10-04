import { useEffect, useState } from 'react';
import { api } from '../api/client';

import { CLASS_LABEL } from '../lib/memberClass';

const RANK: Record<string, number> = { USER: 0, UPLOADER: 1, MODERATOR: 2, SUPER_MODERATOR: 3, ADMIN: 4, OWNER: 5 };
const ROLE_LABEL: Record<string, string> = { USER: 'Membre', UPLOADER: 'Uploader', MODERATOR: 'Modérateur', SUPER_MODERATOR: 'Super modérateur', ADMIN: 'Administrateur', OWNER: 'Propriétaire' };
export { ROLE_LABEL };

const toGo = (bytes: string | number) => (Number(bytes) / 1e9).toFixed(2);

/** Gestion d'un membre depuis son profil : rôle, pseudo, stats (admins) ; avertissements et bannissements (modérateurs et plus). */
export default function StaffUserPanel({ targetId, myRole, myId, onChanged }: { targetId: string; myRole: string; myId: string; onChanged: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('USER');
  const [uploaded, setUploaded] = useState('');
  const [downloaded, setDownloaded] = useState('');
  const [bonus, setBonus] = useState('');
  const [email, setEmail] = useState('');
  const [minRatio, setMinRatio] = useState('');
  const [memberClass, setMemberClass] = useState('NOUVEAU');
  const [tokens, setTokens] = useState('');
  const [warnReason, setWarnReason] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banUntil, setBanUntil] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resetLink, setResetLink] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [delUsername, setDelUsername] = useState('');
  const [delPassword, setDelPassword] = useState('');
  const [delTotp, setDelTotp] = useState('');

  function load() {
    api.get(`/admin/users/${targetId}`).then((r) => {
      const d = r.data;
      setDetail(d);
      setUsername(d.username);
      setRole(d.role);
      setUploaded(toGo(d.uploaded));
      setDownloaded(toGo(d.downloaded));
      setBonus(String(Math.round(d.bonusPoints ?? 0)));
      setEmail(d.email ?? '');
      setMinRatio(String(d.minRatio ?? 0.5));
      setMemberClass(d.memberClass ?? 'NOUVEAU');
      setTokens(String(d.freeleechTokens ?? 0));
    }).catch(() => setDetail(null));
  }
  useEffect(load, [targetId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!detail) return null;

  const isSelf = targetId === myId;
  const outranks = myRole === 'OWNER' ? !isSelf : (RANK[myRole] ?? 0) > (RANK[detail.role] ?? 0);
  const canEdit = ['SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(myRole) && (outranks || isSelf);
  const assignable = Object.keys(RANK).filter((r) => myRole === 'OWNER' || RANK[r] < RANK[myRole]);

  async function run(action: () => Promise<any>, success: string) {
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(`✓ ${success}`);
      load();
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Action refusée');
    }
  }

  async function makeResetLink() {
    setError(''); setMessage('');
    try {
      const { data } = await api.post(`/admin/users/${targetId}/reset-link`);
      setResetLink(`${window.location.origin}/reset-password?token=${data.token}`);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Action refusée');
    }
  }

  const save = () => run(
    () => api.patch(`/admin/users/${targetId}`, {
      username: username !== detail.username ? username : undefined,
      role: role !== detail.role ? role : undefined,
      uploaded, downloaded, bonusPoints: bonus,
      email: email !== detail.email ? email : undefined, minRatio, memberClass, freeleechTokens: tokens,
    }),
    'Profil mis à jour (le nouveau rôle s\'applique à sa prochaine connexion)',
  );

  return (
    <div className="panel ornate">
      <div className="panel-title"><span className="title-icon">🛡️</span>Modération du membre</div>
      <div className="muted" style={{ marginBottom: 10 }}>
        {detail.email} · {ROLE_LABEL[detail.role]} · {detail.status === 'BANNED' ? '🚫 Banni' : detail.status === 'PENDING_EMAIL' ? '📧 Courriel non confirmé' : 'Actif'}
      </div>

      {!isSelf && !outranks && (
        <p className="muted">Ce membre a un rang égal ou supérieur au tien : tu ne peux pas le modérer.</p>
      )}

      {canEdit && (
        <div className="filter-grid" style={{ marginBottom: 12 }}>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Pseudo</div>
            <input value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Rôle</div>
            <select value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf} style={{ width: '100%' }}>
              {!assignable.includes(role) && <option value={role}>{ROLE_LABEL[role]}</option>}
              {assignable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Upload (Go)</div>
            <input type="number" min="0" step="0.01" value={uploaded} onChange={(e) => setUploaded(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Download (Go)</div>
            <input type="number" min="0" step="0.01" value={downloaded} onChange={(e) => setDownloaded(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Points bonus</div>
            <input type="number" min="0" value={bonus} onChange={(e) => setBonus(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Courriel</div>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Rang automatique</div>
            <select value={memberClass} onChange={(e) => setMemberClass(e.target.value)} style={{ width: '100%' }}>
              {Object.entries(CLASS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Ratio minimum</div>
            <input type="number" min="0" max="20" step="0.05" value={minRatio} onChange={(e) => setMinRatio(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Jetons freeleech</div>
            <input type="number" min="0" value={tokens} onChange={(e) => setTokens(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button type="button" onClick={save}>Enregistrer</button>
          </div>
        </div>
      )}

      {canEdit && !isSelf && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <strong>🔄 Hit &amp; run non régularisés ({detail.hnr?.length ?? 0})</strong>
            {(detail.hnr?.length ?? 0) > 0 && <button type="button" className="secondary" onClick={() => window.confirm('Effacer tous les hit & run de ce membre (et les avertissements automatiques liés) ?') && run(() => api.post(`/admin/users/${targetId}/clear-hnr`), 'Hit & run effacés')}>Tout effacer</button>}
          </div>
          {(detail.hnr ?? []).map((h: any) => (
            <div key={h.id} className="row muted" style={{ justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '4px 0' }}>
              <span>{h.name} — {h.seedHours} h de seed</span>
              <button type="button" className="secondary" style={{ padding: '1px 10px', fontSize: 12 }} onClick={() => run(() => api.post(`/admin/users/${targetId}/clear-hnr`, { snatchId: h.id }), 'Hit & run effacé')}>Effacer</button>
            </div>
          ))}
          {(detail.hnr?.length ?? 0) === 0 && <div className="muted" style={{ fontSize: 12 }}>Aucun hit &amp; run en cours.</div>}
          <div style={{ marginTop: 8 }}>
            <button type="button" className="secondary" onClick={() => window.confirm("Générer une nouvelle passkey ? L'ancienne cesse de fonctionner : le membre devra retélécharger ses .torrent.") && run(() => api.post(`/admin/users/${targetId}/passkey`), 'Nouvelle passkey générée')}>🔑 Régénérer la passkey</button>
          </div>
        </div>
      )}

      {outranks && (
        <div className="grid" style={{ gap: 10 }}>
          <div className="row">
            <input placeholder="Motif de l'avertissement" value={warnReason} onChange={(e) => setWarnReason(e.target.value)} style={{ flex: 1 }} />
            <button type="button" className="secondary" disabled={!warnReason.trim()} onClick={() => run(() => api.post(`/admin/users/${targetId}/warn`, { reason: warnReason }).then(() => setWarnReason('')), 'Avertissement envoyé')}>
              ⚠️ Avertir
            </button>
          </div>
          {detail.status === 'BANNED' ? (
            <button type="button" className="secondary" style={{ alignSelf: 'flex-start' }} onClick={() => run(() => api.post(`/admin/users/${targetId}/unban`), 'Membre débanni')}>
              ✅ Débannir
            </button>
          ) : (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <input placeholder="Motif du bannissement" value={banReason} onChange={(e) => setBanReason(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
              <input type="date" title="Fin du bannissement (vide = permanent)" value={banUntil} onChange={(e) => setBanUntil(e.target.value)} />
              <button
                type="button"
                className="danger"
                disabled={!banReason.trim()}
                onClick={() => window.confirm(`Bannir ${detail.username} ${banUntil ? `jusqu'au ${banUntil}` : 'définitivement'} ?`)
                  && run(() => api.post(`/admin/users/${targetId}/ban`, { reason: banReason, expiresAt: banUntil || undefined }).then(() => { setBanReason(''); setBanUntil(''); }), 'Membre banni')}
              >
                🚫 Bannir
              </button>
            </div>
          )}
        </div>
      )}

      {outranks && (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="secondary" onClick={makeResetLink}>🔗 Générer un lien de réinitialisation du mot de passe</button>
          {resetLink && (
            <div className="panel ornate" style={{ marginTop: 8 }}>
              <div className="muted">Transmets ce lien au membre (valable 1 heure, usage unique) :</div>
              <code style={{ wordBreak: 'break-all', display: 'block', margin: '6px 0' }}>{resetLink}</code>
              <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(resetLink)}>Copier</button>
            </div>
          )}
        </div>
      )}

      {detail.status === 'PENDING_EMAIL' && ['ADMIN', 'OWNER'].includes(myRole) && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ marginBottom: 6 }}>Ce membre n'a pas encore confirmé son courriel (le compte est supprimé automatiquement après 48 h). Tu peux l'activer à la main si son courriel est inaccessible.</div>
          <button type="button" className="secondary" onClick={() => window.confirm(`Activer le compte de ${detail.username} sans confirmation par courriel ?`) && run(() => api.post(`/admin/users/${targetId}/activate`), 'Compte activé')}>✅ Activer le compte maintenant</button>
        </div>
      )}

      {outranks && ['ADMIN', 'OWNER'].includes(myRole) && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(224,90,90,0.35)' }}>
          {!showDelete ? (
            <button type="button" className="secondary" style={{ color: 'var(--danger)' }} onClick={() => setShowDelete(true)}>🗑️ Supprimer définitivement ce compte…</button>
          ) : (
            <form
              className="grid"
              style={{ gap: 8, maxWidth: 420 }}
              onSubmit={async (e) => {
                e.preventDefault();
                setError(''); setMessage('');
                try {
                  await api.post(`/admin/users/${targetId}/delete`, { confirmUsername: delUsername, password: delPassword, totpToken: delTotp || undefined });
                  window.alert(`Le compte « ${detail.username} » a été supprimé.`);
                  window.location.assign('/leaderboard');
                } catch (err: any) { setError(err.response?.data?.message ?? 'Suppression impossible'); }
              }}
            >
              <strong style={{ color: 'var(--danger)' }}>Suppression définitive — irréversible</strong>
              <div className="muted" style={{ fontSize: 12 }}>
                Son profil, ses favoris, amis, messages reçus, notifications, clés et historique disparaissent. Ses torrents, commentaires, messages du forum et du chat restent, attribués à « [compte supprimé] ».
                Si c'est pour sanctionner, préfère le <strong>bannissement</strong> (réversible).
              </div>
              <input placeholder={`Tape le pseudo « ${detail.username} » pour confirmer`} value={delUsername} onChange={(e) => setDelUsername(e.target.value)} required />
              <input type="password" placeholder="Ton mot de passe" autoComplete="current-password" value={delPassword} onChange={(e) => setDelPassword(e.target.value)} required />
              <input inputMode="numeric" placeholder="Ton code 2FA (si activée)" value={delTotp} onChange={(e) => setDelTotp(e.target.value)} />
              <div className="row">
                <button type="submit" className="danger" disabled={delUsername !== detail.username || !delPassword}>Supprimer le compte</button>
                <button type="button" className="secondary" onClick={() => { setShowDelete(false); setDelUsername(''); setDelPassword(''); setDelTotp(''); }}>Annuler</button>
              </div>
            </form>
          )}
        </div>
      )}

      {error && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
      {message && <div className="muted" style={{ color: 'var(--success)', marginTop: 8 }}>{message}</div>}

      {(detail.warnings.length > 0 || detail.bans.length > 0) && (
        <div style={{ marginTop: 14 }}>
          <div className="muted" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.06em', marginBottom: 4 }}>Historique</div>
          {[...detail.warnings.map((w: any) => ({ ...w, kind: '⚠️ Avertissement' })), ...detail.bans.map((b: any) => ({ ...b, kind: '🚫 Ban' }))]
            .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
            .map((h) => (
              <div key={h.id} className="muted" style={{ fontSize: 12, padding: '2px 0' }}>
                {new Date(h.createdAt).toLocaleDateString('fr-FR')} — {h.kind} par {h.issuedBy} : {h.reason}
                {h.expiresAt && ` (jusqu'au ${new Date(h.expiresAt).toLocaleDateString('fr-FR')})`}
                {canEdit && !isSelf && h.kind.includes('Avertissement') && <button type="button" className="secondary" style={{ marginLeft: 8, padding: '0 8px', fontSize: 11 }} onClick={() => run(() => api.delete(`/admin/users/${targetId}/warnings/${h.id}`), 'Avertissement supprimé')}>Supprimer</button>}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
