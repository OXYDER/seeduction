import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface Cfg { enabled: boolean; perIpPerDay: number; maxPerDay: number; today: number; emailConfirmation: boolean }

/** Admin > Invitations : ouvrir les inscriptions à tous, sans code d'invitation (fermées par défaut), avec des limites contre les inscriptions en masse. */
export default function OpenRegistrationAdmin() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.get('/auth/open-registration').then((r) => setCfg(r.data)).catch(() => setError('Chargement impossible')); }, []);

  async function save(patch: Partial<Cfg>) {
    if (!cfg) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      const { data } = await api.put('/auth/open-registration', { enabled: cfg.enabled, perIpPerDay: cfg.perIpPerDay, maxPerDay: cfg.maxPerDay, ...patch });
      setCfg(data); setSaved(true);
    } catch (err: any) { setError(err.response?.data?.message ?? 'Enregistrement impossible'); }
    finally { setBusy(false); }
  }

  if (!cfg) return <div className="panel"><h3 style={{ marginTop: 0 }}>🚪 Inscriptions ouvertes</h3>{error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : <p className="muted">Chargement…</p>}</div>;
  return (
    <div className="panel" style={{ display: 'grid', gap: 10 }}>
      <h3 style={{ margin: 0 }}>🚪 Inscriptions ouvertes (sans code d'invitation)</h3>
      <p className="muted" style={{ margin: 0 }}>
        Fermées par défaut : il faut un code d'invitation. Ouvertes, n'importe qui peut créer un compte depuis la page d'inscription, avec ou sans code (un code valide garde son effet : le membre est compté comme invité par son auteur).
      </p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className={cfg.enabled ? '' : 'secondary'} disabled={busy} onClick={() => save({ enabled: true })}>🟢 Ouvertes à tous</button>
        <button type="button" className={!cfg.enabled ? '' : 'secondary'} disabled={busy} onClick={() => save({ enabled: false })}>🔒 Sur invitation seulement</button>
        <strong style={{ color: cfg.enabled ? 'var(--success)' : 'var(--text-dim)' }}>{cfg.enabled ? 'Les inscriptions sont ouvertes.' : 'Les inscriptions sont sur invitation.'}</strong>
      </div>
      {cfg.enabled && !cfg.emailConfirmation && (
        <div className="panel" style={{ borderColor: '#fbbf24' }}>
          ⚠️ Le <strong>courriel de confirmation n'est pas actif</strong> (envoi de courriels non configuré) : n'importe qui pourrait créer des comptes avec de fausses adresses. Configure l'envoi de courriels avant d'ouvrir, ou garde des limites serrées.
        </div>
      )}
      <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
        <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Inscriptions par adresse IP et par 24 h (0 = sans limite)
          <input type="number" min={0} max={100} value={cfg.perIpPerDay} onChange={(e) => setCfg({ ...cfg, perIpPerDay: Number(e.target.value) })} style={{ maxWidth: 140 }} />
        </label>
        <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Inscriptions libres au total par 24 h (0 = sans limite)
          <input type="number" min={0} max={10000} value={cfg.maxPerDay} onChange={(e) => setCfg({ ...cfg, maxPerDay: Number(e.target.value) })} style={{ maxWidth: 140 }} />
        </label>
        <button type="button" className="secondary" disabled={busy} onClick={() => save({})} style={{ alignSelf: 'end' }}>Enregistrer les limites</button>
      </div>
      <span className="muted" style={{ fontSize: 13 }}>Inscriptions libres des dernières 24 h : <strong>{cfg.today}</strong>{cfg.maxPerDay > 0 ? ` / ${cfg.maxPerDay}` : ''}. Les limites ne comptent que les inscriptions sans code.</span>
      {saved && <span style={{ color: 'var(--success)' }}>✓ Enregistré</span>}
      {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
    </div>
  );
}
