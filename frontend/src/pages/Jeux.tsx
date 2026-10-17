import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import { useCountdown } from '../components/FreeleechCalendar';
import TeamLogo from '../components/TeamLogo';

type Market = 'WIN' | 'MODE' | 'SCORE';
interface Pool { points: number; players: number }
interface MyBet { market: Market; pick: string; stake: number; status: 'PENDING' | 'WON' | 'LOST' | 'REFUNDED'; payout: number | null }
interface Match {
  id: string; startUtc: string; kind: string; status: 'OPEN' | 'SETTLED' | 'REFUNDED'; result: { mine: number; theirs: number; mode: 'REG' | 'OT' | 'SO' } | null; mineSide: 'home' | 'away';
  home: { abbrev: string; name: string }; away: { abbrev: string; name: string }; locked: boolean; pools: Partial<Record<Market, Record<string, Pool>>>; mine: MyBet[];
}
interface Overview {
  config: { enabled: boolean; minStake: number; maxStake: number; dailyStakeMax: number; minPlayers: number; freePrize: Record<Market, number>; freeWeeklyCap: number; markets: Record<Market, boolean> };
  me: { points: number; donated: number; stakeable: number; optOut: boolean; blocked: string | null; stakedToday: number; freeWonWeek: number };
  matches: Match[]; recent: Match[]; leaderboard: { rank: number; username: string; net: number; wins: number }[];
}

const MARKET_NAMES: Record<Market, string> = { WIN: 'Vainqueur', MODE: 'Fin du match', SCORE: 'Score exact' };
const MODES: Record<string, string> = { REG: 'Temps réglementaire', OT: 'Prolongation', SO: 'Tirs de barrage' };
const fmtDate = (iso: string) => new Date(iso).toLocaleString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
const fmtShort = (iso: string) => new Date(iso).toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });
const MEDAL = ['🥇', '🥈', '🥉'];

/** Gain estimé d'une mise si ce choix l'emporte, d'après la caisse actuelle (même calcul que le serveur : on partage toute la caisse au prorata des mises). */
const estimate = (pool: number, pickTotal: number, stake: number) => (stake > 0 ? Math.floor(((pool + stake) * stake) / (pickTotal + stake)) : 0);

function names(m: Match) {
  const mine = m.mineSide === 'home' ? m.home : m.away;
  const other = m.mineSide === 'home' ? m.away : m.home;
  return { mine, other };
}

function pickLabel(m: Match, market: Market, pick: string) {
  const { mine, other } = names(m);
  if (market === 'WIN') return pick === 'W' ? `${mine.name} gagnent` : `${other.name} gagnent`;
  if (market === 'MODE') return MODES[pick] ?? pick;
  const [a, b] = pick.split('-');
  return `${mine.name} ${a} – ${b} ${other.name}`;
}

function statusText(b: MyBet) {
  if (b.status === 'WON') return b.stake > 0 ? `✅ Gagné : +${formatNumber(b.payout ?? 0)} points (mise rendue comprise)` : b.payout ? `✅ Juste : +${formatNumber(b.payout)} points` : '✅ Juste (plafond hebdomadaire atteint, pas de points)';
  if (b.status === 'LOST') return b.stake > 0 ? `❌ Perdu : −${formatNumber(b.stake)} points` : '❌ Raté';
  if (b.status === 'REFUNDED') return b.stake > 0 ? `↩️ Remboursé : ${formatNumber(b.payout ?? b.stake)} points` : '↩️ Annulé';
  return b.stake > 0 ? `⏳ En jeu : ${formatNumber(b.stake)} points` : '⏳ Pronostic gratuit en attente';
}

/** Un type de pari sur un match : on choisit, on mise (ou on joue gratuitement), on valide. */
function MarketBox({ m, market, data, onDone }: { m: Match; market: Market; data: Overview; onDone: () => void }) {
  const { config, me } = data;
  const { mine, other } = names(m);
  const bet = m.mine.find((b) => b.market === market);
  const pools = m.pools[market] ?? {};
  const total = Object.values(pools).reduce((s, p) => s + p.points, 0);
  const [pick, setPick] = useState<string>(market === 'SCORE' ? '3-2' : '');
  const [free, setFree] = useState(true);
  const [stake, setStake] = useState(String(config.minStake));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const stakeN = free ? 0 : Math.floor(Number(stake) || 0);
  const maxStake = Math.max(0, Math.min(config.maxStake, me.stakeable, config.dailyStakeMax > 0 ? config.dailyStakeMax - me.stakedToday : Infinity));
  const canPlay = !m.locked && !bet && !me.blocked;
  const gain = !free && pick ? estimate(total, pools[pick]?.points ?? 0, stakeN) : 0;
  const [sa, sb] = pick.split('-').map((x) => Number(x));

  async function submit() {
    setBusy(true); setError('');
    try { await api.post('/games/moj/bet', { matchId: m.id, market, pick, stake: stakeN }); onDone(); }
    catch (e: any) { setError(e.response?.data?.message ?? 'Pari impossible'); }
    finally { setBusy(false); }
  }

  const choice = (value: string, label: JSX.Element | string) => {
    const p = pools[value];
    return (
      <button key={value} type="button" className={`moj-pick${pick === value ? ' on' : ''}`} disabled={!canPlay} onClick={() => setPick(value)}>
        <span className="moj-pick-name">{label}</span>
        <small className="muted">{p ? `${formatNumber(p.points)} pts · ${p.players} joueur${p.players > 1 ? 's' : ''}` : 'aucune mise'}</small>
      </button>
    );
  };

  return (
    <div className="moj-market">
      <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong>{MARKET_NAMES[market]}</strong>
        <span className="muted" style={{ fontSize: 12.5 }}>Caisse : {formatNumber(total)} points</span>
      </div>

      {market === 'WIN' && <div className="moj-picks">{choice('W', <><TeamLogo abbrev={mine.abbrev} name={mine.name} size={22} /> {mine.name}</>)}{choice('L', <><TeamLogo abbrev={other.abbrev} name={other.name} size={22} /> {other.name}</>)}</div>}
      {market === 'MODE' && <div className="moj-picks">{(['REG', 'OT', 'SO'] as const).map((v) => choice(v, MODES[v]))}</div>}
      {market === 'SCORE' && (
        <div className="moj-score">
          <TeamLogo abbrev={mine.abbrev} name={mine.name} size={22} />
          <input type="number" min={0} max={15} value={Number.isFinite(sa) ? sa : 0} disabled={!canPlay} aria-label={`Buts ${mine.name}`} onChange={(e) => setPick(`${Math.max(0, Math.min(15, Math.floor(Number(e.target.value) || 0)))}-${Number.isFinite(sb) ? sb : 0}`)} />
          <span>–</span>
          <input type="number" min={0} max={15} value={Number.isFinite(sb) ? sb : 0} disabled={!canPlay} aria-label={`Buts ${other.name}`} onChange={(e) => setPick(`${Number.isFinite(sa) ? sa : 0}-${Math.max(0, Math.min(15, Math.floor(Number(e.target.value) || 0)))}`)} />
          <TeamLogo abbrev={other.abbrev} name={other.name} size={22} />
          {pools[pick] && <small className="muted">{formatNumber(pools[pick].points)} pts déjà sur ce score</small>}
        </div>
      )}

      {bet ? (
        <div className="moj-mine">Ton choix : <strong>{pickLabel(m, market, bet.pick)}</strong><br />{statusText(bet)}</div>
      ) : m.locked ? (
        <div className="muted" style={{ fontSize: 13 }}>Paris fermés : le match a commencé.</div>
      ) : me.blocked ? (
        <div className="muted" style={{ fontSize: 13 }}>{me.blocked}</div>
      ) : (
        <div className="moj-form">
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className={free ? '' : 'secondary'} onClick={() => setFree(true)}>Gratuit (+{config.freePrize[market]} pts si juste)</button>
            <button type="button" className={free ? 'secondary' : ''} onClick={() => setFree(false)} disabled={maxStake < config.minStake} title={maxStake < config.minStake ? 'Pas assez de points misables' : undefined}>Miser</button>
            {!free && <input type="number" min={config.minStake} max={maxStake} value={stake} onChange={(e) => setStake(e.target.value)} style={{ width: 90 }} aria-label="Mise en points" />}
            {!free && [config.minStake, 50, 100, 250].filter((n, i, a) => n >= config.minStake && n <= maxStake && a.indexOf(n) === i).map((n) => <button key={n} type="button" className="secondary" onClick={() => setStake(String(n))}>{n}</button>)}
          </div>
          {!free && pick && <div className="muted" style={{ fontSize: 12.5 }}>Si tu gagnes : environ <strong style={{ color: 'var(--gold-bright)' }}>{formatNumber(gain)}</strong> points au total (mise comprise), selon les autres mises. Remboursé si trop peu de joueurs ({data.config.minPlayers} minimum) ou si personne ne gagne.</div>}
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <button type="button" disabled={busy || !pick || (!free && (stakeN < config.minStake || stakeN > maxStake))} onClick={submit}>{free ? 'Valider mon pronostic' : `Miser ${formatNumber(stakeN)} points`}</button>
            {error && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function MatchCard({ m, data, onDone }: { m: Match; data: Overview; onDone: () => void }) {
  const { mine, other } = names(m);
  const left = useCountdown(m.locked ? null : m.startUtc);
  const markets = (['WIN', 'MODE', 'SCORE'] as const).filter((k) => data.config.markets[k]);
  return (
    <div className="panel ornate moj-match">
      <div className="moj-head">
        <div className="moj-teams">
          <TeamLogo abbrev={mine.abbrev} name={mine.name} size={34} />
          <span className="moj-vs">{m.mineSide === 'home' ? 'vs' : '@'}</span>
          <TeamLogo abbrev={other.abbrev} name={other.name} size={34} />
          <div>
            <strong>{mine.name} {m.mineSide === 'home' ? 'contre' : 'chez'} {other.name}</strong>
            <div className="muted" style={{ fontSize: 13 }}>{fmtDate(m.startUtc)}{m.kind === 'SERIES' ? ' · Séries' : m.kind === 'PRESAISON' ? ' · Pré-saison' : ''}</div>
          </div>
        </div>
        <span className={`moj-state${m.locked ? ' locked' : ''}`}>{m.locked ? '🔒 En cours : paris fermés' : `⏱️ Les paris ferment dans ${left}`}</span>
      </div>
      <div className="moj-markets">{markets.map((k) => <MarketBox key={`${m.id}-${k}`} m={m} market={k} data={data} onDone={onDone} />)}</div>
    </div>
  );
}

export default function Jeux() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { api.get('/games/moj').then((r) => { setData(r.data); setError(''); }).catch(() => setError('Impossible de charger les jeux')); }, []);
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 20_000); return () => clearInterval(t); }, [load]);
  const [rules, setRules] = useState(false);

  const mineRecent = useMemo(() => (data?.recent ?? []).filter((m) => m.mine.length > 0), [data]);

  async function optOut(value: boolean) {
    if (value && !window.confirm('Te retirer des jeux ? Tes paris en cours restent valables, mais tu ne pourras plus en faire tant que tu ne reviens pas.')) return;
    await api.put('/games/moj/opt-out', { value }).catch(() => undefined);
    load();
  }

  if (!data) return <p className="muted">{error || 'Chargement…'}</p>;
  const { config, me } = data;
  if (!config.enabled) return <div className="panel"><h1>🎲 Jeux</h1><p className="muted">Les jeux ne sont pas ouverts pour le moment.</p></div>;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>🏒 Mise-O-jeu</h1>
        <Link to="/jeux" className="muted">← Tous les jeux</Link>
      </div>

      <div className="panel ornate">
        <div className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0 }}>🏒 Mise-O-jeu</h2>
            <div className="muted">Parie sur les matchs du Canadien, ou joue gratuitement : les gagnants se partagent les mises.</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>Points misables : <strong style={{ color: 'var(--gold-bright)' }}>{formatNumber(me.stakeable)}</strong></div>
            {me.donated > 0 && <div className="muted" style={{ fontSize: 12.5 }}>+ {formatNumber(me.donated)} points de don (dépensables ailleurs, non misables)</div>}
          </div>
        </div>
        <div className="row" style={{ gap: 14, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="secondary" onClick={() => setRules((v) => !v)}>{rules ? 'Masquer les règles' : 'Comment ça marche ?'}</button>
          <Link to="/bonus" className="muted">Mes points bonus →</Link>
          <button type="button" className="secondary" style={{ marginLeft: 'auto' }} onClick={() => optOut(!me.optOut)}>{me.optOut ? 'Revenir aux jeux' : 'Me retirer des jeux'}</button>
        </div>
        {me.blocked && <div style={{ marginTop: 10, color: 'var(--danger)' }}>{me.blocked}</div>}
        {rules && (
          <ul className="muted moj-rules">
            <li><strong>Trois paris par match</strong> : le vainqueur, la façon de finir (temps réglementaire, prolongation ou tirs de barrage) et le score exact.</li>
            <li><strong>Gratuit ou mise :</strong> un pronostic gratuit rapporte {config.freePrize.WIN} points (vainqueur), {config.freePrize.MODE} (fin du match) ou {config.freePrize.SCORE} (score exact) s'il est juste, jusqu'à {config.freeWeeklyCap} points par semaine. Une mise va dans la caisse du pari ({config.minStake} à {formatNumber(config.maxStake)} points).</li>
            <li><strong>Caisse commune :</strong> les gagnants se partagent toute la caisse selon leur mise. Le site ne crée aucun point pour les mises.</li>
            <li><strong>Remboursement :</strong> si moins de {config.minPlayers} joueurs ont misé, si personne n'a trouvé la bonne réponse, ou si tout le monde l'a trouvée, ou si le match est reporté.</li>
            <li><strong>Les paris ferment</strong> quand le match commence, et sont réglés automatiquement à la fin du match d'après le résultat officiel de la LNH.</li>
            <li><strong>Points de don :</strong> les points reçus par un don se dépensent normalement mais ne peuvent pas être misés.</li>
            <li>Limite : {config.dailyStakeMax > 0 ? `${formatNumber(config.dailyStakeMax)} points misés par 24 heures` : 'aucune'}. Tu as déjà misé {formatNumber(me.stakedToday)} points aujourd'hui.</li>
          </ul>
        )}
      </div>

      {data.matches.length === 0 ? (
        <div className="panel muted">Aucun match ouvert aux paris pour le moment : ils ouvrent quelques jours avant chaque match du Canadien.</div>
      ) : data.matches.map((m) => <MatchCard key={m.id} m={m} data={data} onDone={load} />)}

      <div className="moj-two">
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Mes derniers résultats</h3>
          {mineRecent.length === 0 ? <p className="muted">Tu n'as pas encore de pari réglé.</p> : mineRecent.map((m) => {
            const { mine, other } = names(m);
            return (
              <div key={m.id} className="moj-result">
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <TeamLogo abbrev={mine.abbrev} name={mine.name} size={18} /><TeamLogo abbrev={other.abbrev} name={other.name} size={18} />
                  <strong>{m.status === 'REFUNDED' ? 'Match annulé ou reporté' : m.result ? `${m.result.mine} – ${m.result.theirs}${m.result.mode === 'OT' ? ' (pr.)' : m.result.mode === 'SO' ? ' (tb)' : ''}` : ''}</strong>
                  <span className="muted">{mine.name} vs {other.name} · {fmtShort(m.startUtc)}</span>
                </div>
                {m.mine.map((b) => <div key={b.market} className="muted" style={{ fontSize: 13, marginLeft: 4 }}>{MARKET_NAMES[b.market]} : {pickLabel(m, b.market, b.pick)} — {statusText(b)}</div>)}
              </div>
            );
          })}
        </div>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Classement</h3>
          {data.leaderboard.length === 0 ? <p className="muted">Pas encore de résultats : le classement apparaît après le premier match réglé.</p> : (
            <table className="moj-board">
              <tbody>
                {data.leaderboard.map((r) => (
                  <tr key={r.username}><td>{MEDAL[r.rank - 1] ?? r.rank}</td><td>{r.username}</td><td className="muted">{r.wins} pari{r.wins > 1 ? 's' : ''} gagné{r.wins > 1 ? 's' : ''}</td><td style={{ textAlign: 'right', color: r.net >= 0 ? 'var(--green-bright)' : 'var(--danger)' }}><strong>{r.net >= 0 ? '+' : ''}{formatNumber(r.net)}</strong></td></tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Gains nets (récompenses et caisses gagnées moins les mises) depuis le début.</div>
        </div>
      </div>

    </div>
  );
}
