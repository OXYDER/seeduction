import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import { audio, bell, setSoundOn, soundOn, tick } from '../lib/slotSound';
import TeamLogo from '../components/TeamLogo';
import CoinShower from '../components/CoinShower';

interface Record { wins: number; losses: number; otLosses: number; points: number; gamesPlayed: number; last10: string; streak: string }
interface TeamV { abbrev: string; name: string; score: number | null; record: Record | null }
interface MineV { pick: 'H' | 'A'; status: 'PENDING' | 'WON' | 'LOST' | 'VOID'; points: number }
interface GameV { id: number; startUtc: string; status: 'OPEN' | 'SETTLED' | 'VOID'; locked: boolean; home: TeamV; away: TeamV; outcome: string | null; mine: MineV | null; crowd: { home: number; away: number } }
interface Overview {
  enabled: boolean; blocked: string | null; today: string; day: string; days: { day: string; games: number }[];
  rules: { perWin: number; comboPerWin: number; comboMax: number; perfect: number; perfectMin: number; prizes: number[]; weeklyMin: number };
  games: GameV[];
  me: { streak: number; week: { wins: number; total: number; points: number }; weekStart: string; dayEarned: number; dailyCap: number; weekEarned: number; weeklyCap: number; wins: number; won: number };
  leaderboard: { rows: { rank: number; username: string; wins: number; picks: number; points: number; mine: boolean }[]; myRank: number | null };
  lastWeek: { rank: number; username: string; points: number; wins: number; picks: number }[];
}

const dayLabel = (d: string, today: string) => {
  if (d === today) return 'Aujourd\'hui';
  const t = new Date(`${d}T12:00:00`), n = new Date(`${today}T12:00:00`);
  const diff = Math.round((t.getTime() - n.getTime()) / 86400_000);
  if (diff === -1) return 'Hier';
  if (diff === 1) return 'Demain';
  return t.toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });
};
const hour = (iso: string) => new Date(iso).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
const recText = (r: Record | null) => (r ? `${r.wins}-${r.losses}-${r.otLosses} · ${r.points} pts` : '');

function popSound() {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const t = a.c.currentTime;
  tick(a, t, 1600, 0.1, 0.03);
  bell(a, t + 0.02, 1175, 0.05, 0.3);
}
function doneSound() {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const t = a.c.currentTime + 0.01;
  [659, 784, 988, 1319].forEach((f, i) => bell(a, t + i * 0.09, f, 0.08, 0.7));
}

/** Pronostics de la LNH : choisis le vainqueur de chaque match avant le début ; chaque bonne prédiction rapporte des points, avec un bonus de série. */
export default function Pronostics() {
  const [data, setData] = useState<Overview | null>(null);
  const [day, setDay] = useState<string | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(soundOn());
  const [shower, setShower] = useState(0);
  const [pop, setPop] = useState<{ id: number; side: 'H' | 'A'; n: number } | null>(null);
  const celebrated = useRef<string>('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 20_000); return () => clearInterval(t); }, []);

  const load = useCallback(async (d?: string) => {
    try {
      const r = await api.get('/games/picks', { params: d ? { day: d } : {} });
      if (!alive.current) return;
      setData(r.data); setError('');
    } catch { setError('Impossible de charger les pronostics'); }
  }, []);
  useEffect(() => { void load(day); }, [load, day]);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) void load(day); }, 60_000); return () => clearInterval(t); }, [load, day]);

  async function choose(g: GameV, side: 'H' | 'A') {
    if (!data || busy !== null) return;
    const locked = g.locked || g.status !== 'OPEN' || new Date(g.startUtc).getTime() <= now;
    if (locked || data.blocked) return;
    setBusy(g.id); setError('');
    try {
      if (g.mine?.pick === side) await api.delete(`/games/picks/pick/${g.id}`);
      else { await api.post('/games/picks/pick', { gameId: g.id, pick: side }); setPop({ id: g.id, side, n: Date.now() }); popSound(); }
      await load(day);
    } catch (e: any) { setError(e.response?.data?.message ?? 'Pronostic impossible'); void load(day); }
    finally { if (alive.current) setBusy(null); }
  }

  const games = data?.games ?? [];
  const open = games.filter((g) => g.status === 'OPEN' && !g.locked && new Date(g.startUtc).getTime() > now);
  const picked = open.filter((g) => g.mine).length;
  const complete = !!data && open.length >= 3 && picked === open.length;
  useEffect(() => {
    if (!data || !complete) return;
    const key = `${data.day}:${open.length}`;
    if (celebrated.current === key) return;
    celebrated.current = key; doneSound(); setShower((n) => n + 1);
  }, [complete, data, open.length]);

  const totals = useMemo(() => ({
    won: games.filter((g) => g.mine?.status === 'WON').length,
    lost: games.filter((g) => g.mine?.status === 'LOST').length,
    points: games.reduce((s, g) => s + (g.mine?.status === 'WON' ? g.mine.points : 0), 0),
  }), [games]);

  if (!data) return <p className="muted">{error || 'Chargement…'}</p>;
  if (!data.enabled) return <div className="panel"><h1>🎯 Pronostics LNH</h1><p className="muted">Les pronostics sont fermés pour le moment.</p></div>;
  const me = data.me;
  const pctWeek = me.week.total > 0 ? Math.round((me.week.wins / me.week.total) * 100) : null;

  return (
    <div className="pk-page">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>🎯 Pronostics LNH</h1>
        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          <Link to="/jeux/mise-o-jeu" className="muted">🏒 Mise-O-jeu (Canadien) →</Link>
          <Link to="/jeux" className="muted">← Jeux</Link>
          <button type="button" className="secondary" onClick={() => { const v = !sound; setSound(v); setSoundOn(v); }} aria-label={sound ? 'Couper le son' : 'Activer le son'}>{sound ? '🔊' : '🔇'}</button>
        </div>
      </div>

      <div className="pk-hero">
        <div className="pk-stat"><span className="pk-stat-v">{me.streak > 0 ? `🔥 ${me.streak}` : '–'}</span><span className="pk-stat-l">bonnes prédictions de suite</span></div>
        <div className="pk-stat"><span className="pk-stat-v">{me.week.wins}<small>/{me.week.total}</small></span><span className="pk-stat-l">cette semaine{pctWeek !== null ? ` (${pctWeek} %)` : ''}</span></div>
        <div className="pk-stat"><span className="pk-stat-v" style={{ color: 'var(--green-bright)' }}>+{formatNumber(me.week.points)}</span><span className="pk-stat-l">points cette semaine</span></div>
        {me.won > 0 && <div className="pk-stat"><span className="pk-stat-v" style={{ color: 'var(--green-bright)' }}>+{formatNumber(me.won)}</span><span className="pk-stat-l">gagnés au total</span></div>}
      </div>
      <div className="pk-rules">
        ✅ <strong>{data.rules.perWin} pts</strong> par bonne prédiction · 🔥 <strong>+{data.rules.comboPerWin}</strong> par bonne prédiction de suite (jusqu'à +{data.rules.comboPerWin * data.rules.comboMax}) · 🏆 <strong>+{data.rules.perfect} pts</strong> pour une journée parfaite ({data.rules.perfectMin} matchs ou plus, tous gagnés) · 🥇 prix de {data.rules.prizes.join(', ')} pts aux trois meilleurs de la semaine
      </div>

      <div className="pk-days" role="tablist">
        {data.days.map((d) => (
          <button key={d.day} type="button" role="tab" aria-selected={d.day === data.day} className={`pk-day ${d.day === data.day ? 'on' : ''}`} onClick={() => setDay(d.day)}>
            {dayLabel(d.day, data.today)}<span>{d.games} match{d.games > 1 ? 's' : ''}</span>
          </button>
        ))}
      </div>

      <div className="pk-layout">
        <div className="pk-main">
          {data.blocked && <div className="panel" style={{ color: 'var(--danger)' }}>{data.blocked}</div>}
          {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
          {open.length > 0 && (
            <div className={`pk-progress ${complete ? 'done' : ''}`}>
              {complete ? '🎉 Journée complète : tous tes pronostics sont faits !' : `${picked} / ${open.length} pronostic${open.length > 1 ? 's' : ''} fait${picked > 1 ? 's' : ''} pour les matchs à venir`}
              <div className="pk-bar"><div style={{ width: `${open.length ? (picked / open.length) * 100 : 0}%` }} /></div>
            </div>
          )}
          {(totals.won > 0 || totals.lost > 0) && <div className="muted">Ce jour-là : {totals.won} bonne{totals.won > 1 ? 's' : ''} prédiction{totals.won > 1 ? 's' : ''} sur {totals.won + totals.lost}{totals.points > 0 ? <> · <strong style={{ color: 'var(--green-bright)' }}>+{totals.points} pts</strong></> : ''}</div>}
          {games.length === 0 && <div className="panel muted">Aucun match de la LNH ce jour-là.</div>}
          <div className="pk-grid">
            {games.map((g) => {
              const started = g.locked || g.status !== 'OPEN' || new Date(g.startUtc).getTime() <= now;
              const winner: 'H' | 'A' | null = g.status === 'SETTLED' && g.home.score !== null && g.away.score !== null ? (g.home.score > g.away.score ? 'H' : 'A') : null;
              const total = g.crowd.home + g.crowd.away;
              const hp = total > 0 ? Math.round((g.crowd.home / total) * 100) : 50;
              const team = (side: 'H' | 'A', t: TeamV) => {
                const mine = g.mine?.pick === side;
                const cls = ['pk-team', mine ? 'picked' : '', winner === side ? 'won' : winner ? 'lost' : '', started ? 'locked' : ''].filter(Boolean).join(' ');
                return (
                  <button type="button" className={cls} disabled={started || busy !== null || !!data.blocked} onClick={() => choose(g, side)} aria-pressed={mine} aria-label={`${t.name}${mine ? ' (ton choix)' : ''}`}>
                    {pop && pop.id === g.id && pop.side === side && <span key={pop.n} className="pk-burst" aria-hidden="true" />}
                    <TeamLogo abbrev={t.abbrev} name={t.name} size={44} />
                    <span className="pk-name">{t.name}</span>
                    {g.status === 'SETTLED' && <span className="pk-score">{t.score}</span>}
                    {t.record && g.status !== 'SETTLED' && <span className="pk-rec" title={`Derniers 10 matchs : ${t.record.last10}`}>{recText(t.record)}{t.record.streak ? ` · ${t.record.streak}` : ''}</span>}
                    {mine && <span className="pk-mine">{g.mine?.status === 'WON' ? `✅ +${g.mine.points}` : g.mine?.status === 'LOST' ? '❌' : '⭐ Ton choix'}</span>}
                  </button>
                );
              };
              return (
                <div key={g.id} className={`pk-game ${g.status === 'VOID' ? 'void' : ''}`}>
                  <div className="pk-game-head">
                    <span>{g.status === 'SETTLED' ? `Final${g.outcome && g.outcome !== 'Final' ? g.outcome.replace('Final', '') : ''}` : g.status === 'VOID' ? 'Annulé' : started ? '🔒 En cours' : `🕒 ${hour(g.startUtc)}`}</span>
                    {g.mine?.status === 'VOID' && <span className="muted">pronostic annulé</span>}
                  </div>
                  <div className="pk-vs">
                    {team('A', g.away)}
                    <span className="pk-at">@</span>
                    {team('H', g.home)}
                  </div>
                  <div className="pk-crowd" title={total > 0 ? `${total} membre${total > 1 ? 's' : ''} ont choisi` : 'Personne n\'a encore choisi'}>
                    {total > 0 ? <><span style={{ width: `${100 - hp}%` }} className="away" /><span style={{ width: `${hp}%` }} className="home" /></> : null}
                    <em>{total > 0 ? `${100 - hp} % · ${total} membre${total > 1 ? 's' : ''} · ${hp} %` : 'Aucun choix pour l\'instant'}</em>
                  </div>
                </div>
              );
            })}
          </div>
          {shower > 0 && <CoinShower key={shower} coins={40} items={['🏒', '⭐']} />}
        </div>

        <div className="pk-side">
          <div className="panel ornate">
            <h2 style={{ marginTop: 0 }}>🏅 Classement de la semaine</h2>
            {data.leaderboard.rows.length === 0 ? <p className="muted" style={{ margin: 0 }}>Aucune prédiction réglée cette semaine : sois le premier !</p> : (
              <ol className="pk-board">{data.leaderboard.rows.map((r) => <li key={r.rank} className={r.mine ? 'mine' : ''}><span>{['🥇', '🥈', '🥉'][r.rank - 1] ?? `${r.rank}.`} {r.username}</span><strong>{r.wins}/{r.picks}</strong></li>)}</ol>
            )}
            {data.leaderboard.myRank !== null && data.leaderboard.myRank > 10 && <p className="muted" style={{ margin: '6px 0 0' }}>Ton rang : {data.leaderboard.myRank}</p>}
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>Chaque lundi matin, les trois meilleurs (au moins {data.rules.weeklyMin} prédictions) reçoivent {data.rules.prizes.join(', ')} points.</p>
          </div>
          {data.lastWeek.length > 0 && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>🏆 Podium de la semaine dernière</h2>
              <ol className="pk-board">{data.lastWeek.map((r) => <li key={r.rank}><span>{['🥇', '🥈', '🥉'][r.rank - 1]} {r.username}</span><strong>{r.wins}/{r.picks}</strong><span className="muted">+{r.points}</span></li>)}</ol>
            </div>
          )}
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>ℹ️ Comment ça marche</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
              Touche l'équipe que tu penses gagnante, avant le début du match : tu peux changer d'avis jusque-là (touche-la encore pour retirer ton choix). Le résultat est réglé automatiquement. Gratuit : rien à miser, rien à perdre.
            </p>
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>Plafond de points : {me.dayEarned}/{me.dailyCap > 0 ? me.dailyCap : '∞'} aujourd'hui · {me.weekEarned}/{me.weeklyCap > 0 ? me.weeklyCap : '∞'} cette semaine.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
