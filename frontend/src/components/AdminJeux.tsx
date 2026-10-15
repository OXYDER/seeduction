import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';

type Market = 'WIN' | 'MODE' | 'SCORE';
interface Cfg {
  enabled: boolean; minStake: number; maxStake: number; dailyStakeMax: number; minPlayers: number; minAccountDays: number; openDaysBefore: number;
  freePrize: Record<Market, number>; freeWeeklyCap: number; markets: Record<Market, boolean>; preseason: boolean;
}
interface Row { id: string; startUtc: string; status: 'OPEN' | 'SETTLED' | 'REFUNDED'; result: { mine: number; theirs: number; mode: string } | null; kind: string; home: string; away: string; homeAbbrev: string; awayAbbrev: string; mineSide: string; bets: number; staked: number }

const fmt = (iso: string) => new Date(iso).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' });
const STATUS: Record<string, string> = { OPEN: '🟢 Ouvert', SETTLED: '✅ Réglé', REFUNDED: '↩️ Remboursé' };
const errorOf = (e: any) => e?.response?.data?.message ?? 'Erreur';

/** Admin > Jeux : réglages de Mise-O-jeu, liste des matchs, remboursement et règlement à la main. */
export default function AdminJeux() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState<{ id: string; mine: string; theirs: string; mode: string } | null>(null);

  const load = useCallback(() => api.get('/games/moj/admin').then((r) => { setCfg(r.data.config); setRows(r.data.matches); }).catch((e) => setErr(errorOf(e))), []);
  useEffect(() => { void load(); }, [load]);

  const num = (key: keyof Cfg, label: string, hint?: string, min = 0) => (
    <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>{label}
      <input type="number" min={min} value={cfg![key] as number} onChange={(e) => setCfg({ ...cfg!, [key]: Number(e.target.value) })} style={{ width: 110 }} />
      {hint && <span className="muted" style={{ fontSize: 11.5 }}>{hint}</span>}
    </label>
  );

  async function save() {
    setBusy(true); setMsg(''); setErr('');
    try { const r = await api.put('/games/moj/admin', cfg); setCfg(r.data.config); setMsg('✓ Réglages enregistrés'); } catch (e) { setErr(errorOf(e)); } finally { setBusy(false); }
  }
  async function act(fn: () => Promise<any>, ok: string) {
    setBusy(true); setMsg(''); setErr('');
    try { await fn(); setMsg(ok); setManual(null); await load(); } catch (e) { setErr(errorOf(e)); } finally { setBusy(false); }
  }

  if (!cfg) return <p className="muted">{err || 'Chargement…'}</p>;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel" style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0 }}>🎲 Mise-O-jeu : réglages</h2>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Jeu ouvert aux membres</label>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {num('minStake', 'Mise minimale (points)', undefined, 1)}
          {num('maxStake', 'Mise maximale par pari', undefined, 1)}
          {num('dailyStakeMax', 'Total misé par 24 h', '0 = sans limite')}
          {num('minPlayers', 'Joueurs minimum par pari', 'En dessous : mises remboursées', 2)}
          {num('minAccountDays', 'Ancienneté du compte (jours)')}
          {num('openDaysBefore', 'Ouverture avant le match (jours)', undefined, 1)}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {(['WIN', 'MODE', 'SCORE'] as const).map((k) => (
            <label key={k} style={{ display: 'grid', gap: 3, fontSize: 13 }}>Pronostic gratuit : {k === 'WIN' ? 'vainqueur' : k === 'MODE' ? 'fin du match' : 'score exact'}
              <input type="number" min={0} value={cfg.freePrize[k]} onChange={(e) => setCfg({ ...cfg, freePrize: { ...cfg.freePrize, [k]: Number(e.target.value) } })} style={{ width: 110 }} />
            </label>
          ))}
          {num('freeWeeklyCap', 'Plafond gratuit par semaine', 'Points gratuits maximum par membre sur 7 jours')}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {(['WIN', 'MODE', 'SCORE'] as const).map((k) => (
            <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.markets[k]} onChange={(e) => setCfg({ ...cfg, markets: { ...cfg.markets, [k]: e.target.checked } })} /> {k === 'WIN' ? 'Vainqueur' : k === 'MODE' ? 'Fin du match' : 'Score exact'}</label>
          ))}
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.preseason} onChange={(e) => setCfg({ ...cfg, preseason: e.target.checked })} /> Matchs de pré-saison</label>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          Caisse commune : les gagnants se partagent les mises, le site ne crée aucun point pour les mises. Seuls les pronostics gratuits en créent, dans la limite du plafond.
          Les points reçus par un don ne peuvent pas être misés. Les points offerts à chaque but du Canadien se règlent dans Événements.
        </p>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <button type="button" disabled={busy} onClick={save}>Enregistrer</button>
          {msg && <span style={{ color: 'var(--success)' }}>{msg}</span>}
          {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Matchs</h3>
        {rows.length === 0 ? <p className="muted">Aucun match pour l'instant : ils sont créés automatiquement à l'ouverture des paris.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead><tr style={{ textAlign: 'left' }}><th>Match</th><th>Début</th><th>État</th><th>Paris</th><th>Mises</th><th /></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td>{m.away} @ {m.home}{m.kind === 'SERIES' ? ' (séries)' : ''}{m.result ? <> · <strong>{m.mineSide === 'home' ? `${m.result.mine}–${m.result.theirs}` : `${m.result.theirs}–${m.result.mine}`}</strong></> : null}</td>
                  <td>{fmt(m.startUtc)}</td>
                  <td>{STATUS[m.status]}</td>
                  <td>{m.bets}</td>
                  <td>{formatNumber(m.staked)} pts</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {m.status === 'OPEN' && (
                      <>
                        <button type="button" className="secondary" disabled={busy} onClick={() => setManual({ id: m.id, mine: '', theirs: '', mode: 'REG' })}>Régler à la main</button>{' '}
                        <button type="button" className="danger" disabled={busy} onClick={() => window.confirm('Rembourser toutes les mises de ce match ?') && act(() => api.post(`/games/moj/admin/${m.id}/refund`), '✓ Match remboursé')}>Rembourser</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {manual && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
            <strong>Résultat final :</strong>
            <input type="number" min={0} placeholder="Nos buts" value={manual.mine} onChange={(e) => setManual({ ...manual, mine: e.target.value })} style={{ width: 90 }} />
            –
            <input type="number" min={0} placeholder="Leurs buts" value={manual.theirs} onChange={(e) => setManual({ ...manual, theirs: e.target.value })} style={{ width: 90 }} />
            <select value={manual.mode} onChange={(e) => setManual({ ...manual, mode: e.target.value })}>
              <option value="REG">Temps réglementaire</option><option value="OT">Prolongation</option><option value="SO">Tirs de barrage</option>
            </select>
            <button type="button" disabled={busy || manual.mine === '' || manual.theirs === ''} onClick={() => act(() => api.post(`/games/moj/admin/${manual.id}/settle`, { mine: Number(manual.mine), theirs: Number(manual.theirs), mode: manual.mode }), '✓ Match réglé')}>Régler</button>
            <button type="button" className="secondary" onClick={() => setManual(null)}>Annuler</button>
            <span className="muted" style={{ fontSize: 12.5 }}>Normalement le règlement est automatique ; sert si la LNH tarde ou se trompe.</span>
          </div>
        )}
      </div>
    </div>
  );
}
