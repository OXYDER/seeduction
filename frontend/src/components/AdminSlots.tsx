import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import { MACHINE_ORDER, SKINS, type MachineId } from '../lib/slotSkins';

interface Cfg {
  enabled: boolean; minStake: number; maxStake: number; dailyLossMax: number; maxWin: number; minAccountDays: number;
  jackpot: { enabled: boolean; seed: number; rate: number; minStake: number };
  dailyFree: { enabled: boolean; stake: number; maxWin: number }; machines: Record<MachineId, boolean>; profile: 'prudent' | 'equilibre' | 'genereux';
}
interface Totals { spins: number; wagered: number; paid: number; houseProfit: number; observedRtp: number | null }
interface Admin {
  config: Cfg; profiles: { id: 'prudent' | 'equilibre' | 'genereux'; label: string; rtp: number; houseEdge: number; atLeastStake: number; bonusRate: number }[];
  theoretical: { rtp: number; hitRate: number; atLeastStake: number; houseEdge: number; maxMultiple: number };
  totals: { day: Totals; week: Totals; all: Totals }; machines: { machine: string; spins: number; wagered: number; paid: number }[];
}

const errorOf = (e: any) => e?.response?.data?.message ?? 'Erreur';

/** Admin > Jeux : machines à sous (réglages, comptes de la maison). */
export default function AdminSlots() {
  const [d, setD] = useState<Admin | null>(null);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get('/games/slots/admin').then((r) => { setD(r.data); setCfg(r.data.config); }).catch((e) => setErr(errorOf(e))), []);
  useEffect(() => { void load(); }, [load]);
  if (!d || !cfg) return err ? <p style={{ color: 'var(--danger)' }}>{err}</p> : null;

  const num = (v: number, set: (n: number) => void, label: string, hint?: string) => (
    <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>{label}
      <input type="number" min={0} value={v} onChange={(e) => set(Number(e.target.value))} style={{ width: 110 }} />
      {hint && <span className="muted" style={{ fontSize: 11.5 }}>{hint}</span>}
    </label>
  );
  async function save() {
    setMsg(''); setErr('');
    try { await api.put('/games/slots/admin', cfg); setMsg('✓ Réglages enregistrés'); await load(); } catch (e) { setErr(errorOf(e)); }
  }
  const row = (label: string, t: Totals) => (
    <tr key={label} style={{ borderTop: '1px solid var(--border)' }}>
      <td>{label}</td><td>{formatNumber(t.spins)}</td><td>{formatNumber(t.wagered)}</td><td>{formatNumber(t.paid)}</td>
      <td style={{ color: t.houseProfit >= 0 ? 'var(--green-bright)' : 'var(--danger)' }}><strong>{t.houseProfit >= 0 ? '+' : ''}{formatNumber(t.houseProfit)}</strong></td>
      <td>{t.observedRtp === null ? '–' : `${t.observedRtp} %`}</td>
    </tr>
  );

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel" style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0 }}>🎰 Machines à sous : réglages</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Le site paie les gains et garde les mises perdues. Avec le réglage choisi, la maison gagne en moyenne <strong>{d.theoretical.houseEdge} %</strong> de ce qui est misé (retour théorique au joueur : {d.theoretical.rtp} %) ; environ {Math.round(d.theoretical.atLeastStake)} % des tours rendent au moins la mise, sans compter le bonus. Les résultats varient beaucoup à court terme.
        </p>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Machines à sous ouvertes aux membres</label>
        <div>
          <strong style={{ fontSize: 13 }}>Générosité des machines</strong>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
            {d.profiles.map((p) => (
              <label key={p.id} className="panel" style={{ display: 'grid', gap: 2, padding: '8px 12px', cursor: 'pointer', borderColor: cfg.profile === p.id ? 'var(--gold-bright)' : undefined, minWidth: 200 }}>
                <span><input type="radio" name="slot-profile" checked={cfg.profile === p.id} onChange={() => setCfg({ ...cfg, profile: p.id })} /> <strong>{p.label}</strong></span>
                <span style={{ fontSize: 12.5 }}>Retour au joueur : {p.rtp} % · le site garde {p.houseEdge} %</span>
                <span className="muted" style={{ fontSize: 12 }}>Bonus : 1 tour sur {Math.round(100 / p.bonusRate)}</span>
              </label>
            ))}
          </div>
          <span className="muted" style={{ fontSize: 12 }}>Le retour reste toujours sous 100 % : la maison gagne à long terme, quel que soit le choix. Plus c'est généreux, plus les membres gagnent souvent.</span>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {num(cfg.minStake, (n) => setCfg({ ...cfg, minStake: n }), 'Mise minimale', 'Multiple de 5')}
          {num(cfg.maxStake, (n) => setCfg({ ...cfg, maxStake: n }), 'Mise maximale', 'Multiple de 5')}
          {num(cfg.dailyLossMax, (n) => setCfg({ ...cfg, dailyLossMax: n }), 'Pertes max. par 24 h', '0 = sans limite')}
          {num(cfg.maxWin, (n) => setCfg({ ...cfg, maxWin: n }), 'Gain maximal par partie', '0 = sans plafond')}
          {num(cfg.minAccountDays, (n) => setCfg({ ...cfg, minAccountDays: n }), 'Ancienneté du compte (jours)')}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.dailyFree.enabled} onChange={(e) => setCfg({ ...cfg, dailyFree: { ...cfg.dailyFree, enabled: e.target.checked } })} /> Un tour gratuit par jour</label>
          {num(cfg.dailyFree.stake, (n) => setCfg({ ...cfg, dailyFree: { ...cfg.dailyFree, stake: n } }), 'Valeur du tour gratuit', 'Mise fictive (multiple de 5)')}
          {num(cfg.dailyFree.maxWin, (n) => setCfg({ ...cfg, dailyFree: { ...cfg.dailyFree, maxWin: n } }), 'Gain maximal du tour gratuit', 'Points offerts par le site')}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.jackpot.enabled} onChange={(e) => setCfg({ ...cfg, jackpot: { ...cfg.jackpot, enabled: e.target.checked } })} /> 🏆 Gros lot progressif</label>
          {num(cfg.jackpot.seed, (n) => setCfg({ ...cfg, jackpot: { ...cfg.jackpot, seed: n } }), 'Mise de départ du gros lot', 'Points offerts par le site à chaque remise à zéro')}
          {num(Math.round(cfg.jackpot.rate * 1000) / 10, (n) => setCfg({ ...cfg, jackpot: { ...cfg.jackpot, rate: n / 100 } }), 'Part de chaque mise (%)', 'Alimente la cagnotte (0 à 10 %)')}
          {num(cfg.jackpot.minStake, (n) => setCfg({ ...cfg, jackpot: { ...cfg.jackpot, minStake: n } }), 'Mise minimale pour le gagner', 'En dessous : prix fixe habituel')}
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {MACHINE_ORDER.map((m) => (
            <label key={m} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.machines[m]} onChange={(e) => setCfg({ ...cfg, machines: { ...cfg.machines, [m]: e.target.checked } })} /> {SKINS[m].icon} {SKINS[m].name}</label>
          ))}
        </div>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <button type="button" onClick={save}>Enregistrer</button>
          {msg && <span style={{ color: 'var(--success)' }}>{msg}</span>}
          {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Comptes de la maison</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead><tr style={{ textAlign: 'left' }}><th /><th>Parties</th><th>Misé</th><th>Payé</th><th>Bénéfice du site</th><th>Retour observé</th></tr></thead>
          <tbody>{row('24 heures', d.totals.day)}{row('7 jours', d.totals.week)}{row('Depuis le début', d.totals.all)}</tbody>
        </table>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          Misé = points débités aux membres (perdus ou rendus en gains). Payé = points versés aux joueurs, tours gratuits quotidiens compris. Le retour observé s'approche du retour théorique avec le nombre de parties ; sur peu de parties, il peut s'en écarter beaucoup, dans les deux sens.
        </p>
        {d.machines.length > 0 && (
          <div className="muted" style={{ fontSize: 12.5 }}>Par machine : {d.machines.map((m) => `${SKINS[m.machine as MachineId]?.name ?? m.machine} : ${formatNumber(m.spins)} parties, ${formatNumber(m.wagered)} misés, ${formatNumber(m.paid)} payés`).join(' · ')}</div>
        )}
      </div>
    </div>
  );
}
