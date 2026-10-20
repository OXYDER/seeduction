import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Nick from '../components/Nick';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import Loading from '../components/Loading';

interface Prize { from: number; to: number; points: number; tokens: number; packs: number }
export interface TournamentData {
  enabled: boolean; weekKey: string; endsAt: string; jackpot: number;
  rules: { weights: { event: string; label: string; points: number }[]; weeklyCap: number; minPointsToRank: number; minAccountDays: number; prizes: Prize[]; participation: { minPoints: number; points: number }; jackpotMinWinnerPoints: number };
  me: { points: number; rank: number | null; ranked: boolean; participants: number; toNextRank: number | null; toRank: number; cap: number; breakdown: { source: string; label: string; points: number; count: number }[] };
  board: { rank: number; username: string; points: number; mine: boolean; prize: { points: number; tokens: number; packs: number } | null }[];
  lastWeek: { weekKey: string; participants: number; jackpot: number; top: { rank: number; username: string; points: number; prize: number }[]; mine: { rank: number | null; points: number; prizePoints: number; tokens: number; packs: number; jackpot: number } | null } | null;
  champions: { weekKey: string; participants: number; jackpot: number; winner: string | null; winnerPoints: number | null }[];
}

/** « 2 j 5 h », « 4 h 10 » : temps restant avant la fin de la semaine. */
export function timeLeft(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return 'terminé';
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return h >= 48 ? `${Math.floor(h / 24)} j ${h % 24} h` : h >= 1 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}
const rankLabel = (n: number) => (n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : `${n}e`);
const prizeText = (p: { points: number; tokens: number; packs: number }) => [p.points > 0 ? `${formatNumber(p.points)} pts` : '', p.tokens > 0 ? `${p.tokens} 🎟️` : '', p.packs > 0 ? `${p.packs} 🎴` : ''].filter(Boolean).join(' · ');
const weekLabel = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' });

/** Tournoi de la semaine : classement gratuit alimenté par les jeux gratuits, avec prix et gros lot offerts par le site. */
export default function Tournament() {
  const [d, setD] = useState<TournamentData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const load = () => api.get('/games/tournament').then((r) => setD(r.data)).catch((e) => setError(e.response?.data?.message ?? 'Chargement impossible'));
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    return () => clearInterval(t);
  }, []);
  if (!d) return error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : <Loading />;
  if (!d.enabled) return <div className="panel"><h1 style={{ marginTop: 0 }}>🏆 Tournoi de la semaine</h1><p className="muted">Le tournoi est fermé pour le moment.</p></div>;

  const me = d.me;
  const pct = Math.min(100, Math.round((me.points / Math.max(1, me.cap)) * 100));
  const myTier = me.rank ? d.rules.prizes.find((p) => me.rank! >= p.from && me.rank! <= p.to) : null;
  return (
    <div className="grid">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>🏆 Tournoi de la semaine</h1>
        <Link to="/jeux" className="button secondary">← Les jeux</Link>
      </div>

      <div className="tn-hero">
        <div><div className="tn-big">{formatNumber(d.jackpot)} <small>pts</small></div><div>🎰 Gros lot de la semaine</div><div className="muted" style={{ fontSize: 12.5 }}>Pour le 1<sup>er</sup> s'il atteint {d.rules.jackpotMinWinnerPoints} points, sinon il grossit.</div></div>
        <div><div className="tn-big">{timeLeft(d.endsAt)}</div><div>⏱️ Avant la fin de la semaine</div><div className="muted" style={{ fontSize: 12.5 }}>Résultats le lundi matin, heure de Montréal.</div></div>
        <div><div className="tn-big">{formatNumber(me.participants)}</div><div>👥 Participant{me.participants > 1 ? 's' : ''}</div><div className="muted" style={{ fontSize: 12.5 }}>Gratuit : rien à miser, rien à payer.</div></div>
      </div>

      <div className="panel" style={{ display: 'grid', gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
          <h3 style={{ margin: 0 }}>Ma semaine</h3>
          <span><strong style={{ fontSize: 22 }}>{formatNumber(me.points)}</strong> point{me.points > 1 ? 's' : ''}{me.rank ? <> · <strong>{rankLabel(me.rank)}</strong> sur {me.participants}</> : null}</span>
        </div>
        <div className="ach-bar" aria-label={`${pct} % du plafond de la semaine`}><span style={{ width: `${pct}%` }} /></div>
        {!me.ranked
          ? <p style={{ margin: 0 }}>{me.points === 0 ? 'Joue à un jeu gratuit pour marquer tes premiers points.' : `Encore ${me.toRank} point${me.toRank > 1 ? 's' : ''} pour entrer au classement.`}{d.rules.participation.points > 0 && me.points < d.rules.participation.minPoints ? ` Dès ${d.rules.participation.minPoints} points, un petit prix de participation (+${d.rules.participation.points} pts) t'est offert.` : ''}</p>
          : <p style={{ margin: 0 }}>{myTier ? <>Prix actuel : <strong>{prizeText(myTier)}</strong>. </> : 'Hors des prix de rang pour l\'instant. '}{me.toNextRank ? `Encore ${me.toNextRank} point${me.toNextRank > 1 ? 's' : ''} pour gagner une place.` : 'Tu es en tête !'}</p>}
        {me.breakdown.length > 0 && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {me.breakdown.map((b) => <span key={b.source} className="badge" title={`${b.count} fois`}>{b.label} · {b.points} pts</span>)}
          </div>
        )}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link to="/jeux/roue" className="button secondary">🎡 Roue</Link><Link to="/jeux/quiz" className="button secondary">🧠 Quiz</Link><Link to="/jeux/pronostics" className="button secondary">🏒 Pronostics</Link><Link to="/jeux/cartes" className="button secondary">🎴 Cartes</Link><Link to="/jeux/defis" className="button secondary">🎯 Défis</Link>
        </div>
      </div>

      <div className="tn-cols">
        <div className="panel" style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
          <h3 style={{ margin: 0 }}>Classement</h3>
          {d.board.length === 0 ? <span className="muted">Personne n'est encore classé cette semaine : sois le premier !</span> : (
            <table>
              <tbody>
                {d.board.map((r) => (
                  <tr key={r.rank} style={r.mine ? { background: 'rgba(224,184,74,.14)', fontWeight: 700 } : undefined}>
                    <td style={{ width: 44 }}>{rankLabel(r.rank)}</td><td><Nick name={r.username} />{r.mine && ' (toi)'}</td><td style={{ textAlign: 'right' }}>{formatNumber(r.points)} pts</td><td className="muted" style={{ fontSize: 12 }}>{r.prize ? prizeText(r.prize) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <small className="muted">En cas d'égalité, celui qui a atteint son total en premier passe devant.</small>
        </div>

        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <div className="panel" style={{ display: 'grid', gap: 6 }}>
            <h3 style={{ margin: 0 }}>Prix offerts par le site</h3>
            {d.rules.prizes.map((p) => <div key={p.from} className="row" style={{ justifyContent: 'space-between' }}><span>{p.from === p.to ? `${rankLabel(p.from)}` : `${p.from}e à ${p.to}e`}</span><strong>{prizeText(p) || '—'}</strong></div>)}
            {d.rules.participation.points > 0 && <div className="row" style={{ justifyContent: 'space-between' }}><span>Participation ({d.rules.participation.minPoints} pts)</span><strong>{d.rules.participation.points} pts</strong></div>}
            <div className="row" style={{ justifyContent: 'space-between' }}><span>🎰 Gros lot (1<sup>er</sup>, dès {d.rules.jackpotMinWinnerPoints} pts)</span><strong>{formatNumber(d.jackpot)} pts</strong></div>
          </div>
          <div className="panel" style={{ display: 'grid', gap: 4 }}>
            <h3 style={{ margin: 0 }}>Comment marquer des points ?</h3>
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Uniquement avec les jeux gratuits. Jamais en misant.</p>
            {d.rules.weights.map((w) => <div key={w.event} className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}><span>{w.label}</span><strong>+{w.points}</strong></div>)}
            <small className="muted">Plafond : {formatNumber(d.rules.weeklyCap)} points par semaine · compte d'au moins {d.rules.minAccountDays} jour{d.rules.minAccountDays > 1 ? 's' : ''} · {d.rules.minPointsToRank} points pour être classé.</small>
          </div>
        </div>
      </div>

      {d.lastWeek && (
        <div className="panel" style={{ display: 'grid', gap: 6 }}>
          <h3 style={{ margin: 0 }}>Semaine du {weekLabel(d.lastWeek.weekKey)} : résultats</h3>
          <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
            {d.lastWeek.top.map((t) => <span key={t.rank}>{rankLabel(t.rank)} <strong><Nick name={t.username} /></strong> · {formatNumber(t.points)} pts{t.prize > 0 ? ` · +${formatNumber(t.prize)}` : ''}</span>)}
          </div>
          {d.lastWeek.mine && <p style={{ margin: 0 }}>{d.lastWeek.mine.rank ? `Tu as terminé ${d.lastWeek.mine.rank === 1 ? '1er' : d.lastWeek.mine.rank + 'e'}` : 'Merci d\'avoir participé'} avec {formatNumber(d.lastWeek.mine.points)} points : <strong>+{formatNumber(d.lastWeek.mine.prizePoints + d.lastWeek.mine.jackpot)} pts</strong>{d.lastWeek.mine.tokens > 0 ? ` et ${d.lastWeek.mine.tokens} jeton${d.lastWeek.mine.tokens > 1 ? 's' : ''} freeleech` : ''}.</p>}
        </div>
      )}
      {d.champions.length > 0 && (
        <div className="panel" style={{ display: 'grid', gap: 4 }}>
          <h3 style={{ margin: 0 }}>👑 Les champions</h3>
          {d.champions.filter((c) => c.winner).map((c) => <div key={c.weekKey} className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}><span>Semaine du {weekLabel(c.weekKey)}</span><span><strong>{c.winner}</strong> · {formatNumber(c.winnerPoints ?? 0)} pts{c.jackpot > 0 ? ` · 🎰 ${formatNumber(c.jackpot)}` : ''}</span></div>)}
        </div>
      )}
    </div>
  );
}
