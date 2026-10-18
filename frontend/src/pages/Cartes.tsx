import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import { audio, bell, noiseBuffer, playWin, setSoundOn, soundOn, tick } from '../lib/slotSound';
import CollectCard, { RARITY_LABEL, type CardDef, type Rarity } from '../components/CollectCard';
import CoinShower from '../components/CoinShower';
import '../games.css';

interface SetV { id: string; name: string; icon: string; total: number; reward: number; claimed: boolean }
interface Overview {
  enabled: boolean; blocked: string | null;
  wallet: { packs: number; shards: number; opened: number; dailyAvailable: boolean; dailyPacks: number; untilLegendary: number };
  catalog: { cards: CardDef[]; sets: SetV[]; album: { total: number; reward: number; claimed: boolean } };
  owned: Record<string, number>; distinct: number;
  rules: { cardsPerPack: number; odds: { normal: Record<Rarity, number>; last: Record<Rarity, number> }; shards: Record<Rarity, number>; craft: Record<Rarity, number>; pityPacks: number };
  recent: { cards: { id: string; new: boolean; shards: number }[]; shards: number; at: string }[];
  collectors: { username: string; cards: number; mine: boolean }[];
}
interface Opened { cards: { id: string; new: boolean; shards: number }[]; shards: number; packs: number; totalShards: number; sets: { set: string; name: string; points: number }[] }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const when = (iso: string) => new Date(iso).toLocaleString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

function tearSound() {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const { c, out } = a, t = c.currentTime + 0.01;
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 0.5);
  const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.setValueAtTime(1800, t); f.frequency.linearRampToValueAtTime(5200, t + 0.35);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + 0.5);
}
function revealSound(r: Rarity) {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const t = a.c.currentTime + 0.01;
  tick(a, t, 2600, 0.12, 0.03);
  if (r === 'rare') [784, 988].forEach((f, i) => bell(a, t + 0.05 + i * 0.08, f, 0.07, 0.6));
  if (r === 'epic') [659, 784, 988, 1319].forEach((f, i) => bell(a, t + 0.05 + i * 0.08, f, 0.1, 0.9));
  if (r === 'legendary') playWin('big');
}

/** Ouverture d'un paquet : on déchire l'emballage, puis on retourne les cartes une à une. */
function PackOpener({ cards, defs, result, onClose, onAgain, left }: { cards: CardDef[]; defs: Map<string, CardDef>; result: Opened; onClose: () => void; onAgain: () => void; left: number }) {
  const [stage, setStage] = useState<'pack' | 'tearing' | 'cards'>('pack');
  const [up, setUp] = useState<boolean[]>(() => result.cards.map(() => false));
  const [shower, setShower] = useState(0);
  const all = up.every(Boolean);
  const best = useMemo(() => result.cards.reduce<Rarity>((b, c) => (RANK[defs.get(c.id)!.rarity] > RANK[b] ? defs.get(c.id)!.rarity : b), 'common'), [result, defs]);

  async function tear() {
    if (stage !== 'pack') return;
    setStage('tearing'); tearSound();
    await sleep(900);
    setStage('cards');
  }
  function flip(i: number) {
    if (stage !== 'cards' || up[i]) return;
    const def = defs.get(result.cards[i].id)!;
    setUp((u) => u.map((v, k) => (k === i ? true : v)));
    revealSound(def.rarity);
    if (def.rarity === 'legendary') setShower((n) => n + 1);
  }
  async function revealAll() {
    for (let i = 0; i < up.length; i++) { if (!up[i]) { flip(i); await sleep(380); } }
  }
  void cards;

  return (
    <div className="po-overlay" role="dialog" aria-modal="true" aria-label="Ouverture d'un paquet">
      <div className={`po-stage best-${best}`}>
        {stage !== 'cards' && (
          <button type="button" className={`po-pack ${stage === 'tearing' ? 'tearing' : ''}`} onClick={tear} aria-label="Déchirer le paquet">
            <span className="po-pack-top" /><span className="po-pack-body"><b>⚜️</b><i>SEEDUCTION</i><small>Paquet de {result.cards.length} cartes</small></span>
          </button>
        )}
        {stage === 'pack' && <div className="po-hint">Touche le paquet pour le déchirer</div>}
        {stage === 'cards' && (
          <>
            <div className="po-cards">
              {result.cards.map((c, i) => {
                const def = defs.get(c.id)!;
                return (
                  <div key={i} className={`po-slot ${up[i] ? `shown r-${def.rarity}` : ''}`} style={{ animationDelay: `${i * 0.12}s` }}>
                    <CollectCard card={def} up={up[i]} onClick={() => flip(i)} />
                    {up[i] && <div className="po-tag">{c.new ? <span className="new">NOUVEAU !</span> : <span className="dup">Doublon · +{c.shards} éclats</span>}</div>}
                  </div>
                );
              })}
            </div>
            {!all && <div className="po-actions"><button type="button" className="secondary" onClick={revealAll}>Tout révéler</button><span className="po-hint">Touche une carte pour la retourner</span></div>}
            {all && (
              <div className="po-done">
                {result.shards > 0 && <div>✨ +{result.shards} éclats gagnés avec les doublons (total : {formatNumber(result.totalShards)})</div>}
                {result.sets.map((s) => <div key={s.set} className="po-set">🏅 Série complétée : <strong>{s.name}</strong>{s.points > 0 ? ` · +${formatNumber(s.points)} points !` : ''}</div>)}
                <div className="po-actions">
                  {left > 0 && <button type="button" onClick={onAgain}>🎴 Ouvrir un autre paquet ({left})</button>}
                  <button type="button" className="secondary" onClick={onClose}>Voir mon album</button>
                </div>
              </div>
            )}
          </>
        )}
        {shower > 0 && <CoinShower key={shower} coins={60} items={['⭐', '⚜️']} />}
      </div>
    </div>
  );
}

/** Cartes à collectionner : un paquet par jour, des paquets à gagner en jouant, un album à compléter et des éclats pour fabriquer les cartes manquantes. */
export default function Cartes() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [setId, setSetId] = useState<string>('hockey');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [detail, setDetail] = useState<CardDef | null>(null);
  const [sound, setSound] = useState(soundOn());
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    try { const r = await api.get('/games/cards'); if (!alive.current) return; setData(r.data); setError(''); }
    catch { setError('Impossible de charger les cartes'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const defs = useMemo(() => new Map((data?.catalog.cards ?? []).map((c) => [c.id, c])), [data]);

  async function claim() {
    if (busy) return;
    setBusy(true); setError(''); setMsg('');
    try { const { data: r } = await api.post('/games/cards/daily'); setMsg(`🎁 ${r.claimed} paquet${r.claimed > 1 ? 's' : ''} ajouté${r.claimed > 1 ? 's' : ''} !`); await load(); }
    catch (e: any) { setError(e.response?.data?.message ?? 'Impossible de réclamer le paquet'); }
    finally { setBusy(false); }
  }
  async function openPack() {
    if (busy) return;
    setBusy(true); setError(''); setMsg('');
    try { const { data: r } = await api.post('/games/cards/open'); setOpened(r); void load(); }
    catch (e: any) { setError(e.response?.data?.message ?? 'Impossible d\'ouvrir le paquet'); }
    finally { setBusy(false); }
  }
  async function craft(card: CardDef) {
    if (busy) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const { data: r } = await api.post('/games/cards/craft', { cardId: card.id });
      setDetail(null); playWin('small');
      setMsg(`🛠️ ${card.name} fabriquée !${r.sets.length ? ` Série complétée : ${r.sets.map((s: any) => `${s.name}${s.points ? ` (+${s.points} points)` : ''}`).join(', ')}` : ''}`);
      await load();
    } catch (e: any) { setError(e.response?.data?.message ?? 'Fabrication impossible'); }
    finally { setBusy(false); }
  }

  if (!data) return <p className="muted">{error || 'Chargement…'}</p>;
  if (!data.enabled) return <div className="panel"><h1>🎴 Cartes à collectionner</h1><p className="muted">Les cartes sont fermées pour le moment.</p></div>;

  const w = data.wallet;
  const set = data.catalog.sets.find((s) => s.id === setId) ?? data.catalog.sets[0];
  const inSet = data.catalog.cards.filter((c) => c.set === set.id);
  const ownedIn = (id: string) => inSet.filter((c) => (data.owned[c.id] ?? 0) > 0).length;
  const shown = inSet.filter((c) => !onlyMissing || !data.owned[c.id]).sort((a, b) => RANK[b.rarity] - RANK[a.rarity]);
  const odds = data.rules.odds;

  return (
    <div className="cc-page">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>🎴 Cartes à collectionner</h1>
        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          <Link to="/jeux" className="muted">← Jeux</Link>
          <button type="button" className="secondary" onClick={() => { const v = !sound; setSound(v); setSoundOn(v); }} aria-label={sound ? 'Couper le son' : 'Activer le son'}>{sound ? '🔊' : '🔇'}</button>
        </div>
      </div>

      <div className="cc-hero">
        <div className="cc-packbox">
          <div className="cc-minipack" aria-hidden="true"><b>⚜️</b></div>
          <div>
            <div className="cc-big">{w.packs} paquet{w.packs > 1 ? 's' : ''}</div>
            <div className="muted">à ouvrir · ✨ {formatNumber(w.shards)} éclats · {data.distinct}/{data.catalog.album.total} cartes</div>
          </div>
        </div>
        <div className="cc-btns">
          {w.dailyAvailable ? <button type="button" className="cc-gift" disabled={busy || !!data.blocked} onClick={claim}>🎁 Réclamer le paquet du jour</button> : <span className="muted">Paquet du jour réclamé ✓ (reviens demain)</span>}
          <button type="button" className="cc-open" disabled={busy || w.packs < 1 || !!data.blocked} onClick={openPack}>🎴 Ouvrir un paquet</button>
        </div>
      </div>
      {data.blocked && <div className="panel" style={{ color: 'var(--danger)' }}>{data.blocked}</div>}
      {msg && <div className="panel" style={{ color: 'var(--green-bright)' }}>{msg}</div>}
      {error && <div className="slot-error">{error}</div>}

      <div className="cc-layout">
        <div className="cc-main">
          <div className="cc-tabs" role="tablist">
            {data.catalog.sets.map((s) => (
              <button key={s.id} type="button" role="tab" aria-selected={s.id === set.id} className={`cc-tab${s.id === set.id ? ' on' : ''}`} onClick={() => setSetId(s.id)}>
                <span>{s.icon} {s.name}</span>
                <small>{data.catalog.cards.filter((c) => c.set === s.id && data.owned[c.id]).length}/{s.total}{s.claimed ? ' ✓' : ''}</small>
              </button>
            ))}
          </div>
          <div className="cc-setbar">
            <div className="cc-progress"><div style={{ width: `${(ownedIn(set.id) / set.total) * 100}%` }} /></div>
            <span>{ownedIn(set.id)} / {set.total}</span>
            <span className="muted">{set.claimed ? '🏅 Série complétée : récompense reçue' : `Complète cette série : +${formatNumber(set.reward)} points`}</span>
            <label className="muted" style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Manquantes seulement</label>
          </div>
          <div className="cc-grid">
            {shown.map((c) => <CollectCard key={c.id} card={c} owned={!!data.owned[c.id]} count={data.owned[c.id]} onClick={() => setDetail(c)} />)}
            {shown.length === 0 && <p className="muted">Tu as toutes les cartes de cette série !</p>}
          </div>
        </div>

        <div className="cc-aside">
          <div className="panel ornate">
            <h2 style={{ marginTop: 0 }}>🏆 Album</h2>
            <div className="cc-progress"><div style={{ width: `${(data.distinct / data.catalog.album.total) * 100}%` }} /></div>
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>{data.distinct} / {data.catalog.album.total} cartes · {data.catalog.album.claimed ? 'album complet, récompense reçue !' : `album complet : +${formatNumber(data.catalog.album.reward)} points`}</p>
          </div>
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>🎁 Gagner des paquets</h2>
            <ul className="cc-list">
              <li>📅 <strong>1 paquet par jour</strong>, gratuit</li>
              <li>🧠 Un <strong>sans-faute</strong> au quiz du jour</li>
              <li>🎡 <strong>7 jours de suite</strong> à la roue de la fortune</li>
              <li>🎯 Une <strong>journée parfaite</strong> aux pronostics LNH</li>
            </ul>
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>Les paquets ne s'achètent pas avec des points. Une carte légendaire est garantie au plus tard dans {data.rules.pityPacks} paquets (encore {w.untilLegendary} au maximum).</p>
          </div>
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>✨ Éclats</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Un doublon donne des éclats ({data.rules.shards.common} à {data.rules.shards.legendary}). Avec assez d'éclats, tu fabriques une carte manquante : {data.rules.craft.common} (commune), {data.rules.craft.rare} (rare), {data.rules.craft.epic} (épique), {data.rules.craft.legendary} (légendaire).</p>
          </div>
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>🎲 Chances par carte</h2>
            <table className="moj-board"><tbody>
              {(['common', 'rare', 'epic', 'legendary'] as Rarity[]).map((r) => <tr key={r}><td>{RARITY_LABEL[r]}</td><td className="muted">{odds.normal[r] / 10} %</td><td className="muted">{odds.last[r] / 10} % (dernière carte)</td></tr>)}
            </tbody></table>
          </div>
          {data.collectors.length > 0 && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>👑 Collectionneurs</h2>
              <ol className="cc-list ranked">{data.collectors.map((c, i) => <li key={i} className={c.mine ? 'mine' : ''}><span>{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} {c.username}</span><strong>{c.cards}/{data.catalog.album.total}</strong></li>)}</ol>
            </div>
          )}
          {data.recent.length > 0 && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>📜 Derniers paquets</h2>
              <ul className="cc-list">{data.recent.map((r, i) => <li key={i}><span className="muted">{when(r.at)}</span> {r.cards.map((c) => defs.get(c.id)).filter(Boolean).map((d) => <span key={d!.id} className={`cc-dot r-${d!.rarity}`} title={d!.name}>●</span>)}{r.shards > 0 && <span className="muted"> · +{r.shards} ✨</span>}</li>)}</ul>
            </div>
          )}
        </div>
      </div>

      {detail && (
        <div className="po-overlay" role="dialog" aria-modal="true" onClick={() => setDetail(null)}>
          <div className="cc-detail" onClick={(e) => e.stopPropagation()}>
            <CollectCard card={detail} owned={!!data.owned[detail.id]} count={data.owned[detail.id]} className="big" />
            <div className="cc-detail-info">
              <h2 style={{ margin: 0 }}>{data.owned[detail.id] ? detail.name : 'Carte à découvrir'}</h2>
              <p className="muted" style={{ margin: 0 }}>{RARITY_LABEL[detail.rarity]} · {data.catalog.sets.find((s) => s.id === detail.set)?.name}</p>
              {data.owned[detail.id]
                ? <p style={{ margin: 0 }}>Tu en as <strong>{data.owned[detail.id]}</strong>{data.owned[detail.id] > 1 ? ` : les ${data.owned[detail.id] - 1} doublon${data.owned[detail.id] > 2 ? 's' : ''} ont rapporté des éclats.` : '.'}</p>
                : (
                  <>
                    <p style={{ margin: 0 }}>Pas encore dans ta collection. Trouve-la dans un paquet, ou fabrique-la pour <strong>{data.rules.craft[detail.rarity]} éclats</strong> (tu en as {formatNumber(w.shards)}).</p>
                    <button type="button" disabled={busy || w.shards < data.rules.craft[detail.rarity]} onClick={() => craft(detail)}>🛠️ Fabriquer · {data.rules.craft[detail.rarity]} éclats</button>
                  </>
                )}
              <button type="button" className="secondary" onClick={() => setDetail(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {opened && (
        <PackOpener cards={data.catalog.cards} defs={defs} result={opened} left={opened.packs}
          onClose={() => { setOpened(null); void load(); }}
          onAgain={async () => { setOpened(null); await sleep(150); await openPack(); }} />
      )}
    </div>
  );
}
