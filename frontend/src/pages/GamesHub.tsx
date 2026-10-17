import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import { useCountdown } from '../components/FreeleechCalendar';
import TeamLogo from '../components/TeamLogo';
import { SKINS, MACHINE_ORDER } from '../lib/slotSkins';

interface Summary {
  me: { points: number; donated: number; stakeable: number; optOut: boolean };
  moj: {
    enabled: boolean; openMatches: number; openPool: number; playersWeek: number; myActiveBets: number; myBetsSettled: number; myNet: number;
    next: { startUtc: string; side: 'home' | 'away'; kind: string; mine: { abbrev: string; name: string }; other: { abbrev: string; name: string } } | null;
  };
  slots: { enabled: boolean; machines: number; spins24h: number; rtp: number; mySpins: number; myNet: number; dailyFreeAvailable: boolean; biggest: { username: string; win: number; stake: number; machine: string } | null };
}

const net = (n: number) => `${n >= 0 ? '+' : ''}${formatNumber(n)}`;

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'good' | 'bad' }) {
  return <div className="gh-stat"><span className="gh-stat-v" style={tone === 'good' ? { color: 'var(--green-bright)' } : tone === 'bad' ? { color: 'var(--danger)' } : undefined}>{value}</span><span className="gh-stat-l">{label}</span></div>;
}

/** La case de Mise-O-jeu : prochain match, ce qui est en jeu, et mes résultats. */
function MojCard({ d }: { d: Summary['moj'] }) {
  const left = useCountdown(d.next?.startUtc ?? null);
  return (
    <Link to="/jeux/mise-o-jeu" className="gh-card gh-moj">
      <div className="gh-head"><span className="gh-icon">🏒</span><div><h2>Mise-O-jeu</h2><div className="gh-tag">Paris sur les matchs du Canadien</div></div></div>
      <p className="gh-desc">Devine le vainqueur, la façon de finir et le score exact de chaque match du Canadien. Joue gratuitement ou mise des points : les gagnants se partagent les mises.</p>
      {d.next ? (
        <div className="gh-next">
          <TeamLogo abbrev={d.next.mine.abbrev} name={d.next.mine.name} size={26} /><span className="muted">{d.next.side === 'home' ? 'vs' : '@'}</span><TeamLogo abbrev={d.next.other.abbrev} name={d.next.other.name} size={26} />
          <div><strong>{d.next.mine.name} {d.next.side === 'home' ? 'contre' : 'chez'} {d.next.other.name}</strong><div className="muted" style={{ fontSize: 12.5 }}>Les paris ferment dans {left}</div></div>
        </div>
      ) : <div className="gh-next muted">Aucun match ouvert aux paris pour l'instant.</div>}
      <div className="gh-stats">
        <Stat label="matchs ouverts" value={d.openMatches} />
        <Stat label="points en jeu" value={formatNumber(d.openPool)} />
        <Stat label="joueurs (7 jours)" value={d.playersWeek} />
        <Stat label="mes paris en cours" value={d.myActiveBets} />
        {d.myBetsSettled > 0 && <Stat label="mon bilan" value={`${net(d.myNet)} pts`} tone={d.myNet >= 0 ? 'good' : 'bad'} />}
      </div>
      <span className="gh-go">Jouer →</span>
    </Link>
  );
}

/** La case des machines à sous : machines disponibles, activité, plus gros gain et mon bilan. */
function SlotsCard({ d }: { d: Summary['slots'] }) {
  return (
    <Link to="/jeux/machines" className="gh-card gh-slots">
      <div className="gh-head"><span className="gh-icon">🎰</span><div><h2>Machines à sous</h2><div className="gh-tag">Six thèmes, un tour gratuit par jour</div></div></div>
      <p className="gh-desc">Tourne les rouleaux de Grand Écran, Seeduction Or, Rondelle d'Or, Cabane à Sucre, Fête du Moment ou Trésor des Mers. Mise de 5 à 100 points, jokers et tours gratuits.</p>
      <div className="gh-icons">{MACHINE_ORDER.map((m) => <span key={m} title={SKINS[m].name}>{SKINS[m].icon}</span>)}</div>
      {d.biggest ? <div className="gh-next"><span style={{ fontSize: 22 }}>🏆</span><div><strong>Plus gros gain de la semaine : +{formatNumber(d.biggest.win)}</strong><div className="muted" style={{ fontSize: 12.5 }}>{d.biggest.username} · mise de {d.biggest.stake}</div></div></div> : <div className="gh-next muted">Aucun gain cette semaine : sois le premier !</div>}
      <div className="gh-stats">
        <Stat label="machines" value={d.machines} />
        <Stat label="tours (24 h)" value={formatNumber(d.spins24h)} />
        <Stat label="retour au joueur" value={`${d.rtp} %`} />
        <Stat label="mes tours" value={formatNumber(d.mySpins)} />
        {d.mySpins > 0 && <Stat label="mon bilan" value={`${net(d.myNet)} pts`} tone={d.myNet >= 0 ? 'good' : 'bad'} />}
      </div>
      {d.dailyFreeAvailable && <span className="gh-badge">🎁 Ton tour gratuit du jour t'attend</span>}
      <span className="gh-go">Jouer →</span>
    </Link>
  );
}

/** Page d'accueil des jeux : une case par jeu avec sa description et ses statistiques ; un clic ouvre le jeu. */
export default function GamesHub() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const load = () => api.get('/games/summary').then((r) => { setData(r.data); setError(''); }).catch(() => setError('Impossible de charger les jeux'));
  useEffect(() => { void load(); const t = setInterval(() => { if (!document.hidden) void load(); }, 30_000); return () => clearInterval(t); }, []);

  async function optOut(value: boolean) {
    if (value && !window.confirm('Te retirer des jeux ? Tes paris en cours restent valables, mais tu ne pourras plus jouer tant que tu ne reviens pas.')) return;
    await api.put('/games/moj/opt-out', { value }).catch(() => undefined);
    void load();
  }

  if (!data) return <p className="muted">{error || 'Chargement…'}</p>;
  const { me } = data;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1 style={{ margin: 0 }}>🎲 Jeux</h1>

      <div className="panel ornate">
        <div className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="muted">Joue avec tes points bonus, ou gratuitement. Les points reçus par un don ne peuvent pas être misés.</div>
          <div style={{ textAlign: 'right' }}>
            <div>Points misables : <strong style={{ color: 'var(--gold-bright)' }}>{formatNumber(me.stakeable)}</strong></div>
            {me.donated > 0 && <div className="muted" style={{ fontSize: 12.5 }}>+ {formatNumber(me.donated)} points de don (dépensables ailleurs, non misables)</div>}
          </div>
        </div>
        <div className="row" style={{ gap: 14, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link to="/bonus" className="muted">Mes points bonus →</Link>
          <Link to="/wiki/guide-mise-o-jeu" className="muted">Comment ça marche ?</Link>
          <button type="button" className="secondary" style={{ marginLeft: 'auto' }} onClick={() => optOut(!me.optOut)}>{me.optOut ? 'Revenir aux jeux' : 'Me retirer des jeux'}</button>
        </div>
        {me.optOut && <div style={{ marginTop: 8, color: 'var(--danger)' }}>Tu t'es retiré des jeux : tu peux revenir quand tu veux avec le bouton ci-dessus.</div>}
      </div>

      <div className="gh-grid">
        {data.moj.enabled && <MojCard d={data.moj} />}
        {data.slots.enabled && <SlotsCard d={data.slots} />}
        <div className="gh-card gh-soon"><span className="gh-icon">🎲</span><h2>Bientôt</h2><p className="gh-desc">D'autres jeux arrivent. Dis-nous ceux que tu aimerais voir !</p></div>
      </div>
    </div>
  );
}
