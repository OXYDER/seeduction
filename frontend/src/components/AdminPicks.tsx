import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';

interface Cfg {
  enabled: boolean; minAccountDays: number; pointsPerWin: number; comboPerWin: number; comboMax: number; perfectBonus: number; perfectMinGames: number;
  dailyCap: number; weeklyCap: number; weeklyPrizes: number[]; weeklyMinPicks: number; daysAhead: number;
}
interface Stats { picksToday: number; picksWeek: number; pointsWeek: number; picksAll: number; pointsAll: number; players7d: number }
interface G { id: number; day: string; startUtc: string; status: string; home: string; away: string; homeScore: number | null; awayScore: number | null; picks: number }
const errorOf = (e: any) => e?.response?.data?.message ?? 'Erreur';
const STATUS: Record<string, string> = { OPEN: 'Ouvert', SETTLED: 'Réglé', VOID: 'Annulé' };

/** Admin > Jeux : les pronostics gratuits sur la LNH (points, plafonds, prix hebdomadaires) et les matchs récents. */
export default function AdminPicks() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [games, setGames] = useState<G[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [score, setScore] = useState<Record<number, { home: string; away: string }>>({});
  const load = useCallback(() => api.get('/games/picks/admin').then((r) => { setCfg(r.data.config); setStats(r.data.stats); setGames(r.data.games); }).catch((e) => setErr(errorOf(e))), []);
  useEffect(() => { void load(); }, [load]);
  if (!cfg || !stats) return err ? <p style={{ color: 'var(--danger)' }}>{err}</p> : null;

  const num = (v: number, set: (n: number) => void, label: string, hint?: string) => (
    <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>{label}
      <input type="number" min={0} value={v} onChange={(e) => set(Number(e.target.value))} style={{ width: 110 }} />
      {hint && <span className="muted" style={{ fontSize: 11.5 }}>{hint}</span>}
    </label>
  );
  async function save() {
    setMsg(''); setErr('');
    try { await api.put('/games/picks/admin', cfg); setMsg('✓ Réglages enregistrés'); await load(); } catch (e) { setErr(errorOf(e)); }
  }
  async function settle(g: G) {
    const s = score[g.id];
    if (!s) return;
    setMsg(''); setErr('');
    try { await api.post(`/games/picks/admin/games/${g.id}/settle`, { home: Number(s.home), away: Number(s.away) }); setMsg('✓ Match réglé'); await load(); } catch (e) { setErr(errorOf(e)); }
  }
  async function voidGame(g: G) {
    if (!window.confirm(`Annuler ce match ? Les pronostics ne compteront pas.\n\n${g.away} @ ${g.home}`)) return;
    setMsg(''); setErr('');
    try { await api.post(`/games/picks/admin/games/${g.id}/void`); setMsg('✓ Match annulé'); await load(); } catch (e) { setErr(errorOf(e)); }
  }

  return (
    <div className="panel" style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>🎯 Pronostics LNH : réglages</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Pronostics gratuits sur tous les matchs de la LNH (saison et séries). Ce sont des cadeaux du site, sans mise : leur coût est limité par les plafonds du jour et de la semaine.
        Les matchs sont réglés automatiquement dès que la LNH publie le score final ; vous pouvez aussi les régler ou les annuler à la main ci-dessous.
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Pronostics ouverts aux membres</label>
        {num(cfg.minAccountDays, (n) => setCfg({ ...cfg, minAccountDays: n }), 'Âge minimal du compte (jours)')}
        {num(cfg.daysAhead, (n) => setCfg({ ...cfg, daysAhead: n }), 'Jours proposés à l\'avance', '1 à 6, aujourd\'hui compris')}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {num(cfg.pointsPerWin, (n) => setCfg({ ...cfg, pointsPerWin: n }), 'Points par bonne prédiction')}
        {num(cfg.comboPerWin, (n) => setCfg({ ...cfg, comboPerWin: n }), 'Bonus par prédiction de suite')}
        {num(cfg.comboMax, (n) => setCfg({ ...cfg, comboMax: n }), 'Série maximale comptée')}
        {num(cfg.perfectBonus, (n) => setCfg({ ...cfg, perfectBonus: n }), 'Bonus journée parfaite')}
        {num(cfg.perfectMinGames, (n) => setCfg({ ...cfg, perfectMinGames: n }), 'Matchs minimum', 'Pour la journée parfaite')}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {num(cfg.dailyCap, (n) => setCfg({ ...cfg, dailyCap: n }), 'Plafond par jour (points)', '0 = sans plafond')}
        {num(cfg.weeklyCap, (n) => setCfg({ ...cfg, weeklyCap: n }), 'Plafond par semaine (points)', '0 = sans plafond')}
        {[0, 1, 2].map((i) => num(cfg.weeklyPrizes[i], (n) => setCfg({ ...cfg, weeklyPrizes: cfg.weeklyPrizes.map((p, k) => (k === i ? n : p)) }), `Prix de la semaine : ${['1er', '2e', '3e'][i]}`, i === 0 ? 'Versé le lundi matin' : undefined))}
        {num(cfg.weeklyMinPicks, (n) => setCfg({ ...cfg, weeklyMinPicks: n }), 'Prédictions minimum', 'Pour un prix hebdomadaire')}
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button type="button" onClick={save}>Enregistrer</button>
        {msg && <span style={{ color: 'var(--success)' }}>{msg}</span>}
        {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Prédictions : {formatNumber(stats.picksToday)} aujourd'hui · {formatNumber(stats.picksWeek)} cette semaine ({formatNumber(stats.pointsWeek)} points offerts) · {formatNumber(stats.picksAll)} au total ({formatNumber(stats.pointsAll)} points, bonus et prix compris) · {stats.players7d} joueur{stats.players7d > 1 ? 's' : ''} sur 7 jours.
      </p>
      <div style={{ maxHeight: 360, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead><tr style={{ textAlign: 'left' }}><th>Jour</th><th>Match</th><th>État</th><th>Score</th><th>Pronostics</th><th>Régler à la main</th></tr></thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td>{g.day}</td>
                <td>{g.away} @ {g.home}</td>
                <td>{STATUS[g.status] ?? g.status}</td>
                <td>{g.homeScore !== null ? `${g.awayScore} – ${g.homeScore}` : '–'}</td>
                <td>{g.picks}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {g.status === 'OPEN' && (
                    <>
                      <input type="number" min={0} max={30} placeholder="vis." value={score[g.id]?.away ?? ''} onChange={(e) => setScore({ ...score, [g.id]: { home: score[g.id]?.home ?? '', away: e.target.value } })} style={{ width: 52 }} />{' – '}
                      <input type="number" min={0} max={30} placeholder="dom." value={score[g.id]?.home ?? ''} onChange={(e) => setScore({ ...score, [g.id]: { away: score[g.id]?.away ?? '', home: e.target.value } })} style={{ width: 52 }} />{' '}
                      <button type="button" className="secondary" onClick={() => settle(g)} disabled={!score[g.id]?.home || !score[g.id]?.away}>Régler</button>{' '}
                      <button type="button" className="secondary" onClick={() => voidGame(g)}>Annuler</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
