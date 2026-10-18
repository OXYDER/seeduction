import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';

interface Cfg { enabled: boolean; winPoints: number; consolationPoints: number; tiePoints: number; maxActive: number; maxPendingOut: number; minAccountDays: number; expireHours: number; maxRewardedPerDay: number; pairCooldownDays: number }
interface Stats { created7d: number; accepted7d: number; declined7d: number; settled7d: number; rewarded7d: number; capped7d: number; pointsPaid7d: number; active: number; pending: number }
const errorOf = (e: any) => e?.response?.data?.message ?? 'Erreur';

/** Admin > Jeux : les duels entre membres (récompenses, plafonds anti-abus) et leur activité des 7 derniers jours. */
export default function AdminDuels() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get('/games/duels/admin').then((r) => { setCfg(r.data.config); setStats(r.data.stats); }).catch((e) => setErr(errorOf(e))), []);
  useEffect(() => { void load(); }, [load]);
  if (!cfg || !stats) return err ? <p style={{ color: 'var(--danger)' }}>{err}</p> : null;

  const num = (key: keyof Cfg, label: string, hint?: string) => (
    <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>{label}
      <input type="number" min={0} value={cfg[key] as number} onChange={(e) => setCfg({ ...cfg, [key]: Number(e.target.value) })} style={{ width: 110 }} />
      {hint && <span className="muted" style={{ fontSize: 11.5 }}>{hint}</span>}
    </label>
  );
  async function save() {
    setMsg(''); setErr('');
    try { await api.put('/games/duels/admin', cfg); setMsg('✓ Réglages enregistrés'); await load(); } catch (e) { setErr(errorOf(e)); }
  }

  return (
    <div className="panel" style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>⚔️ Duels entre membres : réglages</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Un membre invite un autre membre à un duel de 3 ou 7 jours sur une activité gratuite (quiz, pronostics, défis). Rien n'est misé : le site verse une récompense à la fin (plus au gagnant, un lot de consolation au perdant qui a joué,
        un lot d'égalité). Pour éviter qu'on fabrique des points à deux ou avec de faux comptes, la récompense est plafonnée par membre et par jour, et une même paire n'est récompensée qu'une fois par période.
        Personne ne reçoit rien sans avoir réellement joué pendant le duel.
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Duels ouverts aux membres</label>
        {num('winPoints', 'Points du gagnant')}
        {num('consolationPoints', 'Points de consolation', 'Perdant qui a joué')}
        {num('tiePoints', 'Points d\'égalité', 'Chacun')}
        {num('maxRewardedPerDay', 'Duels récompensés / jour', 'Par membre')}
        {num('pairCooldownDays', 'Délai par paire (jours)', 'Entre deux récompenses')}
        {num('maxActive', 'Duels en cours max')}
        {num('maxPendingOut', 'Invitations en attente max')}
        {num('expireHours', 'Expiration d\'une invitation (h)')}
        {num('minAccountDays', 'Âge minimal du compte (jours)')}
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button type="button" onClick={save}>Enregistrer</button>
        {msg && <span style={{ color: 'var(--success)' }}>{msg}</span>}
        {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        7 derniers jours : {stats.created7d} invitations envoyées, {stats.accepted7d} acceptées, {stats.declined7d} refusées · {stats.settled7d} duels réglés dont {stats.rewarded7d} avec récompense ({stats.capped7d} limités par un plafond) · {formatNumber(stats.pointsPaid7d)} points offerts.
        En ce moment : {stats.active} duels en cours, {stats.pending} invitations en attente.
      </p>
    </div>
  );
}
