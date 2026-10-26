import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';
import { Pagination } from './ForumBits';
import Loading from './Loading';

interface Item { id: string; at: string; primary: string; secondary?: string; text?: string; tags: string[]; link?: string; facts?: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }[] }
const TONE = { ok: 'var(--success)', warn: '#fbbf24', bad: 'var(--danger)' } as const;
interface Overview {
  user: { id: string; username: string; role: string; status: string; email: string };
  mustResetPassword: boolean; counts: Record<string, number>; privateUnlocked: boolean; canSeePrivate: boolean;
}
interface Page { items: Item[]; total: number; page: number; pageSize: number }

const TABS: { id: string; label: string; icon: string; priv?: boolean }[] = [
  { id: 'downloads', label: 'Téléchargements', icon: '⬇️' }, { id: 'unfinished', label: 'Non terminés', icon: '⏸️' }, { id: 'uploads', label: 'Envois', icon: '⬆️' }, { id: 'seeds', label: 'Seeds et peers', icon: '🌱' },
  { id: 'hnr', label: 'Hit & run', icon: '⚠️' }, { id: 'friends', label: 'Amis', icon: '🤝' }, { id: 'forum', label: 'Forum', icon: '🗨️' },
  { id: 'pm', label: 'Messagerie (courrier)', icon: '✉️', priv: true }, { id: 'dm', label: 'Messages privés', icon: '🔒', priv: true }, { id: 'chat', label: 'Chat (groupes et canaux)', icon: '💬', priv: true },
];
const errorOf = (e: any) => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(', ') : m ?? 'Erreur'; };

/** Profil d'un membre (administrateurs) : tout le compte au même endroit, et la réinitialisation obligatoire du mot de passe. Le contenu des conversations demande de saisir à nouveau son mot de passe et laisse une trace. */
export default function MemberInspectPanel({ userId }: { userId: string }) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [tab, setTab] = useState('downloads');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetLink, setResetLink] = useState('');

  const loadOverview = useCallback(() => api.get(`/admin/users/${userId}/inspect`).then((r) => setOv(r.data)).catch((e) => setError(errorOf(e))), [userId]);
  useEffect(() => { setOv(null); setData(null); setTab('downloads'); setPage(1); setNeedsUnlock(false); setResetLink(''); void loadOverview(); }, [userId, loadOverview]);

  useEffect(() => {
    if (!ov) return;
    setError(''); setNeedsUnlock(false); setData(null);
    api.get(`/admin/users/${userId}/inspect/${tab}`, { params: { page } })
      .then((r) => setData(r.data))
      .catch((e) => { if (e?.response?.status === 403 && /mot de passe/i.test(errorOf(e)) && TABS.find((t) => t.id === tab)?.priv) setNeedsUnlock(true); else setError(errorOf(e)); });
  }, [userId, tab, page, ov?.user.id, ov?.privateUnlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  async function unlock(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.post(`/admin/users/${userId}/inspect-unlock`, { password, totpToken: totp || undefined }); setPassword(''); setTotp(''); setNeedsUnlock(false); await loadOverview(); setPage(1); setData(null); const r = await api.get(`/admin/users/${userId}/inspect/${tab}`, { params: { page: 1 } }); setData(r.data); }
    catch (err) { setError(errorOf(err)); } finally { setBusy(false); }
  }

  async function forceReset(cancel: boolean) {
    if (!cancel && !window.confirm(`Exiger la réinitialisation du mot de passe de ${ov?.user.username} ?\n\nSes sessions seront fermées tout de suite et son compte restera inutilisable tant qu'il n'aura pas choisi un nouveau mot de passe avec le lien envoyé par courriel.`)) return;
    setBusy(true); setMsg(''); setError(''); setResetLink('');
    try {
      const { data: r } = await api.post(`/admin/users/${userId}/force-reset`, { cancel });
      setMsg(cancel ? 'Exigence levée : le membre peut se reconnecter avec son mot de passe actuel.' : r.emailed ? `Courriel envoyé à ${ov?.user.email}.` : "Le courriel n'est pas configuré : transmets ce lien au membre.");
      if (r.link) setResetLink(`${window.location.origin}/reset-password?token=${r.link.split('token=')[1] ?? ''}`);
      await loadOverview();
    } catch (err) { setError(errorOf(err)); } finally { setBusy(false); }
  }

  if (!ov) return error ? <div className="panel" style={{ color: 'var(--danger)' }}>{error}</div> : <div className="panel"><Loading /></div>;
  const cur = TABS.find((t) => t.id === tab)!;

  return (
    <div className="panel" style={{ display: 'grid', gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>🔎 Compte complet <span className="badge" style={{ background: 'rgba(245,158,11,0.2)', color: '#fbbf24' }}>Administrateurs seulement</span></h3>
        {ov.mustResetPassword
          ? <button type="button" className="secondary" disabled={busy} onClick={() => forceReset(true)}>Lever la réinitialisation obligatoire</button>
          : <button type="button" className="danger" disabled={busy} onClick={() => forceReset(false)}>🔑 Exiger la réinitialisation du mot de passe</button>}
      </div>
      {ov.mustResetPassword && <p style={{ margin: 0, color: '#fbbf24' }}>⏳ Réinitialisation obligatoire en attente : le compte est inutilisable tant que le membre n'a pas choisi un nouveau mot de passe avec le lien reçu par courriel.</p>}
      {msg && <p style={{ margin: 0, color: 'var(--success)' }}>{msg}</p>}
      {resetLink && <div><code style={{ wordBreak: 'break-all', display: 'block' }}>{resetLink}</code><button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(resetLink)}>Copier le lien</button></div>}

      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`secondary${tab === t.id ? ' on' : ''}`} onClick={() => { setTab(t.id); setPage(1); }}>
            {t.icon} {t.label} ({ov.counts[t.id] ?? 0})
          </button>
        ))}
      </div>

      {cur.priv && (
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          🔒 Contenu de conversations : il faut saisir ton mot de passe (valable 15 minutes), seulement pour un membre de rang inférieur au tien, et chaque page consultée est inscrite au journal d'audit.
        </p>
      )}
      {cur.priv && !ov.canSeePrivate && <p style={{ color: 'var(--danger)', margin: 0 }}>Les conversations d'un membre de ton rang ou d'un rang supérieur ne sont pas consultables.</p>}
      {needsUnlock && ov.canSeePrivate && (
        <form onSubmit={unlock} className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Ton mot de passe<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
          <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Code 2FA (si activée)<input value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" style={{ width: 130 }} /></label>
          <button type="submit" disabled={busy || !password}>Déverrouiller</button>
        </form>
      )}
      {error && <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}

      {!needsUnlock && !error && (!data ? <Loading /> : data.items.length === 0 ? <p className="muted" style={{ margin: 0 }}>Aucun élément.</p> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {data.items.map((it) => (
            <div key={it.id} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', display: 'grid', gap: 3 }}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong>{it.link ? <Link to={it.link}>{it.primary}</Link> : it.primary}</strong>
                <span className="muted" style={{ fontSize: 12.5 }} title={new Date(it.at).toLocaleString('fr-CA')}>{timeAgo(it.at)}</span>
              </div>
              {it.secondary && <span className="muted" style={{ fontSize: 12.5 }}>{it.secondary}</span>}
              {it.facts && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, max-content) 1fr', gap: '3px 14px', fontSize: 13, margin: '2px 0' }}>
                  {it.facts.map((f) => (
                    <div key={f.label} style={{ display: 'contents' }}>
                      <span className="muted">{f.label}</span>
                      <span style={f.tone ? { color: TONE[f.tone], fontWeight: 600 } : undefined}>{f.value}</span>
                    </div>
                  ))}
                </div>
              )}
              {it.text && <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5 }}>{it.text}</div>}
              {it.tags.length > 0 && <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>{it.tags.map((t) => <span key={t} className="badge">{t}</span>)}</div>}
            </div>
          ))}
          <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} unit="élément" />
        </div>
      ))}
    </div>
  );
}
