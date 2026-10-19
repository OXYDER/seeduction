import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';
import Loading from '../components/Loading';

interface Invitee { id: string; username: string; joinedAt: string; classLabel: string; status: string; ratio: number | null; uploadedGb: number; lastSeenAt: string | null; state: 'rewarded' | 'ready' | 'waiting' | 'inactive'; daysLeft: number; classOk: boolean; reward: number }
interface Code { id: string; code: string; status: 'open' | 'used' | 'expired'; expiresAt: string | null; createdAt: string; usedBy: string | null }
interface Data {
  config: { enabled: boolean; rewardPoints: number; minDays: number; minClassLabel: string; maxPerMonth: number };
  quota: { open: number; max: number | null; rankLabel: string; canCreate: boolean };
  rewardedThisMonth: number;
  totals: { invitees: number; rewarded: number; points: number };
  codes: Code[]; invitees: Invitee[];
}
const errorOf = (e: any) => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(', ') : m ?? 'Erreur'; };
const linkOf = (code: string) => `${window.location.origin}/register?code=${code}`;

function status(i: Invitee, cfg: Data['config']): { icon: string; text: string } {
  if (i.state === 'rewarded') return i.reward > 0 ? { icon: '🎁', text: `Prime reçue : +${i.reward} points` } : { icon: '✔️', text: 'Devenu membre (sans prime)' };
  if (i.state === 'inactive') return { icon: '⛔', text: 'Compte inactif' };
  if (i.state === 'ready') return { icon: '⏳', text: 'Conditions remplies : la prime arrive (plafond mensuel ou nuit)' };
  const parts: string[] = [];
  if (i.daysLeft > 0) parts.push(`encore ${i.daysLeft} jour${i.daysLeft > 1 ? 's' : ''}`);
  if (!i.classOk) parts.push(`rang « ${cfg.minClassLabel} » à atteindre`);
  return { icon: '🌱', text: parts.join(' · ') || 'En cours' };
}

/** Parrainage : mes invitations, mes invités (leur progression) et la prime en points quand un invité devient un vrai membre. */
export default function Referrals() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/referrals').then((r) => setData(r.data)).catch((e) => setError(errorOf(e)));
  useEffect(() => { void load(); }, []);

  async function create() {
    setBusy(true); setError(''); setNote('');
    try { const r = await api.post('/referrals/invite'); await navigator.clipboard?.writeText(linkOf(r.data.code)).catch(() => undefined); setNote('Invitation créée : le lien est copié, envoie-le à ton invité (valable 7 jours).'); await load(); }
    catch (e) { setError(errorOf(e)); } finally { setBusy(false); }
  }
  async function revoke(c: Code) {
    if (!window.confirm('Retirer cette invitation ?')) return;
    try { await api.delete(`/referrals/invite/${c.id}`); await load(); } catch (e) { setError(errorOf(e)); }
  }
  async function copy(c: Code) { try { await navigator.clipboard.writeText(linkOf(c.code)); setNote('Lien copié.'); } catch { setNote(linkOf(c.code)); } }

  if (!data) return error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : <Loading />;
  const cfg = data.config;
  return (
    <div className="grid">
      <h1 style={{ marginBottom: 0 }}>🤝 Parrainage</h1>
      <div className="panel" style={{ display: 'grid', gap: 8 }}>
        <p style={{ margin: 0 }}>
          Invite des personnes de confiance. {cfg.enabled ? <>Quand l'une d'elles devient un vrai membre ({cfg.minDays} jours d'ancienneté et le rang « {cfg.minClassLabel} »), tu reçois <strong>+{cfg.rewardPoints} points bonus</strong> (au plus {cfg.maxPerMonth} primes par mois).</> : <>Les primes de parrainage sont suspendues pour l'instant.</>}
        </p>
        <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={create} disabled={busy || !data.quota.canCreate}>＋ Créer une invitation</button>
          <span className="muted">{data.quota.max === null ? `${data.quota.open} invitation${data.quota.open > 1 ? 's' : ''} ouverte${data.quota.open > 1 ? 's' : ''} (sans limite pour l'équipe)` : `${data.quota.open} / ${data.quota.max} invitations ouvertes (rang ${data.quota.rankLabel})`}</span>
          <span className="muted">Primes reçues : <strong>{data.totals.rewarded}</strong> · {data.totals.points} points · ce mois-ci {data.rewardedThisMonth}/{cfg.maxPerMonth}</span>
        </div>
        {data.quota.max === 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Ton rang ne permet pas encore d'inviter : monte en rang, ou achète une invitation dans la <Link to="/bonus">boutique bonus</Link>.</p>}
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
        {note && <span style={{ color: 'var(--success)' }}>{note}</span>}
      </div>

      <div className="panel" style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ margin: 0 }}>Mes invitations</h3>
        {data.codes.length === 0 ? <span className="muted">Aucune invitation pour l'instant.</span> : data.codes.map((c) => (
          <div key={c.id} className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
            <div style={{ minWidth: 0 }}>
              <code style={{ overflowWrap: 'anywhere' }}>{c.code.slice(0, 8)}…{c.code.slice(-4)}</code>{' '}
              {c.status === 'open' && <span className="badge">ouverte{c.expiresAt ? ` · expire le ${new Date(c.expiresAt).toLocaleDateString('fr-CA')}` : ''}</span>}
              {c.status === 'used' && <span className="badge">utilisée{c.usedBy ? ` par ${c.usedBy}` : ''}</span>}
              {c.status === 'expired' && <span className="badge">expirée</span>}
            </div>
            {c.status === 'open' && (
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="secondary" onClick={() => copy(c)}>📋 Copier le lien</button>
                <button type="button" className="secondary" onClick={() => revoke(c)} aria-label="Retirer">🗑️</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="panel" style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ margin: 0 }}>Mes invités ({data.invitees.length})</h3>
        {data.invitees.length === 0 ? <span className="muted">Personne n'a encore utilisé tes invitations.</span> : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Membre</th><th>Inscrit</th><th>Rang</th><th>Ratio</th><th>Envoyé</th><th>Vu</th><th>Prime</th></tr></thead>
              <tbody>
                {data.invitees.map((i) => {
                  const s = status(i, cfg);
                  return (
                    <tr key={i.id}>
                      <td><Link to={`/users/${i.id}`}>{i.username}</Link></td>
                      <td>{timeAgo(i.joinedAt)}</td>
                      <td>{i.classLabel}</td>
                      <td>{i.ratio === null ? '—' : i.ratio.toFixed(2)}</td>
                      <td>{i.uploadedGb.toLocaleString('fr-CA')} Go</td>
                      <td>{i.lastSeenAt ? timeAgo(i.lastSeenAt) : '—'}</td>
                      <td title={s.text}>{s.icon} <span className="muted" style={{ fontSize: 12 }}>{s.text}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
