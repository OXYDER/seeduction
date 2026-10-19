import { useEffect, useState } from 'react';
import { api } from '../api/client';

const ROLE_LABEL: Record<string, string> = { OWNER: 'propriétaire', ADMIN: 'administrateur', SUPER_MODERATOR: 'super-modérateur', MODERATOR: 'modérateur' };
interface StaffRow { id: string; username: string; role: string; twoFactor: boolean }

/** Admin > Sécurité : exiger la double authentification de toute l'équipe. */
export function AdminStaff2fa() {
  const [data, setData] = useState<{ required: boolean; staff: StaffRow[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/admin/staff-security').then((r) => setData(r.data)).catch((e) => setError(e.response?.data?.message ?? 'Chargement impossible'));
  useEffect(() => { void load(); }, []);

  async function toggle() {
    if (!data) return;
    const next = !data.required;
    const without = data.staff.filter((s) => !s.twoFactor);
    if (next && without.length > 0 && !window.confirm(`${without.length} personne${without.length > 1 ? 's' : ''} de l'équipe (${without.map((s) => s.username).join(', ')}) n'${without.length > 1 ? 'ont' : 'a'} pas encore la 2FA et perdr${without.length > 1 ? 'ont' : 'a'} l'accès aux outils de l'équipe jusqu'à ce qu'elle l'active. Continuer ?`)) return;
    setBusy(true); setError('');
    try { setData((await api.put('/admin/staff-security', { required: next })).data); } catch (e: any) { setError(e.response?.data?.message ?? 'Changement impossible'); } finally { setBusy(false); }
  }

  if (!data) return error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null;
  const done = data.staff.filter((s) => s.twoFactor).length;
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h2 style={{ marginTop: 0 }}>🔐 Double authentification de l'équipe</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Quand c'est obligatoire, une personne de l'équipe sans 2FA garde son compte de membre mais ne peut plus utiliser la modération, l'administration ni le courriel tant qu'elle ne l'a pas activée
        (Profil &gt; Sécurité). Elle ne peut plus la désactiver non plus. Si un compte d'équipe est volé, le mot de passe seul ne suffit alors plus.
      </p>
      <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className={data.required ? 'secondary' : ''} disabled={busy} onClick={toggle}>{data.required ? 'Ne plus exiger la 2FA' : 'Exiger la 2FA pour l\'équipe'}</button>
        <strong style={{ color: data.required ? 'var(--success)' : 'var(--text-muted)' }}>{data.required ? '✓ Obligatoire' : 'Facultative pour l\'instant'}</strong>
        <span className="muted">{done} / {data.staff.length} ont déjà la 2FA</span>
      </div>
      {error && <p style={{ color: 'var(--danger)', marginBottom: 0 }}>{error}</p>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {data.staff.map((s) => (
          <span key={s.id} className="badge" style={{ borderColor: s.twoFactor ? 'var(--success)' : 'var(--danger)' }} title={s.twoFactor ? '2FA activée' : '2FA non activée'}>
            {s.twoFactor ? '✓' : '✗'} {s.username} <small className="muted">{ROLE_LABEL[s.role] ?? s.role}</small>
          </span>
        ))}
      </div>
    </div>
  );
}
