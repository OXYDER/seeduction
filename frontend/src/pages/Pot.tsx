import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import { timeAgo } from '../lib/time';
import { durationFr, tierPerks } from '../lib/duration';
import { useCountdown } from '../components/FreeleechCalendar';

const fmt = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const MEDAL = ['🥇', '🥈', '🥉'];

/** Jauge du pot : se remplit avec les dons ; change de couleur en approchant du but. */
export function PotGauge({ percent, collected, goal, full, tiers }: { percent: number; collected: number; goal: number; full?: boolean; tiers?: { atPct: number; reached: boolean; amount: number; freeleechHours: number; doubleUploadHours: number; tokens: number; rainPoints: number }[] }) {
  return (
    <div className="pot-gauge-wrap">
      <div className="pot-gauge" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Remplissage du pot">
        <div className={`pot-gauge-fill${percent >= 90 || full ? ' hot' : ''}`} style={{ width: `${Math.max(percent, collected > 0 ? 2 : 0)}%` }} />
        <div className="pot-gauge-text"><strong>{formatNumber(collected)}</strong> / {formatNumber(goal)} points · {percent} %</div>
        {tiers?.map((t) => <span key={t.atPct} className={`pot-tier-tick${t.reached ? ' on' : ''}`} style={{ left: `${t.atPct}%` }} />)}
      </div>
      {tiers && tiers.length > 0 && (
        <div className="pot-tier-flags" aria-hidden="true">
          {tiers.map((t) => <span key={t.atPct} className={`pot-tier-flag${t.reached ? ' on' : ''}`} style={{ left: `${t.atPct}%` }} title={`${t.atPct} % (${formatNumber(t.amount)} pts) : ${tierPerks(t)}`}>{t.reached ? '✅' : '🎁'}</span>)}
        </div>
      )}
    </div>
  );
}

/** Le pot commun : on y verse des points bonus ; quand il est plein, tout le monde profite d'un freeleech global (et plus, selon les réglages). */
export default function Pot() {
  const [pot, setPot] = useState<any>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/pot').then((r) => setPot(r.data)).catch(() => setError('Impossible de charger le pot'));
    api.get('/bonus/me').then((r) => setPoints(Math.floor(r.data.points))).catch(() => undefined);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const endsIn = useCountdown(pot?.active?.endsAt ?? null);
  const startsIn = useCountdown(pot?.pending?.startsAt ?? null);

  if (!pot) return <p className="muted">{error || 'Chargement…'}</p>;
  if (!pot.enabled) return <div className="panel"><h1>🍯 Pot commun</h1><p className="muted">Le pot commun n'est pas ouvert pour le moment.</p></div>;

  const { cycle, rules, reward } = pot;
  const open = cycle.status === 'OPEN';
  const maxNow = Math.max(0, Math.min(points ?? 0, rules.maxDonation > 0 ? rules.maxDonation : Infinity, rules.dailyLeft ?? Infinity, rules.carryOver ? Infinity : cycle.remaining));
  const quick = [10, 50, 100, 500, 1000].filter((n) => n >= rules.minDonation && n <= maxNow);

  async function give(n: number) {
    setBusy(true); setError(''); setMessage('');
    try {
      const { data } = await api.post('/pot/donate', { amount: n });
      setMessage(data.full ? `🎉 Merci ! Ton don de ${formatNumber(data.given)} points a rempli le pot !` : `✓ Merci ! ${formatNumber(data.given)} points versés dans le pot.`);
      setAmount('');
      load();
    } catch (e: any) { setError(e.response?.data?.message ?? 'Don impossible'); }
    finally { setBusy(false); }
  }

  const rewards = [
    reward.freeleech ? `Freeleech global pendant ${durationFr(reward.hours)} : les téléchargements de tout le monde ne comptent pas dans le ratio` : null,
    reward.doubleUpload ? `Double upload global pendant ${durationFr(reward.doubleUploadHours)} : tout ce que tu envoies compte en double` : null,
    reward.fastFillHours > 0 && reward.fastFillBonusHours > 0 ? `⚡ Pot rempli en moins de ${durationFr(reward.fastFillHours)} : ${durationFr(reward.fastFillBonusHours)} de plus sur les récompenses` : null,
    reward.rainPoints > 0 ? `Pluie de points : ${formatNumber(reward.rainPoints)} points offerts à chaque membre actif` : null,
    reward.tokens > 0 ? `${reward.tokens} jeton${reward.tokens > 1 ? 's' : ''} freeleech pour chaque donateur` : null,
    reward.donorRefundPct > 0 ? `${reward.donorRefundPct} % des points donnés te sont rendus` : null,
    reward.topDonorBonus > 0 ? `Bonus de ${formatNumber(reward.topDonorBonus)} points au n° 1 des donateurs (60 % au n° 2, 30 % au n° 3)` : null,
    reward.startAtHour >= 0 ? `Départ à ${reward.startAtHour} h (heure de Montréal)` : reward.startDelayHours > 0 ? `Départ ${durationFr(reward.startDelayHours)} après le remplissage, le temps de prévenir tout le monde` : null,
    rules.goalPerMember > 0 ? `Le prochain pot grandit avec la communauté (${formatNumber(rules.goalPerMember)} points par membre actif)` : rules.goalGrowthPct > 0 ? `Le prochain pot sera ${rules.goalGrowthPct} % plus gros` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1>{pot.icon} {pot.name}</h1>

      {pot.active && (
        <div className="panel ornate" style={{ borderColor: 'var(--success)' }}>
          🎉 <strong>Récompense en cours !</strong> Freeleech global jusqu'au {fmt(pot.active.endsAt)} (<strong>encore {endsIn}</strong>) — merci à tous les donateurs.
        </div>
      )}
      {pot.pending && !pot.active && (
        <div className="panel ornate">⏳ La récompense démarre dans <strong>{startsIn}</strong> (le {fmt(pot.pending.startsAt)}).</div>
      )}

      <div className="panel ornate">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <strong>Pot n° {cycle.number}</strong>
          <span className="muted">{open ? `Il manque ${formatNumber(cycle.remaining)} points` : '✅ Plein — la récompense va démarrer'}</span>
        </div>
        <PotGauge percent={cycle.percent} collected={cycle.collected} goal={cycle.goal} full={!open} tiers={pot.tiers} />

        {open ? (
          <div style={{ marginTop: 14 }}>
            <div className="muted" style={{ marginBottom: 6 }}>
              Ton solde : <strong style={{ color: 'var(--gold-bright)' }}>{points === null ? '…' : formatNumber(points)}</strong> points
              {pot.mine && <> · tu as donné <strong>{formatNumber(pot.mine.cycle)}</strong> à ce pot ({formatNumber(pot.mine.lifetime)} au total)</>}
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {quick.map((n) => <button key={n} type="button" className="secondary" disabled={busy} onClick={() => give(n)}>+ {formatNumber(n)}</button>)}
              <input type="number" min={rules.minDonation} max={maxNow || undefined} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Autre montant (min. ${rules.minDonation})`} style={{ width: 200 }} />
              <button type="button" disabled={busy || !amount || Number(amount) < rules.minDonation} onClick={() => give(Number(amount))}>🍯 Donner</button>
              {maxNow >= rules.minDonation && <button type="button" className="secondary" disabled={busy} onClick={() => give(maxNow)} title="Donner le maximum possible">Tout donner ({formatNumber(maxNow)})</button>}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Don minimum {rules.minDonation} points{rules.maxDonation > 0 ? ` · maximum ${formatNumber(rules.maxDonation)} à la fois` : ''}
              {rules.dailyLimit > 0 ? ` · ${formatNumber(rules.dailyLeft ?? 0)} points encore donnables aujourd'hui (limite ${formatNumber(rules.dailyLimit)} par 24 h)` : ''}
              {' · '}Les points donnés ne sont pas remboursables{reward.donorRefundPct > 0 ? ` (sauf ${reward.donorRefundPct} % rendus au remplissage)` : ''}.
            </div>
          </div>
        ) : (
          <p className="muted" style={{ marginBottom: 0 }}>Les dons sont fermés le temps de lancer la récompense, merci à tous !</p>
        )}
        {message && <div style={{ color: 'var(--success)', marginTop: 8 }}>{message}</div>}
        {error && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
      </div>

      {pot.tiers?.length > 0 && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>🎯 Paliers : des récompenses en cours de route</h3>
          <div className="grid" style={{ gap: 6 }}>
            {pot.tiers.map((t: any) => (
              <div key={t.atPct} className={`pot-tier-row${t.reached ? ' on' : ''}`}>
                <span className="pot-tier-badge">{t.reached ? '✅' : '🔒'} {t.atPct} %</span>
                <span className="muted" style={{ fontSize: 12 }}>{formatNumber(t.amount)} points</span>
                <span>{tierPerks(t)}</span>
              </div>
            ))}
            <div className="pot-tier-row"><span className="pot-tier-badge">🏁 100 %</span><span className="muted" style={{ fontSize: 12 }}>{formatNumber(cycle.goal)} points</span><span>la récompense finale ci-dessous</span></div>
          </div>
        </div>
      )}

      {pot.donorTiers?.length > 0 && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>🤝 Participation : plus on est nombreux, plus c'est généreux</h3>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
            Ces récompenses ne dépendent pas du montant : chaque membre qui donne, même un petit peu, compte. <strong>{pot.donorCount}</strong> membre{pot.donorCount > 1 ? 's ont' : ' a'} donné dans ce pot.
          </p>
          <div className="grid" style={{ gap: 6 }}>
            {pot.donorTiers.map((t: any) => (
              <div key={t.donors} className={`pot-tier-row${t.reached ? ' on' : ''}`}>
                <span className="pot-tier-badge">{t.reached ? '✅' : '🔒'} {t.donors} donateurs</span>
                <span className="muted" style={{ fontSize: 12 }}>{t.reached ? 'atteint' : `encore ${Math.max(0, t.donors - pot.donorCount)}`}</span>
                <span>{tierPerks(t)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>🎁 Quand le pot est plein</h3>
        <ul style={{ margin: 0, paddingLeft: 20 }}>{rewards.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Gagne des points en seedant (voir <Link to="/bonus">Points bonus</Link>) puis verse ta part : plus on donne ensemble, plus vite on en profite.</p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>🏆 Meilleurs donateurs de ce pot</h3>
          {pot.top.length === 0 && <p className="muted">Personne encore : sois le premier !</p>}
          {pot.top.map((t: any, i: number) => (
            <div key={t.username} className="row" style={{ justifyContent: 'space-between', padding: '3px 0' }}><span>{MEDAL[i] ?? `${i + 1}.`} {t.username}</span><strong>{formatNumber(t.amount)}</strong></div>
          ))}
        </div>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>👑 Mécènes de tous les temps</h3>
          {pot.topAllTime.length === 0 && <p className="muted">—</p>}
          {pot.topAllTime.map((t: any, i: number) => (
            <div key={t.username} className="row" style={{ justifyContent: 'space-between', padding: '3px 0' }}><span>{MEDAL[i] ?? `${i + 1}.`} {t.username}</span><strong>{formatNumber(t.amount)}</strong></div>
          ))}
        </div>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>🕒 Derniers dons</h3>
          {pot.recent.length === 0 && <p className="muted">Aucun don pour l'instant.</p>}
          {pot.recent.map((r: any, i: number) => (
            <div key={i} className="row" style={{ justifyContent: 'space-between', padding: '3px 0', fontSize: 13 }}>
              <span>{r.houseTopUp ? '🏠' : '🍯'} {r.username} <span className="muted">· {timeAgo(r.createdAt)}</span></span><strong>+{formatNumber(r.amount)}</strong>
            </div>
          ))}
        </div>
      </div>

      {pot.history.length > 0 && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>📜 Récompenses passées</h3>
          <table>
            <tbody>
              {pot.history.map((h: any) => (
                <tr key={h.number}>
                  <td>Pot n° {h.number}</td>
                  <td className="muted">{formatNumber(h.goal)} points · {h.donors} donateur{h.donors > 1 ? 's' : ''}</td>
                  <td className="muted">{h.startsAt ? `${fmt(h.startsAt)} → ${fmt(h.endsAt)}` : '—'}{h.hours ? ` (${h.hours} h)` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
