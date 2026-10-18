import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import { playWin, setSoundOn, soundOn } from '../lib/slotSound';
import { useCountdown } from '../components/FreeleechCalendar';
import CoinShower from '../components/CoinShower';
import '../games.css';

interface ChallengeV { id: string; event: string; tier: 'easy' | 'medium' | 'hard'; tierLabel: string; icon: string; title: string; desc: string; target: number; progress: number; done: boolean; points: number; packs: number }
interface Bonus { done: boolean; points: number; packs: number }
interface Overview {
  enabled: boolean; blocked: string | null; today: string; weekStart: string; resetsAt: string; weekResetsAt: string;
  daily: ChallengeV[]; weekly: ChallengeV[]; bonus: { daily: Bonus; weekly: Bonus }; streak: number; gamesToday: string[]; me: { completed: number; points: number };
}

/** Où aller pour avancer un défi. */
const LINK: Record<string, string> = {
  wheel: '/jeux/roue', quiz: '/jeux/quiz', quiz_correct: '/jeux/quiz', quiz_perfect: '/jeux/quiz', picks: '/jeux/pronostics', picks_won: '/jeux/pronostics',
  cards_open: '/jeux/cartes', cards_daily: '/jeux/cartes', free_play: '/jeux', distinct: '/jeux',
};
const GAME_LABEL: Record<string, string> = { wheel: 'Roue', quiz: 'Quiz', picks: 'Pronostics', cards: 'Cartes', slots: 'Machines', hilo: 'Plus haut/bas', blackjack: 'Blackjack', dice: 'Dés' };

function Card({ c }: { c: ChallengeV }) {
  const pct = Math.round((c.progress / c.target) * 100);
  return (
    <div className={`ch-card t-${c.tier}${c.done ? ' done' : ''}`}>
      <div className="ch-head">
        <span className="ch-icon" aria-hidden="true">{c.done ? '✅' : c.icon}</span>
        <div className="ch-titles"><strong>{c.title}</strong><span className="ch-tier">{c.tierLabel}</span></div>
        <div className="ch-reward">{c.points > 0 && <span className="ch-chip">+{c.points} pts</span>}{c.packs > 0 && <span className="ch-chip pack">🎴 +{c.packs}</span>}</div>
      </div>
      <p className="ch-desc">{c.desc}</p>
      <div className="ch-bar" role="progressbar" aria-valuenow={c.progress} aria-valuemin={0} aria-valuemax={c.target}><div style={{ width: `${pct}%` }} /><span>{c.progress} / {c.target}</span></div>
      {!c.done && <Link to={LINK[c.event] ?? '/jeux'} className="ch-go">Y aller →</Link>}
      {c.done && <span className="ch-ok">Défi réussi !</span>}
    </div>
  );
}

function BonusBar({ done, total, bonus, label }: { done: number; total: number; bonus: Bonus; label: string }) {
  return (
    <div className={`ch-bonus${bonus.done ? ' got' : ''}`}>
      <span className="ch-bonus-i">{bonus.done ? '🌟' : '🎁'}</span>
      <div><strong>{bonus.done ? `Bonus ${label} reçu !` : `Réussis les ${total} défis ${label}`}</strong><div className="muted" style={{ fontSize: 13 }}>{bonus.done ? 'Bravo, reviens pour la suite.' : `Bonus : ${bonus.points > 0 ? `+${bonus.points} points` : ''}${bonus.points > 0 && bonus.packs > 0 ? ' et ' : ''}${bonus.packs > 0 ? `${bonus.packs} paquet${bonus.packs > 1 ? 's' : ''} de cartes` : ''}`}</div></div>
      <span className="ch-bonus-n">{done}/{total}</span>
    </div>
  );
}

/** Défis quotidiens et hebdomadaires : des objectifs simples sur les activités gratuites, avec de petites récompenses et un bonus quand on les réussit tous. */
export default function Defis() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [shower, setShower] = useState(0);
  const [sound, setSound] = useState(soundOn());
  const seen = useRef<Set<string> | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/games/challenges');
      if (!alive.current) return;
      const d: Overview = r.data;
      const done = new Set([...d.daily, ...d.weekly].filter((c) => c.done).map((c) => `${c.id}`));
      if (seen.current && [...done].some((id) => !seen.current!.has(id))) { setShower((n) => n + 1); playWin('small', 2); }
      seen.current = done;
      setData(d); setError('');
    } catch { setError('Impossible de charger les défis'); }
  }, []);
  useEffect(() => { void load(); const t = setInterval(() => { if (!document.hidden) void load(); }, 20_000); return () => clearInterval(t); }, [load]);

  const leftDay = useCountdown(data?.resetsAt ?? null);
  const leftWeek = useCountdown(data?.weekResetsAt ?? null);

  if (!data) return <p className="muted">{error || 'Chargement…'}</p>;
  if (!data.enabled) return <div className="panel"><h1>🎯 Défis</h1><p className="muted">Les défis sont fermés pour le moment.</p></div>;
  const dDone = data.daily.filter((c) => c.done).length, wDone = data.weekly.filter((c) => c.done).length;

  return (
    <div className="ch-page">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>🎯 Défis</h1>
        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          <Link to="/jeux" className="muted">← Jeux</Link>
          <button type="button" className="secondary" onClick={() => { const v = !sound; setSound(v); setSoundOn(v); }} aria-label={sound ? 'Couper le son' : 'Activer le son'}>{sound ? '🔊' : '🔇'}</button>
        </div>
      </div>
      {data.blocked && <div className="panel" style={{ color: 'var(--danger)' }}>{data.blocked}</div>}
      {error && <div className="slot-error">{error}</div>}

      <div className="ch-hero">
        <div className="ch-stat"><span className="ch-stat-v">{data.streak > 0 ? `🔥 ${data.streak}` : '–'}</span><span className="ch-stat-l">jour{data.streak > 1 ? 's' : ''} de suite avec tous les défis</span></div>
        <div className="ch-stat"><span className="ch-stat-v">{data.me.completed}</span><span className="ch-stat-l">défis réussis au total</span></div>
        {data.me.points > 0 && <div className="ch-stat"><span className="ch-stat-v" style={{ color: 'var(--green-bright)' }}>+{formatNumber(data.me.points)}</span><span className="ch-stat-l">points gagnés avec les défis</span></div>}
        <div className="ch-stat"><span className="ch-stat-v">{data.gamesToday.length}</span><span className="ch-stat-l">jeu{data.gamesToday.length > 1 ? 'x' : ''} essayé{data.gamesToday.length > 1 ? 's' : ''} aujourd'hui{data.gamesToday.length > 0 ? ` (${data.gamesToday.map((g) => GAME_LABEL[g] ?? g).join(', ')})` : ''}</span></div>
      </div>

      <section className="ch-section">
        <div className="ch-section-head"><h2>☀️ Défis du jour</h2><span className="muted">Nouveaux défis dans {leftDay ?? '…'}</span></div>
        <BonusBar done={dDone} total={data.daily.length} bonus={data.bonus.daily} label="du jour" />
        <div className="ch-grid">{data.daily.map((c) => <Card key={c.id} c={c} />)}</div>
      </section>

      <section className="ch-section">
        <div className="ch-section-head"><h2>📅 Défis de la semaine</h2><span className="muted">Nouveaux défis lundi, dans {leftWeek ?? '…'}</span></div>
        <BonusBar done={wDone} total={data.weekly.length} bonus={data.bonus.weekly} label="de la semaine" />
        <div className="ch-grid">{data.weekly.map((c) => <Card key={c.id} c={c} />)}</div>
      </section>

      <p className="muted" style={{ fontSize: 12.5 }}>Les défis portent sur des activités gratuites (roue, quiz, pronostics, cartes et parties gratuites du jour) : aucun ne demande de miser des points. Les récompenses sont versées dès qu'un défi est réussi.</p>
      {shower > 0 && <CoinShower key={shower} coins={40} items={['🎯', '⭐']} />}
    </div>
  );
}
