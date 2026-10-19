import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';

interface Prize { from: number; to: number; points: number; tokens: number; packs: number }
interface Cfg { enabled: boolean; minAccountDays: number; weights: Record<string, number>; weeklyCap: number; minPointsToRank: number; prizes: Prize[]; participation: { minPoints: number; points: number }; jackpot: { add: number; minWinnerPoints: number; cap: number } }
interface Overview { config: Cfg; weekKey: string; jackpotCarried: number; participants: number; standings: { rank: number; username: string; points: number }[]; history: { weekKey: string; participants: number; jackpot: number }[] }
const LABEL: Record<string, string> = { wheel: 'Tour de la roue', quiz: 'Quiz terminé', quiz_correct: 'Bonne réponse au quiz (par réponse)', quiz_perfect: 'Quiz sans faute (bonus)', picks: 'Pronostic fait', picks_won: 'Pronostic gagné', cards_open: 'Paquet ouvert', cards_daily: 'Paquet quotidien', free_play: 'Partie gratuite du jour' };
const errorOf = (e: any) => e?.response?.data?.message ?? 'Erreur';

/** Admin > Jeux : tournoi de la semaine (points par jeu gratuit, prix de rang, participation, gros lot progressif). Tout est offert par le site : rien n'est misé par les membres. */
export default function AdminTournament() {
  const [data, setData] = useState<Overview | null>(null);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [jackpot, setJackpot] = useState(0);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get('/games/tournament/admin').then((r) => { setData(r.data); setCfg(r.data.config); setJackpot(r.data.jackpotCarried); }).catch((e) => setErr(errorOf(e))), []);
  useEffect(() => { void load(); }, [load]);
  if (!data || !cfg) return err ? <p style={{ color: 'var(--danger)' }}>{err}</p> : null;

  const num = (v: number, set: (n: number) => void, label: string, w = 100) => (
    <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>{label}<input type="number" min={0} value={v} onChange={(e) => set(Number(e.target.value))} style={{ width: w }} /></label>
  );
  const setPrize = (i: number, patch: Partial<Prize>) => setCfg({ ...cfg, prizes: cfg.prizes.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  async function save() { setMsg(''); setErr(''); try { await api.put('/games/tournament/admin', cfg); setMsg('✓ Réglages enregistrés'); await load(); } catch (e) { setErr(errorOf(e)); } }
  async function saveJackpot() { setMsg(''); setErr(''); try { await api.put('/games/tournament/admin/jackpot', { amount: jackpot }); setMsg('✓ Gros lot fixé'); await load(); } catch (e) { setErr(errorOf(e)); } }
  async function settle() { setMsg(''); setErr(''); try { const r = await api.post('/games/tournament/admin/settle'); setMsg(r.data.settled ? `✓ ${r.data.settled} semaine(s) réglée(s)` : 'Aucune semaine terminée à régler.'); await load(); } catch (e) { setErr(errorOf(e)); } }

  return (
    <div className="panel" style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>🏆 Tournoi de la semaine : réglages</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Classement gratuit alimenté par les jeux gratuits (aucune mise, aucun droit d'entrée). Le lundi à 5 h 40, la semaine terminée est réglée : prix de rang, petit prix de participation et gros lot progressif pour le premier s'il a assez de points.
        Tout est offert par le site (source « Tournoi de la semaine » dans le journal des points). Coût maximal d'une semaine = prix de rang + gros lot + participation × nombre de participants.
      </p>
      <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Tournoi activé</label>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        {num(cfg.minAccountDays, (n) => setCfg({ ...cfg, minAccountDays: n }), 'Âge minimum du compte (jours)')}
        {num(cfg.weeklyCap, (n) => setCfg({ ...cfg, weeklyCap: n }), 'Plafond de points par semaine')}
        {num(cfg.minPointsToRank, (n) => setCfg({ ...cfg, minPointsToRank: n }), 'Points pour être classé')}
      </div>

      <div>
        <strong>Points par action</strong>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
          {Object.keys(LABEL).map((k) => <span key={k}>{num(cfg.weights[k] ?? 0, (n) => setCfg({ ...cfg, weights: { ...cfg.weights, [k]: n } }), LABEL[k], 90)}</span>)}
        </div>
      </div>

      <div>
        <strong>Prix de rang</strong>
        <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
          {cfg.prizes.map((p, i) => (
            <div key={i} className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {num(p.from, (n) => setPrize(i, { from: n }), 'Du rang', 70)}{num(p.to, (n) => setPrize(i, { to: n }), 'Au rang', 70)}{num(p.points, (n) => setPrize(i, { points: n }), 'Points', 90)}{num(p.tokens, (n) => setPrize(i, { tokens: n }), 'Jetons freeleech', 90)}{num(p.packs, (n) => setPrize(i, { packs: n }), 'Paquets de cartes', 90)}
              <button type="button" className="secondary" onClick={() => setCfg({ ...cfg, prizes: cfg.prizes.filter((_, k) => k !== i) })} aria-label="Retirer ce prix">🗑️</button>
            </div>
          ))}
          <button type="button" className="secondary" style={{ justifySelf: 'start' }} onClick={() => setCfg({ ...cfg, prizes: [...cfg.prizes, { from: (cfg.prizes.at(-1)?.to ?? 0) + 1, to: (cfg.prizes.at(-1)?.to ?? 0) + 1, points: 20, tokens: 0, packs: 0 }] })}>＋ Ajouter un prix</button>
        </div>
      </div>

      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        {num(cfg.participation.minPoints, (n) => setCfg({ ...cfg, participation: { ...cfg.participation, minPoints: n } }), 'Participation : dès (points)')}
        {num(cfg.participation.points, (n) => setCfg({ ...cfg, participation: { ...cfg.participation, points: n } }), 'Participation : prix (points)')}
        {num(cfg.jackpot.add, (n) => setCfg({ ...cfg, jackpot: { ...cfg.jackpot, add: n } }), 'Gros lot : ajouté chaque semaine')}
        {num(cfg.jackpot.minWinnerPoints, (n) => setCfg({ ...cfg, jackpot: { ...cfg.jackpot, minWinnerPoints: n } }), 'Gros lot : points du 1er requis')}
        {num(cfg.jackpot.cap, (n) => setCfg({ ...cfg, jackpot: { ...cfg.jackpot, cap: n } }), 'Gros lot : plafond')}
      </div>
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={save}>Enregistrer les réglages</button>
        {msg && <span style={{ color: 'var(--success)' }}>{msg}</span>}{err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
      </div>

      <div className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {num(jackpot, setJackpot, 'Gros lot reporté (points)', 130)}
        <button type="button" className="secondary" onClick={saveJackpot}>Fixer le gros lot de départ</button>
        <button type="button" className="secondary" onClick={settle}>Régler les semaines terminées maintenant</button>
      </div>

      <div>
        <strong>Cette semaine ({data.weekKey}) · {data.participants} participant{data.participants > 1 ? 's' : ''}</strong>
        {data.standings.length === 0 ? <div className="muted">Personne n'est encore classé.</div> : (
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 4 }}>{data.standings.slice(0, 10).map((s) => <span key={s.rank} className="badge">{s.rank}. {s.username} · {formatNumber(s.points)}</span>)}</div>
        )}
      </div>
      {data.history.length > 0 && <div className="muted" style={{ fontSize: 12.5 }}>Dernières semaines réglées : {data.history.map((h) => `${h.weekKey} (${h.participants} part.${h.jackpot ? `, gros lot ${formatNumber(h.jackpot)}` : ''})`).join(' · ')}</div>}
    </div>
  );
}
