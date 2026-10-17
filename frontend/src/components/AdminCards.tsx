import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';

interface Cfg { enabled: boolean; minAccountDays: number; cardsPerPack: number; dailyPacks: number; pityPacks: number; setRewards: Record<string, number>; albumReward: number }
interface Stats {
  members: number; packsWaiting: number; packsOpened: number; packsOpened7d: number; shardsHeld: number; collectors: number; cardsHeld: number; byRarity: Record<string, number>;
  rewardsPaid: number; pointsPaid: number; earnedPacks: Record<string, number>; completions: Record<string, number>;
}
const errorOf = (e: any) => e?.response?.data?.message ?? 'Erreur';
const SETS: [string, string][] = [['hockey', 'Équipes de la LNH'], ['cinema', 'Cinéma'], ['musique', 'Musique'], ['seeduction', 'Seeduction']];

/** Admin > Jeux : les cartes à collectionner (paquets, garantie, récompenses de série) et les statistiques de collection. */
export default function AdminCards() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get('/games/cards/admin').then((r) => { setCfg(r.data.config); setStats(r.data.stats); }).catch((e) => setErr(errorOf(e))), []);
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
    try { await api.put('/games/cards/admin', cfg); setMsg('✓ Réglages enregistrés'); await load(); } catch (e) { setErr(errorOf(e)); }
  }
  const earned = Object.entries(stats.earnedPacks).map(([k, n]) => `${({ quiz: 'quiz', wheel: 'roue', picks: 'pronostics' } as Record<string, string>)[k] ?? k} : ${n}`).join(' · ') || 'aucun';

  return (
    <div className="panel" style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>🎴 Cartes à collectionner : réglages</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Les paquets se gagnent (un par jour, plus un paquet pour un quiz sans faute, 7 jours de suite à la roue ou une journée parfaite aux pronostics) et ne s'achètent jamais avec des points : ce n'est donc pas un jeu de hasard payant.
        Seuls coûts pour le site : les points offerts une seule fois par série complétée et pour l'album entier. Les doublons deviennent des éclats qui servent à fabriquer les cartes manquantes. Le catalogue (60 cartes) est dans le code du site.
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Cartes ouvertes aux membres</label>
        {num(cfg.minAccountDays, (n) => setCfg({ ...cfg, minAccountDays: n }), 'Âge minimal du compte (jours)')}
        {num(cfg.cardsPerPack, (n) => setCfg({ ...cfg, cardsPerPack: n }), 'Cartes par paquet', '2 à 6 ; la dernière est au moins rare')}
        {num(cfg.dailyPacks, (n) => setCfg({ ...cfg, dailyPacks: n }), 'Paquets par jour', '0 à 5')}
        {num(cfg.pityPacks, (n) => setCfg({ ...cfg, pityPacks: n }), 'Légendaire garantie après', 'paquets (5 à 500)')}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {SETS.map(([id, name]) => num(cfg.setRewards[id] ?? 0, (n) => setCfg({ ...cfg, setRewards: { ...cfg.setRewards, [id]: n } }), `Série « ${name} » (points)`))}
        {num(cfg.albumReward, (n) => setCfg({ ...cfg, albumReward: n }), 'Album complet (points)')}
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button type="button" onClick={save}>Enregistrer</button>
        {msg && <span style={{ color: 'var(--success)' }}>{msg}</span>}
        {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
      </div>
      <div className="muted" style={{ fontSize: 13, display: 'grid', gap: 4 }}>
        <div>Paquets : {formatNumber(stats.packsOpened)} ouverts ({formatNumber(stats.packsOpened7d)} sur 7 jours) · {formatNumber(stats.packsWaiting)} en attente · {formatNumber(stats.shardsHeld)} éclats détenus</div>
        <div>Collectionneurs : {formatNumber(stats.collectors)} · {formatNumber(stats.cardsHeld)} cartes en circulation (communes {stats.byRarity.common ?? 0}, rares {stats.byRarity.rare ?? 0}, épiques {stats.byRarity.epic ?? 0}, légendaires {stats.byRarity.legendary ?? 0})</div>
        <div>Paquets gagnés dans les jeux : {earned}</div>
        <div>Séries complétées : {formatNumber(stats.rewardsPaid)} · {formatNumber(stats.pointsPaid)} points offerts au total</div>
      </div>
    </div>
  );
}
