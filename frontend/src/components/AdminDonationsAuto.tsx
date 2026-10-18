import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';
import Loading from './Loading';

interface Cfg { auto: boolean; kofi: { set: boolean; hint: string; url: string }; bmc: { set: boolean; hint: string; url: string } }
interface Ev { id: string; provider: string; kind: string; status: 'CREDITED' | 'PENDING' | 'IGNORED' | 'REFUNDED'; amount: number; currency: string; payerName: string; payerEmail: string; message: string; suggestion: string | null; username: string | null; note: string; createdAt: string }
const errorOf = (e: any) => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(', ') : m ?? 'Erreur'; };
const STATUS: Record<Ev['status'], string> = { CREDITED: '✅ Crédité', PENDING: '⏳ À attribuer', IGNORED: '— Ignoré', REFUNDED: '↩️ Remboursé' };
const PROVIDER: Record<string, string> = { kofi: 'Ko-fi', bmc: 'Buy Me a Coffee' };

/** Admin > Dons : dons automatiques. La plateforme (Ko-fi ou Buy Me a Coffee) prévient le site à chaque don ; le membre est reconnu par le pseudo écrit dans le message. */
export default function AdminDonationsAuto() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [kofi, setKofi] = useState('');
  const [bmc, setBmc] = useState('');
  const [name, setName] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get('/donations/admin/webhooks').then((r) => setCfg(r.data)).catch((e) => setError(errorOf(e)));
    api.get('/donations/admin/events').then((r) => setEvents(r.data.items)).catch(() => undefined);
  }, []);
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) api.get('/donations/admin/events').then((r) => setEvents(r.data.items)).catch(() => undefined); }, 30_000); return () => clearInterval(t); }, [load]);

  async function save(body: any, ok: string) {
    setBusy(true); setMsg(''); setError('');
    try { const { data } = await api.put('/donations/admin/webhooks', body); setCfg(data); setKofi(''); setBmc(''); setMsg(ok); } catch (e) { setError(errorOf(e)); } finally { setBusy(false); }
  }
  async function act(id: string, action: 'assign' | 'ignore', username = '') {
    setBusy(true); setMsg(''); setError('');
    try { await api.post(`/donations/admin/events/${id}/${action}`, action === 'assign' ? { username: username.trim() } : {}); setMsg(action === 'assign' ? 'Don attribué : le membre a reçu ses avantages.' : 'Don ignoré.'); load(); } catch (e) { setError(errorOf(e)); } finally { setBusy(false); }
  }
  const copy = (t: string) => navigator.clipboard?.writeText(t);

  if (!cfg) return error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : <Loading />;
  const pending = (events ?? []).filter((e) => e.status === 'PENDING').length;

  return (
    <div className="panel" style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>🤖 Dons automatiques {pending > 0 && <span className="badge" style={{ background: 'rgba(245,158,11,0.25)', color: '#fbbf24' }}>{pending} à attribuer</span>}</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Quand un membre donne sur Ko-fi ou Buy Me a Coffee, la plateforme prévient le site : le don est inscrit et les avantages du palier sont versés tout de suite. Le membre est reconnu par le pseudo écrit dans le message du don
        (« @pseudo », « pseudo : xyz », ou un message qui ne contient que le pseudo). Si le pseudo est absent ou peu clair, le don attend ici que tu l'attribues. Un paiement n'est jamais crédité deux fois, et un remboursement te prévient sans rien retirer.
      </p>
      <label className="row" style={{ gap: 8, alignItems: 'center' }}><input type="checkbox" checked={cfg.auto} disabled={busy} onChange={(e) => save({ auto: e.target.checked }, e.target.checked ? 'Crédit automatique activé.' : 'Crédit automatique désactivé : tous les dons attendront ton attribution.')} /> Créditer automatiquement quand le pseudo est clair</label>

      <details>
        <summary style={{ cursor: 'pointer' }}><strong>Ko-fi</strong> {cfg.kofi.set ? '✅ branché' : '— pas encore branché'}</summary>
        <ol className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
          <li>Dans Ko-fi : <em>Settings → API → Webhooks</em>. Colle cette adresse : <code>{cfg.kofi.url}</code> <button type="button" className="secondary" onClick={() => copy(cfg.kofi.url)}>Copier</button></li>
          <li>Ko-fi te donne un <strong>Verification Token</strong> : colle-le ici et enregistre.</li>
        </ol>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input type="password" value={kofi} onChange={(e) => setKofi(e.target.value)} placeholder={cfg.kofi.set ? `Jeton enregistré (${cfg.kofi.hint}) : coller pour remplacer` : 'Verification Token de Ko-fi'} style={{ minWidth: 280 }} autoComplete="off" />
          <button type="button" disabled={busy || !kofi.trim()} onClick={() => save({ kofiToken: kofi }, 'Jeton Ko-fi enregistré.')}>Enregistrer</button>
          {cfg.kofi.set && <button type="button" className="secondary" disabled={busy} onClick={() => save({ kofiToken: null }, 'Ko-fi débranché.')}>Débrancher</button>}
        </div>
      </details>

      <details>
        <summary style={{ cursor: 'pointer' }}><strong>Buy Me a Coffee</strong> {cfg.bmc.set ? '✅ branché' : '— pas encore branché'}</summary>
        <ol className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
          <li>Dans Buy Me a Coffee : <em>Developers → Webhooks</em> (créer un webhook). Adresse : <code>{cfg.bmc.url}</code> <button type="button" className="secondary" onClick={() => copy(cfg.bmc.url)}>Copier</button></li>
          <li>Buy Me a Coffee te donne un <strong>secret de signature</strong> : colle-le ici et enregistre.</li>
          <li>Fais un petit don d'essai pour vérifier : il doit apparaître dans la liste ci-dessous. Le format de ce service n'a pas pu être testé avec un vrai compte.</li>
        </ol>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input type="password" value={bmc} onChange={(e) => setBmc(e.target.value)} placeholder={cfg.bmc.set ? `Secret enregistré (${cfg.bmc.hint}) : coller pour remplacer` : 'Secret de signature de Buy Me a Coffee'} style={{ minWidth: 280 }} autoComplete="off" />
          <button type="button" disabled={busy || !bmc.trim()} onClick={() => save({ bmcSecret: bmc }, 'Secret Buy Me a Coffee enregistré.')}>Enregistrer</button>
          {cfg.bmc.set && <button type="button" className="secondary" disabled={busy} onClick={() => save({ bmcSecret: null }, 'Buy Me a Coffee débranché.')}>Débrancher</button>}
        </div>
      </details>

      {msg && <p style={{ margin: 0, color: 'var(--success)' }}>{msg}</p>}
      {error && <p style={{ margin: 0, color: 'var(--danger)' }}>{error}</p>}

      <h3 style={{ margin: '4px 0 0' }}>Dons reçus</h3>
      {!events ? <Loading /> : events.length === 0 ? <p className="muted" style={{ margin: 0 }}>Aucun don reçu automatiquement pour l'instant.</p> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {events.map((e) => (
            <div key={e.id} style={{ padding: '8px 10px', borderRadius: 8, background: e.status === 'PENDING' ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)', display: 'grid', gap: 4 }}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong>{e.amount} {e.currency} · {PROVIDER[e.provider] ?? e.provider}{e.kind === 'subscription' ? ' (abonnement)' : ''} · {e.payerName || 'anonyme'} <span className="muted" style={{ fontWeight: 400 }}>{e.payerEmail}</span></strong>
                <span className="muted" style={{ fontSize: 12.5 }}>{STATUS[e.status]}{e.username ? ` : ${e.username}` : ''} · {timeAgo(e.createdAt)}</span>
              </div>
              {e.message && <div style={{ fontSize: 13.5 }}>« {e.message} »</div>}
              {e.note && <div className="muted" style={{ fontSize: 12.5 }}>{e.note}</div>}
              {e.status === 'PENDING' && (
                <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input value={name[e.id] ?? e.suggestion ?? ''} onChange={(ev) => setName({ ...name, [e.id]: ev.target.value })} placeholder="Pseudo du membre" style={{ width: 200 }} />
                  <button type="button" disabled={busy || !(name[e.id] ?? e.suggestion ?? '').trim()} onClick={() => act(e.id, 'assign', name[e.id] ?? e.suggestion ?? '')}>Attribuer</button>
                  <button type="button" className="secondary" disabled={busy} onClick={() => act(e.id, 'ignore')}>Ignorer</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
