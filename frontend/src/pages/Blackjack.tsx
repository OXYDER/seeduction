import Nick from '../components/Nick';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import { playDeal, playFlip, playWrong } from '../lib/cardSound';
import { playWin, setSoundOn, soundOn } from '../lib/slotSound';
import PlayingCard, { type Suit } from '../components/PlayingCard';
import CoinShower from '../components/CoinShower';
import Loading from '../components/Loading';
import '../games.css';

interface CardV { code: number; rank: number; suit: Suit }
type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';
interface HandV { cards: CardV[]; total: number; soft: boolean; bet: number; status: 'PLAY' | 'STAND' | 'BUST' | 'BLACKJACK'; current: boolean; split: boolean; outcome: Outcome | null; payout: number | null }
interface GameV {
  id: string; status: 'ACTIVE' | 'DONE'; daily: boolean; stake: number; paid: number;
  dealer: { cards: CardV[]; total: number; holeHidden: boolean; blackjack: boolean };
  hands: HandV[]; actions: string[]; payout: number | null; outcome: Outcome | null;
}
interface Overview {
  config: { enabled: boolean; minStake: number; maxStake: number; maxWin: number; dailyLossMax: number; dailyFree: { enabled: boolean; stake: number; maxWin: number }; idleMinutes: number; blackjackPays: string; dealerHitsSoft17: boolean; doubleAfterSplit: boolean };
  me: { points: number; donated: number; stakeable: number; blocked: string | null; lossLeft: number | null; dailyFreeAvailable: boolean };
  active: GameV | null;
  recent: { id: string; stake: number; valued: number; daily: boolean; payout: number | null; outcome: Outcome | null; createdAt: string }[];
  biggest: { username: string; payout: number; stake: number; outcome: string | null }[];
}

const STAKES = [5, 10, 25, 50, 100];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const when = (iso: string) => new Date(iso).toLocaleString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const LABEL: Record<Outcome, string> = { blackjack: 'Blackjack', win: 'Gagné', push: 'Égalité', lose: 'Perdu', bust: 'Dépassé' };
const ACTION_LABEL: Record<string, string> = { hit: 'Carte', stand: 'Rester', double: 'Doubler', split: 'Séparer' };

function Total({ h }: { h: HandV }) {
  return <span className={`bj-total${h.total > 21 ? ' bust' : h.total === 21 ? ' full' : ''}`}>{h.total > 21 ? `${h.total} · dépassé` : h.status === 'BLACKJACK' ? 'BLACKJACK' : `${h.total}${h.soft ? ' (souple)' : ''}`}</span>;
}

/** Blackjack contre le croupier : cartes tirées par le serveur, carte cachée du croupier révélée à la fin, doublement et séparation. */
export default function Blackjack() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [game, setGame] = useState<GameV | null>(null);
  const [shown, setShown] = useState(0); // cartes du croupier affichées pendant la révélation
  const [revealed, setRevealed] = useState(true); // la carte cachée est retournée
  const [banner, setBanner] = useState<{ kind: Outcome; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [stake, setStake] = useState(10);
  const [points, setPoints] = useState(0);
  const [shower, setShower] = useState(0);
  const [fresh, setFresh] = useState(false);
  const [sound, setSound] = useState(soundOn());
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/games/blackjack');
      if (!alive.current) return;
      setData(r.data); setPoints(r.data.me.points); setError('');
      return r.data as Overview;
    } catch { setError('Impossible de charger le jeu'); }
  }, []);
  useEffect(() => { void load().then((d) => { if (d?.active) { setGame(d.active); setShown(2); setRevealed(false); } }); }, [load]);

  /** Fin de partie : la carte cachée se retourne, le croupier tire ses cartes une à une, puis le résultat s'affiche. */
  const finish = useCallback(async (g: GameV) => {
    const cards = g.dealer.cards.length;
    setRevealed(false);
    await sleep(500); if (!alive.current) return;
    setRevealed(true); playFlip(); setShown(2);
    for (let n = 3; n <= cards; n++) { await sleep(700); if (!alive.current) return; setShown(n); playDeal(); }
    await sleep(500); if (!alive.current) return;
    const o = g.outcome ?? 'lose';
    const pay = g.payout ?? 0;
    const text = o === 'blackjack' ? `BLACKJACK ! +${formatNumber(pay)} points` : o === 'win' ? `Gagné ! +${formatNumber(pay)} points` : o === 'push' ? `Égalité : ta mise de ${formatNumber(pay)} points te revient`
      : o === 'bust' ? 'Dépassé 21 : pas cette fois !' : 'Le croupier l\'emporte : pas cette fois !';
    setBanner({ kind: o, text });
    if (o === 'blackjack') { playWin('mega'); setShower((n) => n + 1); }
    else if (o === 'win') { playWin(pay >= g.stake * 4 ? 'big' : 'small', 2); setShower((n) => n + 1); }
    else if (o === 'lose' || o === 'bust') playWrong();
    void load();
  }, [load]);

  async function start(daily: boolean) {
    if (busy) return;
    setError(''); setBanner(null); setBusy(true);
    try {
      const { data: r } = await api.post('/games/blackjack/start', { stake, daily });
      const g: GameV = r.game;
      setPoints(r.points); setGame(g); setShown(2); setRevealed(false);
      setFresh(true); setTimeout(() => alive.current && setFresh(false), 1500);
      for (let i = 0; i < 4; i++) { setTimeout(playDeal, i * 250); }
      if (g.status === 'DONE') { await sleep(1100); if (alive.current) await finish(g); }
    } catch (e: any) { setError(e.response?.data?.message ?? 'Impossible de distribuer'); }
    finally { if (alive.current) setBusy(false); }
  }

  async function play(action: string) {
    if (busy || !game || game.status !== 'ACTIVE') return;
    setError(''); setBusy(true);
    try {
      const { data: r } = await api.post('/games/blackjack/action', { gameId: game.id, action });
      const g: GameV = r.game;
      setPoints(r.points);
      if (action === 'hit' || action === 'double' || action === 'split') playDeal();
      setGame(g);
      if (g.status === 'DONE') await finish(g);
    } catch (e: any) { setError(e.response?.data?.message ?? 'Coup impossible'); void load().then((d) => { if (d?.active) setGame(d.active); }); }
    finally { if (alive.current) setBusy(false); }
  }

  if (!data) return <Loading error={error} />;
  if (!data.config.enabled) return <div className="panel"><h1>♠️ Blackjack</h1><p className="muted">Le blackjack est fermé pour le moment.</p></div>;

  const cfg = data.config, me = data.me;
  const active = game?.status === 'ACTIVE';
  const done = game?.status === 'DONE';
  const stakes = STAKES.filter((s) => s >= cfg.minStake && s <= cfg.maxStake);
  const canStart = !active && !busy && !me.blocked && me.stakeable >= stake && (me.lossLeft === null || me.lossLeft >= stake);
  const dealerCards = game ? game.dealer.cards : [];
  const visibleDealer = done ? dealerCards.slice(0, Math.max(shown, 2)) : dealerCards;
  const dealerTotal = done && revealed && shown >= dealerCards.length ? game!.dealer.total : null;
  const delay = (i: number) => (fresh ? { animationDelay: `${i * 0.25}s` } : undefined);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>♠️ Blackjack</h1>
        <Link to="/jeux" className="muted">← Tous les jeux</Link>
      </div>

      <div className={`bj-table${banner ? ` res-${banner.kind}` : ''}`}>
        <div className="bj-rim" aria-hidden="true" />
        <div className="bj-top">
          <span className="bj-points">Solde : <strong>{formatNumber(points)}</strong></span>
          <span className="bj-rule">Blackjack paie {cfg.blackjackPays.replace(':', ' pour ')} · le croupier {cfg.dealerHitsSoft17 ? 'tire' : 'reste'} sur 17 souple</span>
          <button type="button" className="slot-mini" onClick={() => { const v = !sound; setSound(v); setSoundOn(v); }} aria-pressed={sound} title={sound ? 'Couper le son' : 'Activer le son'}>{sound ? '🔊' : '🔇'}</button>
        </div>

        <div className="bj-zone dealer">
          <div className="bj-label">Croupier {game && dealerCards.length > 0 && <span className="bj-total">{dealerTotal !== null ? (dealerTotal > 21 ? `${dealerTotal} · dépassé` : game.dealer.blackjack ? 'BLACKJACK' : dealerTotal) : done ? '…' : game.dealer.total}</span>}</div>
          <div className="bj-cards">
            {!game && <><PlayingCard up={false} className="bj-ghost" /><PlayingCard up={false} className="bj-ghost" /></>}
            {game && visibleDealer.map((c, i) => (
              <div key={`d${i}`} className="bj-card" style={delay(i === 0 ? 1 : 3)}>
                {/* la deuxième carte est la carte cachée : elle reste face cachée jusqu'à la fin, puis se retourne */}
                <PlayingCard rank={c.rank} suit={c.suit} up={i === 0 || revealed} state="idle" />
              </div>
            ))}
            {game && !done && game.dealer.holeHidden && <div key="d1" className="bj-card" style={delay(3)}><PlayingCard up={false} /></div>}
          </div>
        </div>

        <div className="bj-zone player">
          <div className="bj-hands">
            {(game?.hands ?? []).map((h, hi) => (
              <div key={hi} className={`bj-hand${h.current && active ? ' current' : ''}${h.outcome && revealed && (!done || shown >= dealerCards.length) ? ` o-${h.outcome}` : ''}`}>
                <div className="bj-cards">
                  {h.cards.map((c, ci) => <div key={`${hi}-${ci}-${c.code}`} className="bj-card" style={delay(hi === 0 && ci === 0 ? 0 : hi === 0 && ci === 1 ? 2 : 0)}><PlayingCard rank={c.rank} suit={c.suit} up state="idle" /></div>)}
                </div>
                <div className="bj-hand-info">
                  <Total h={h} />
                  <span className="bj-chip" title="Mise de cette main">🪙 {formatNumber(game!.stake * h.bet)}{h.bet === 2 ? ' (doublée)' : ''}</span>
                  {h.outcome && done && shown >= dealerCards.length && <span className={`bj-res ${h.outcome}`}>{LABEL[h.outcome]}{h.payout ? ` +${formatNumber(h.payout)}` : ''}</span>}
                </div>
              </div>
            ))}
            {!game && <div className="bj-empty">Choisis ta mise et distribue les cartes</div>}
          </div>
        </div>

        {active && (
          <div className="bj-actions">
            {(['hit', 'stand', 'double', 'split'] as const).map((a) => (
              <button key={a} type="button" className={`bj-btn ${a}`} disabled={busy || !game!.actions.includes(a)} onClick={() => play(a)}>
                {ACTION_LABEL[a]}{(a === 'double' || a === 'split') && !game!.daily ? <small> +{game!.stake}</small> : null}
              </button>
            ))}
          </div>
        )}
        {banner && <div className={`bj-banner ${banner.kind}`} role="status">{banner.text}</div>}
        {shower > 0 && <CoinShower key={shower} coins={banner?.kind === 'blackjack' ? 80 : 36} items={banner?.kind === 'blackjack' ? ['♠️', '⭐'] : undefined} />}
      </div>

      {!active && (
        <div className="panel ornate">
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <strong>{done ? 'Nouvelle partie' : 'Ta mise'}</strong>
            <div className="slot-stakes" role="group" aria-label="Mise" style={{ display: 'flex', gap: 6 }}>
              {stakes.map((s) => <button key={s} type="button" className={`secondary${stake === s ? ' on' : ''}`} onClick={() => setStake(s)} disabled={busy}>{s}</button>)}
            </div>
            <button type="button" disabled={!canStart} onClick={() => start(false)}>♠️ Distribuer · {stake} points</button>
            {me.dailyFreeAvailable && <button type="button" className="secondary" disabled={busy || !!me.blocked} onClick={() => start(true)}>🎁 Partie gratuite du jour</button>}
          </div>
          {me.blocked && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{me.blocked}</div>}
          {!me.blocked && me.stakeable < stake && !me.dailyFreeAvailable && <div className="muted" style={{ marginTop: 8 }}>Points misables insuffisants{me.donated > 0 ? ' (les points de don ne se misent pas)' : ''}.</div>}
          <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            Points misables : <strong>{formatNumber(me.stakeable)}</strong>. Rapproche-toi de 21 sans le dépasser et bats le croupier : une victoire paie le double de ta mise, un blackjack {cfg.blackjackPays.replace(':', ' pour ')}.
            Tu peux doubler (une seule carte, mise doublée) sur tes deux premières cartes{cfg.doubleAfterSplit ? ', même après une séparation' : ''}, et séparer une paire (une fois ; un seul coup par as). Jeu de hasard avec des points du site : gagner n'est jamais garanti.
            Gain maximal par partie : {formatNumber(cfg.maxWin)} points{cfg.dailyLossMax > 0 && me.lossLeft !== null ? ` · limite du jour : encore ${formatNumber(me.lossLeft)} points` : ''}. Une partie abandonnée est jouée d'office après {cfg.idleMinutes} minutes (tu restes sur tes mains).
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
                  <td>{r.daily ? 'Gratuite' : `Mise ${r.valued}`} · {r.outcome ? LABEL[r.outcome] : ''}</td>
                  <td style={{ textAlign: 'right', color: (r.payout ?? 0) > r.stake ? 'var(--green-bright)' : undefined }}><strong>{(r.payout ?? 0) > 0 ? `+${formatNumber(r.payout ?? 0)}` : '—'}</strong></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Plus gros gains (7 jours)</h3>
          {data.biggest.length === 0 ? <p className="muted">Aucun gain pour l'instant.</p> : (
            <table className="moj-board"><tbody>
              {data.biggest.map((b, i) => (
                <tr key={i}><td>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td><td><Nick name={b.username} /></td><td className="muted">mise {b.stake}{b.outcome === 'blackjack' ? ' · blackjack' : ''}</td><td style={{ textAlign: 'right' }}><strong>+{formatNumber(b.payout)}</strong></td></tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}
