import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Nick from '../components/Nick';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import { labelOf, rankName } from '../lib/cards';
import { playDeal, playFlip, playRight, playWrong } from '../lib/cardSound';
import { playWin, setSoundOn, soundOn } from '../lib/slotSound';
import PlayingCard, { type Suit } from '../components/PlayingCard';
import CoinShower from '../components/CoinShower';
import Loading from '../components/Loading';

interface CardV { code: number; rank: number; suit: Suit }
interface Odds { p: number; mult: number }
interface GameV {
  id: string; status: 'ACTIVE' | 'CASHED' | 'LOST' | 'REFUNDED'; daily: boolean; stake: number; paid: number; step: number; card: CardV; multiplier: number; payoutNow: number; payout: number | null;
  odds: { H: Odds | null; L: Odds | null } | null; history: (CardV & { guess: 'H' | 'L' | null; won: boolean | null })[]; canCashOut: boolean; result?: 'won' | 'lost' | 'cashed' | 'maxed' | 'idle'; revealed?: CardV;
}
interface Overview {
  config: { enabled: boolean; minStake: number; maxStake: number; maxWin: number; dailyLossMax: number; dailyFree: { enabled: boolean; stake: number; maxWin: number }; idleMinutes: number };
  me: { points: number; donated: number; stakeable: number; blocked: string | null; lossLeft: number | null; dailyFreeAvailable: boolean };
  active: GameV | null;
  recent: { id: string; stake: number; valued: number; daily: boolean; status: string; step: number; payout: number | null; createdAt: string }[];
  bestStreaks: { username: string; step: number; payout: number; stake: number; status: string }[];
  biggest: { username: string; payout: number; stake: number; step: number }[];
}

const STAKES = [5, 10, 25, 50, 100];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const pct = (p: number) => `${Math.round(p * 100)} %`;
const when = (iso: string) => new Date(iso).toLocaleString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const mult = (m: number) => `×${m.toFixed(2)}`;

/** « Plus haut ou plus bas » : devine si la prochaine carte sera plus haute ou plus basse, enchaîne les bonnes réponses et encaisse quand tu veux. */
export default function HiLo() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [game, setGame] = useState<GameV | null>(null);
  const [cur, setCur] = useState<CardV | null>(null);
  const [next, setNext] = useState<CardV | null>(null);
  const [nextUp, setNextUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stake, setStake] = useState(10);
  const [flash, setFlash] = useState<'win' | 'lose' | null>(null);
  const [shake, setShake] = useState(false);
  const [dealKey, setDealKey] = useState(0);
  const [shower, setShower] = useState(0);
  const [outcome, setOutcome] = useState<{ kind: 'lost' | 'cashed'; text: string } | null>(null);
  const [sound, setSound] = useState(soundOn());
  const [points, setPoints] = useState(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/games/hilo');
      if (!alive.current) return;
      setData(r.data);
      setPoints(r.data.me.points);
      setError('');
      return r.data as Overview;
    } catch { setError('Impossible de charger le jeu'); }
  }, []);

  useEffect(() => {
    void load().then((d) => { if (d?.active) { setGame(d.active); setCur(d.active.card); setDealKey((k) => k + 1); } });
  }, [load]);

  const cfg = data?.config;
  const me = data?.me;
  const active = game?.status === 'ACTIVE';

  async function start(daily: boolean) {
    if (busy || !cfg) return;
    setError(''); setOutcome(null); setBusy(true); setNext(null); setNextUp(false); setFlash(null);
    try {
      const { data: r } = await api.post('/games/hilo/start', { stake, daily });
      setGame(r.game); setCur(r.game.card); setDealKey((k) => k + 1); playDeal();
      if (!daily) setPoints((p) => p - r.game.stake);
    } catch (e: any) { setError(e.response?.data?.message ?? 'Impossible de commencer'); }
    finally { setBusy(false); }
  }

  async function guess(g: 'H' | 'L') {
    if (busy || !game || !active) return;
    setError(''); setBusy(true);
    try {
      const { data: r } = await api.post('/games/hilo/guess', { gameId: game.id, guess: g });
      const v: GameV = r.game;
      const revealed = v.revealed!;
      setNext(revealed);
      await sleep(250);
      setNextUp(true); playFlip();
      await sleep(900);
      if (!alive.current) return;
      if (v.result === 'lost') {
        setFlash('lose'); setShake(true); playWrong();
        setGame(v);
        setOutcome({ kind: 'lost', text: `Perdu : c'était ${rankName(revealed.rank)}${revealed.rank === game.card.rank ? ' (égalité = perdu)' : ''}` });
        await sleep(900);
        setShake(false); setFlash(null);
        void load();
        return;
      }
      // bonne réponse : la nouvelle carte prend la place de l'ancienne
      setFlash('win'); playRight(v.step);
      await sleep(650);
      if (!alive.current) return;
      setGame(v); setCur(revealed); setNext(null); setNextUp(false); setDealKey((k) => k + 1); playDeal();
      setFlash(null);
      if (v.result === 'maxed') {
        setShower((n) => n + 1); playWin('big');
        setOutcome({ kind: 'cashed', text: `Gain maximal atteint : +${formatNumber(v.payout ?? 0)} points encaissés !` });
        if (r.points !== undefined) setPoints(r.points);
        void load();
      }
    } catch (e: any) { setError(e.response?.data?.message ?? 'Réponse impossible'); setNext(null); setNextUp(false); }
    finally { setBusy(false); }
  }

  async function cashOut() {
    if (busy || !game || !game.canCashOut) return;
    setBusy(true); setError('');
    try {
      const { data: r } = await api.post('/games/hilo/cashout', { gameId: game.id });
      const v: GameV = r.game;
      setGame(v); setPoints(r.points);
      setShower((n) => n + 1);
      playWin(v.step >= 5 ? 'big' : 'small', (v.payout ?? 0) / Math.max(1, v.stake));
      setOutcome({ kind: 'cashed', text: `Encaissé : +${formatNumber(v.payout ?? 0)} points (série de ${v.step})` });
      void load();
    } catch (e: any) { setError(e.response?.data?.message ?? 'Encaissement impossible'); }
    finally { setBusy(false); }
  }

  if (!data || !cfg || !me) return <Loading error={error} />;
  if (!cfg.enabled) return <div className="panel"><h1>🃏 Plus haut ou plus bas</h1><p className="muted">Ce jeu est fermé pour le moment.</p></div>;

  const stakes = STAKES.filter((s) => s >= cfg.minStake && s <= cfg.maxStake);
  const odds = game?.odds;
  const fire = game ? Math.min(game.step, 8) : 0;
  const canStart = !active && !busy && !me.blocked && me.stakeable >= stake && (me.lossLeft === null || me.lossLeft >= stake);
  const history = game ? game.history.slice(0, -1).slice(-9) : [];

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>🃏 Plus haut ou plus bas</h1>
        <Link to="/jeux" className="muted">← Tous les jeux</Link>
      </div>

      <div className={`hl-table${flash ? ` flash-${flash}` : ''}${shake ? ' shake' : ''}${fire >= 3 ? ' onfire' : ''}`}>
        <div className="hl-lights" aria-hidden="true"><i /><i /><i /></div>
        <div className="hl-top">
          <div className="hl-streak" aria-live="polite">
            <span className="hl-streak-n">{game ? game.step : 0}</span>
            <span className="hl-streak-l">{fire >= 3 ? '🔥 EN FEU' : 'série'}{'🔥'.repeat(Math.max(0, fire - 3))}</span>
          </div>
          <div className="hl-mult">
            <span className="hl-mult-v">{game ? mult(game.multiplier) : '×1.00'}</span>
            <span className="hl-mult-l">{game ? `${formatNumber(game.payoutNow)} points à encaisser` : 'multiplicateur'}</span>
          </div>
          <div className="hl-top-r">
            <span className="hl-points">Solde : <strong>{formatNumber(points)}</strong></span>
            <button type="button" className="slot-mini" onClick={() => { const v = !sound; setSound(v); setSoundOn(v); }} aria-pressed={sound} title={sound ? 'Couper le son' : 'Activer le son'}>{sound ? '🔊' : '🔇'}</button>
          </div>
        </div>

        <div className="hl-cards">
          <div className="hl-slot">
            <div className="hl-cap">Carte actuelle</div>
            <div key={dealKey} className="hl-deal">
              {cur ? <PlayingCard rank={cur.rank} suit={cur.suit} up state={flash === 'win' ? 'win' : flash === 'lose' ? 'lose' : 'idle'} /> : <PlayingCard up={false} />}
            </div>
          </div>
          <div className="hl-vs" aria-hidden="true">
            <span className={`hl-arrow up${odds?.H ? '' : ' off'}`}>▲</span>
            <span className="hl-vs-t">?</span>
            <span className={`hl-arrow down${odds?.L ? '' : ' off'}`}>▼</span>
          </div>
          <div className="hl-slot">
            <div className="hl-cap">Carte suivante</div>
            <div className={busy && !nextUp ? 'hl-shuffle' : ''}>
              <PlayingCard rank={next?.rank} suit={next?.suit} up={nextUp} state={flash === 'win' ? 'win' : flash === 'lose' ? 'lose' : 'idle'} className={active || next ? '' : 'dim'} />
            </div>
          </div>
        </div>

        {history.length > 0 && (
          <div className="hl-history" aria-label="Cartes déjà vues">
            {history.map((h, i) => (
              <span key={i} className={`hl-chip ${h.won ? 'ok' : ''}`} title={`${rankName(h.rank)} de ${h.suit}`}>
                <b style={{ color: h.suit === 'heart' || h.suit === 'diamond' ? '#ff6b6b' : '#e8e8f0' }}>{labelOf(h.rank)}{h.suit === 'heart' ? '♥' : h.suit === 'diamond' ? '♦' : h.suit === 'spade' ? '♠' : '♣'}</b>
                {h.guess ? <i>{h.guess === 'H' ? '▲' : '▼'}</i> : null}
              </span>
            ))}
          </div>
        )}

        {active && odds && (
          <div className="hl-actions">
            <button type="button" className="hl-btn higher" disabled={busy || !odds.H} onClick={() => guess('H')}>
              <span className="hl-btn-t">▲ PLUS HAUT</span>
              <span className="hl-btn-s">{odds.H ? `${pct(odds.H.p)} de chances · ${mult(odds.H.mult)}` : 'Impossible : c\'est un as'}</span>
              {odds.H && <span className="hl-bar"><i style={{ width: `${Math.round(odds.H.p * 100)}%` }} /></span>}
            </button>
            <button type="button" className="hl-btn lower" disabled={busy || !odds.L} onClick={() => guess('L')}>
              <span className="hl-btn-t">▼ PLUS BAS</span>
              <span className="hl-btn-s">{odds.L ? `${pct(odds.L.p)} de chances · ${mult(odds.L.mult)}` : 'Impossible : c\'est un 2'}</span>
              {odds.L && <span className="hl-bar"><i style={{ width: `${Math.round(odds.L.p * 100)}%` }} /></span>}
            </button>
            <button type="button" className={`hl-cash${game && game.step >= 2 ? ' hot' : ''}`} disabled={busy || !game?.canCashOut} onClick={cashOut} title={game?.canCashOut ? undefined : 'Réponds au moins une fois pour pouvoir encaisser'}>
              💰 ENCAISSER {game?.canCashOut ? `+${formatNumber(game.payoutNow)}` : ''}
            </button>
          </div>
        )}
        {active && <div className="hl-hint">Égalité de valeur = perdu. L'as est la carte la plus haute.</div>}

        {outcome && <div className={`hl-banner ${outcome.kind}`} role="status">{outcome.text}</div>}
        {shower > 0 && <CoinShower key={shower} coins={34} />}
        <div className="hl-glass" aria-hidden="true" />
      </div>

      {!active && (
        <div className="panel ornate hl-start">
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <strong>Nouvelle partie</strong>
            <div className="slot-stakes" role="group" aria-label="Mise" style={{ display: 'flex', gap: 6 }}>
              {stakes.map((s) => <button key={s} type="button" className={`secondary${stake === s ? ' on' : ''}`} onClick={() => setStake(s)} disabled={busy}>{s}</button>)}
            </div>
            <button type="button" disabled={!canStart} onClick={() => start(false)}>🃏 Distribuer · {stake} points</button>
            {me.dailyFreeAvailable && <button type="button" className="secondary" disabled={busy || !!me.blocked} onClick={() => start(true)}>🎁 Partie gratuite du jour</button>}
          </div>
          {me.blocked && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{me.blocked}</div>}
          {!me.blocked && me.stakeable < stake && !me.dailyFreeAvailable && <div className="muted" style={{ marginTop: 8 }}>Points misables insuffisants{me.donated > 0 ? ' (les points de don ne se misent pas)' : ''}.</div>}
          <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            Points misables : <strong>{formatNumber(me.stakeable)}</strong>. Chaque bonne réponse multiplie ton gain selon ses chances ; tu peux encaisser dès la première bonne réponse. Jeu de hasard avec des points du site : gagner n'est jamais garanti.
            Gain maximal par partie : {formatNumber(cfg.maxWin)} points{cfg.dailyLossMax > 0 && me.lossLeft !== null ? ` · limite du jour : encore ${formatNumber(me.lossLeft)} points` : ''}. Une partie abandonnée est réglée d'office après {cfg.idleMinutes} minutes.
          </div>
        </div>
      )}
      {error && <div className="slot-error">{error}</div>}

      <div className="moj-two">
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Mes dernières parties</h3>
          {data.recent.length === 0 ? <p className="muted">Pas encore de partie.</p> : (
            <table className="moj-board"><tbody>
              {data.recent.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{when(r.createdAt)}</td>
                  <td>{r.daily ? 'Gratuite' : `Mise ${r.stake}`} · série {r.step}</td>
                  <td style={{ textAlign: 'right', color: (r.payout ?? 0) > r.stake ? 'var(--green-bright)' : r.status === 'LOST' ? 'var(--danger)' : undefined }}><strong>{r.status === 'LOST' ? 'perdu' : r.status === 'REFUNDED' ? 'remboursé' : `+${formatNumber(r.payout ?? 0)}`}</strong></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Meilleures séries (7 jours)</h3>
          {data.bestStreaks.length === 0 ? <p className="muted">Aucune série pour l'instant.</p> : (
            <table className="moj-board"><tbody>
              {data.bestStreaks.map((b, i) => (
                <tr key={i}><td>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td><td><Nick name={b.username} /></td><td className="muted">série de {b.step}</td><td style={{ textAlign: 'right' }}><strong>{b.status === 'LOST' ? '—' : `+${formatNumber(b.payout)}`}</strong></td></tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}
