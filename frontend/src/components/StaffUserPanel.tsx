import { useEffect, useState } from 'react';
import { api } from '../api/client';

const RANK: Record<string, number> = { USER: 0, UPLOADER: 1, MODERATOR: 2, ADMIN: 3, OWNER: 4 };
const ROLE_LABEL: Record<string, string> = { USER: 'Membre', UPLOADER: 'Uploader', MODERATOR: 'Modérateur', ADMIN: 'Administrateur', OWNER: 'Propriétaire' };
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
  const [warnReason, setWarnReason] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banUntil, setBanUntil] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resetLink, setResetLink] = useState('');

  function load() {
    api.get(`/admin/users/${targetId}`).then((r) => {
      const d = r.data;
      setDetail(d);
      setUsername(d.username);
      setRole(d.role);
      setUploaded(toGo(d.uploaded));
      setDownloaded(toGo(d.downloaded));
      setBonus(String(Math.round(d.bonusPoints ?? 0)));
    }).catch(() => setDetail(null));
  }
  useEffect(load, [targetId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!detail) return null;

  const isSelf = targetId === myId;
  const outranks = myRole === 'OWNER' ? !isSelf : (RANK[myRole] ?? 0) > (RANK[detail.role] ?? 0);
  const canEdit = ['ADMIN', 'OWNER'].includes(myRole) && (outranks || isSelf);
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
    }),
    'Profil mis à jour (le nouveau rôle s\'applique à sa prochaine connexion)',
  );

  return (
    <div className="panel ornate">
      <div className="panel-title"><span className="title-icon">🛡️</span>Modération du membre</div>
      <div className="muted" style={{ marginBottom: 10 }}>
        {detail.email} · {ROLE_LABEL[detail.role]} · {detail.status === 'BANNED' ? '🚫 Banni' : 'Actif'}
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
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button type="button" onClick={save}>Enregistrer</button>
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
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
