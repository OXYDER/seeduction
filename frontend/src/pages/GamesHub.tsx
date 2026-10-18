import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import { useCountdown } from '../components/FreeleechCalendar';
import TeamLogo from '../components/TeamLogo';
import { SKINS, MACHINE_ORDER } from '../lib/slotSkins';
import '../games.css';

interface Summary {
  me: { points: number; donated: number; stakeable: number; optOut: boolean };
  moj: {
    enabled: boolean; openMatches: number; openPool: number; playersWeek: number; myActiveBets: number; myBetsSettled: number; myWon: number;
    next: { startUtc: string; side: 'home' | 'away'; kind: string; mine: { abbrev: string; name: string }; other: { abbrev: string; name: string } } | null;
  };
  hilo: { enabled: boolean; gamesToday: number; bestStreak: { username: string; step: number } | null; myGames: number; myBest: number; myWon: number; activeStep: number | null; dailyFreeAvailable: boolean };
  wheel: { enabled: boolean; playedToday: boolean; streak: number; won: number; tokens: number };
  quiz: { enabled: boolean; playedToday: boolean; inProgress: boolean; todayCorrect: number | null; questions: number; streak: number; won: number; best: number };
  picks: { enabled: boolean; gamesToday: number; pickedToday: number; toPick: number; streak: number; weekWins: number; weekPicks: number; won: number };
  blackjack: { enabled: boolean; gamesToday: number; myGames: number; myWon: number; active: boolean; dailyFreeAvailable: boolean; biggest: { username: string; payout: number; stake: number } | null };
  dice: { enabled: boolean; rollsToday: number; myRolls: number; myWon: number; dailyFreeAvailable: boolean; biggest: { username: string; payout: number; stake: number } | null };
  cards: { enabled: boolean; packs: number; shards: number; owned: number; total: number; dailyAvailable: boolean };
  duels: { enabled: boolean; incoming: number; active: number; won: number };
  challenges: { enabled: boolean; dailyDone: number; dailyTotal: number; weeklyDone: number; weeklyTotal: number; bonus: boolean; streak: number };
  slots: { enabled: boolean; machines: number; spins24h: number; jackpot: number | null; mySpins: number; myWon: number; dailyFreeAvailable: boolean; biggest: { username: string; win: number; stake: number; machine: string } | null };
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
        {d.myBetsSettled > 0 && d.myWon > 0 && <Stat label="gagné au total" value={`+${formatNumber(d.myWon)} pts`} tone="good" />}
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
        {d.jackpot !== null && <Stat label="gros lot" value={`${formatNumber(d.jackpot)} pts`} tone="good" />}
        <Stat label="mes tours" value={formatNumber(d.mySpins)} />
        {d.mySpins > 0 && d.myWon > 0 && <Stat label="gagné au total" value={`+${formatNumber(d.myWon)} pts`} tone="good" />}
      </div>
      {d.dailyFreeAvailable && <span className="gh-badge">🎁 Ton tour gratuit du jour t'attend</span>}
      <span className="gh-go">Jouer →</span>
    </Link>
  );
}

/** La case de « Plus haut ou plus bas » : meilleure série, activité et mes meilleurs résultats. */
function HiLoCard({ d }: { d: Summary['hilo'] }) {
  return (
    <Link to="/jeux/plus-haut-plus-bas" className="gh-card gh-hilo">
      <div className="gh-head"><span className="gh-icon">🃏</span><div><h2>Plus haut ou plus bas</h2><div className="gh-tag">Une série de cartes, encaisse quand tu veux</div></div></div>
      <p className="gh-desc">Devine si la prochaine carte sera plus haute ou plus basse. Chaque bonne réponse multiplie ton gain : continue pour plus gros, ou encaisse avant de tout perdre.</p>
      <div className="gh-icons" aria-hidden="true"><span>♠️</span><span>♥️</span><span>♦️</span><span>♣️</span></div>
      {d.activeStep !== null ? <div className="gh-next"><span style={{ fontSize: 22 }}>▶️</span><div><strong>Une partie t'attend</strong><div className="muted" style={{ fontSize: 12.5 }}>Série en cours : {d.activeStep}</div></div></div>
        : d.bestStreak ? <div className="gh-next"><span style={{ fontSize: 22 }}>🔥</span><div><strong>Meilleure série de la semaine : {d.bestStreak.step}</strong><div className="muted" style={{ fontSize: 12.5 }}>{d.bestStreak.username}</div></div></div>
        : <div className="gh-next muted">Aucune série cette semaine : sois le premier !</div>}
      <div className="gh-stats">
        <Stat label="parties (24 h)" value={formatNumber(d.gamesToday)} />
        <Stat label="mes parties" value={formatNumber(d.myGames)} />
        {d.myBest > 0 && <Stat label="ma meilleure série" value={d.myBest} tone="good" />}
        {d.myWon > 0 && <Stat label="gagné au total" value={`+${formatNumber(d.myWon)} pts`} tone="good" />}
      </div>
      {d.dailyFreeAvailable && <span className="gh-badge">🎁 Ta partie gratuite du jour t'attend</span>}
      <span className="gh-go">Jouer →</span>
    </Link>
  );
}

/** La case de la roue de la fortune : tour du jour, série en cours et ce que j'ai déjà gagné. */
function WheelCard({ d }: { d: Summary['wheel'] }) {
  return (
    <Link to="/jeux/roue" className="gh-card gh-wheel">
      <div className="gh-head"><span className="gh-icon">🎡</span><div><h2>Roue de la fortune</h2><div className="gh-tag">Un tour gratuit chaque jour</div></div></div>
      <p className="gh-desc">Tourne la roue une fois par jour, sans rien miser : points, jetons freeleech et gros lots. Plus tu joues de jours de suite, plus tes gains grossissent, avec un bonus le 7<sup>e</sup> jour.</p>
      <div className="gh-icons" aria-hidden="true"><span>🪙</span><span>🎟️</span><span>🎁</span><span>⭐</span></div>
      {d.streak > 0 ? <div className="gh-next"><span style={{ fontSize: 22 }}>🔥</span><div><strong>Série en cours : {d.streak} jour{d.streak > 1 ? 's' : ''}</strong><div className="muted" style={{ fontSize: 12.5 }}>{d.playedToday ? 'Reviens demain pour la garder' : "Joue aujourd'hui pour la garder"}</div></div></div> : <div className="gh-next muted">Commence une série dès aujourd'hui !</div>}
      <div className="gh-stats">
        {d.won > 0 && <Stat label="gagné au total" value={`+${formatNumber(d.won)} pts`} tone="good" />}
        {d.tokens > 0 && <Stat label="jetons gagnés" value={d.tokens} tone="good" />}
      </div>
      {!d.playedToday && <span className="gh-badge">🎁 Ton tour gratuit du jour t'attend</span>}
      <span className="gh-go">{d.playedToday ? 'Voir →' : 'Tourner →'}</span>
    </Link>
  );
}

/** La case du quiz quotidien : résultat du jour, série en cours et ce que j'ai déjà gagné. */
function QuizCard({ d }: { d: Summary['quiz'] }) {
  return (
    <Link to="/jeux/quiz" className="gh-card gh-quiz">
      <div className="gh-head"><span className="gh-icon">🧠</span><div><h2>Quiz quotidien</h2><div className="gh-tag">{d.questions} questions par jour, les mêmes pour tous</div></div></div>
      <p className="gh-desc">Cinéma, hockey, musique, sciences, géographie… Réponds vite : chaque bonne réponse rapporte des points, plus un bonus de rapidité et un gros bonus pour un sans-faute. Les trois meilleurs du jour gagnent un prix.</p>
      <div className="gh-icons" aria-hidden="true"><span>🎬</span><span>🏒</span><span>🎵</span><span>🔬</span></div>
      {d.playedToday ? <div className="gh-next"><span style={{ fontSize: 22 }}>✅</span><div><strong>Quiz du jour terminé : {d.todayCorrect}/{d.questions}</strong><div className="muted" style={{ fontSize: 12.5 }}>Nouveau quiz demain</div></div></div>
        : d.inProgress ? <div className="gh-next"><span style={{ fontSize: 22 }}>▶️</span><div><strong>Un quiz t'attend</strong><div className="muted" style={{ fontSize: 12.5 }}>Reprends là où tu t'étais arrêté</div></div></div>
        : d.streak > 0 ? <div className="gh-next"><span style={{ fontSize: 22 }}>🔥</span><div><strong>Série en cours : {d.streak} jour{d.streak > 1 ? 's' : ''}</strong><div className="muted" style={{ fontSize: 12.5 }}>Joue aujourd'hui pour la garder</div></div></div>
        : <div className="gh-next muted">Teste tes connaissances dès aujourd'hui !</div>}
      <div className="gh-stats">
        {d.won > 0 && <Stat label="gagné au total" value={`+${formatNumber(d.won)} pts`} tone="good" />}
        {d.best > 0 && <Stat label="meilleur score" value={`${d.best}/${d.questions}`} tone="good" />}
      </div>
      {!d.playedToday && <span className="gh-badge">🎁 Ton quiz du jour t'attend</span>}
      <span className="gh-go">{d.playedToday ? 'Voir →' : d.inProgress ? 'Reprendre →' : 'Jouer →'}</span>
    </Link>
  );
}

/** La case des pronostics LNH : matchs du jour, mes pronostics à faire, série et gains. */
function PicksCard({ d }: { d: Summary['picks'] }) {
  return (
    <Link to="/jeux/pronostics" className="gh-card gh-picks">
      <div className="gh-head"><span className="gh-icon">🎯</span><div><h2>Pronostics LNH</h2><div className="gh-tag">Tous les matchs de la ligue, gratuit</div></div></div>
      <p className="gh-desc">Choisis le vainqueur de chaque match avant le début. Chaque bonne prédiction rapporte des points, avec un bonus de série, un bonus de journée parfaite et un prix pour les meilleurs de la semaine.</p>
      <div className="gh-icons" aria-hidden="true"><span>🏒</span><span>🥅</span><span>🏆</span><span>🔥</span></div>
      {d.streak > 0 ? <div className="gh-next"><span style={{ fontSize: 22 }}>🔥</span><div><strong>{d.streak} bonne{d.streak > 1 ? 's' : ''} prédiction{d.streak > 1 ? 's' : ''} de suite</strong><div className="muted" style={{ fontSize: 12.5 }}>Continue pour des points de bonus</div></div></div>
        : d.gamesToday > 0 ? <div className="gh-next"><span style={{ fontSize: 22 }}>🏒</span><div><strong>{d.gamesToday} match{d.gamesToday > 1 ? 's' : ''} aujourd'hui</strong><div className="muted" style={{ fontSize: 12.5 }}>{d.pickedToday} pronostic{d.pickedToday > 1 ? 's' : ''} fait{d.pickedToday > 1 ? 's' : ''}</div></div></div>
        : <div className="gh-next muted">Aucun match aujourd'hui : regarde ceux des prochains jours.</div>}
      <div className="gh-stats">
        <Stat label="matchs aujourd'hui" value={d.gamesToday} />
        {d.weekPicks > 0 && <Stat label="réussis cette semaine" value={`${d.weekWins}/${d.weekPicks}`} tone="good" />}
        {d.won > 0 && <Stat label="gagné au total" value={`+${formatNumber(d.won)} pts`} tone="good" />}
      </div>
      {d.toPick > 0 && <span className="gh-badge">🎯 {d.toPick} match{d.toPick > 1 ? 's' : ''} à pronostiquer aujourd'hui</span>}
      <span className="gh-go">Pronostiquer →</span>
    </Link>
  );
}

/** La case du blackjack : activité, plus gros gain de la semaine et mes gains. */
function BlackjackCard({ d }: { d: Summary['blackjack'] }) {
  return (
    <Link to="/jeux/blackjack" className="gh-card gh-blackjack">
      <div className="gh-head"><span className="gh-icon">♠️</span><div><h2>Blackjack</h2><div className="gh-tag">Bats le croupier, rapproche-toi de 21</div></div></div>
      <p className="gh-desc">Tire des cartes sans dépasser 21 : double ta mise sur une bonne main, sépare tes paires, et touche 3 pour 2 sur un blackjack. Une partie gratuite chaque jour.</p>
      <div className="gh-icons" aria-hidden="true"><span>🂡</span><span>🂮</span><span>🃁</span><span>🂱</span></div>
      {d.active ? <div className="gh-next"><span style={{ fontSize: 22 }}>▶️</span><div><strong>Une partie t'attend</strong><div className="muted" style={{ fontSize: 12.5 }}>Reprends là où tu t'étais arrêté</div></div></div>
        : d.biggest ? <div className="gh-next"><span style={{ fontSize: 22 }}>🏆</span><div><strong>Plus gros gain de la semaine : +{formatNumber(d.biggest.payout)}</strong><div className="muted" style={{ fontSize: 12.5 }}>{d.biggest.username} · mise de {d.biggest.stake}</div></div></div>
        : <div className="gh-next muted">Aucun gain cette semaine : sois le premier !</div>}
      <div className="gh-stats">
        <Stat label="parties (24 h)" value={formatNumber(d.gamesToday)} />
        <Stat label="mes parties" value={formatNumber(d.myGames)} />
        {d.myGames > 0 && d.myWon > 0 && <Stat label="gagné au total" value={`+${formatNumber(d.myWon)} pts`} tone="good" />}
      </div>
      {d.dailyFreeAvailable && <span className="gh-badge">🎁 Ta partie gratuite du jour t'attend</span>}
      <span className="gh-go">Jouer →</span>
    </Link>
  );
}

/** La case des dés : activité, plus gros gain de la semaine et mes gains. */
function DiceCard({ d }: { d: Summary['dice'] }) {
  return (
    <Link to="/jeux/des" className="gh-card gh-dice">
      <div className="gh-head"><span className="gh-icon">🎲</span><div><h2>Dés</h2><div className="gh-tag">Deux dés, un pari, une cote selon tes chances</div></div></div>
      <p className="gh-desc">Parie sur le total de deux dés : moins que, plus que, total exact ou doubles. Plus ton pari est rare, plus la cote grimpe, jusqu'à ×34 sur un total de 2 ou de 12. Un lancer gratuit chaque jour.</p>
      <div className="gh-icons" aria-hidden="true"><span>⚀</span><span>⚂</span><span>⚄</span><span>⚅</span></div>
      {d.biggest ? <div className="gh-next"><span style={{ fontSize: 22 }}>🏆</span><div><strong>Plus gros gain de la semaine : +{formatNumber(d.biggest.payout)}</strong><div className="muted" style={{ fontSize: 12.5 }}>{d.biggest.username} · mise de {d.biggest.stake}</div></div></div> : <div className="gh-next muted">Aucun gain cette semaine : sois le premier !</div>}
      <div className="gh-stats">
        <Stat label="lancers (24 h)" value={formatNumber(d.rollsToday)} />
        <Stat label="mes lancers" value={formatNumber(d.myRolls)} />
        {d.myRolls > 0 && d.myWon > 0 && <Stat label="gagné au total" value={`+${formatNumber(d.myWon)} pts`} tone="good" />}
      </div>
      {d.dailyFreeAvailable && <span className="gh-badge">🎁 Ton lancer gratuit du jour t'attend</span>}
      <span className="gh-go">Jouer →</span>
    </Link>
  );
}

/** La case des cartes à collectionner : paquets à ouvrir, progression de l'album et paquet du jour. */
function CardsCard({ d }: { d: Summary['cards'] }) {
  return (
    <Link to="/jeux/cartes" className="gh-card gh-cards">
      <div className="gh-head"><span className="gh-icon">🎴</span><div><h2>Cartes à collectionner</h2><div className="gh-tag">Un paquet gratuit chaque jour</div></div></div>
      <p className="gh-desc">Ouvre des paquets, retourne tes cartes et complète ton album : équipes de la LNH, cinéma, musique et Seeduction. Les cartes rares brillent, les doublons deviennent des éclats pour fabriquer celles qui te manquent. Rien à miser : les paquets se gagnent.</p>
      <div className="gh-icons" aria-hidden="true"><span>🏒</span><span>🎬</span><span>🎵</span><span>⚜️</span></div>
      {d.packs > 0 ? <div className="gh-next"><span style={{ fontSize: 22 }}>🎴</span><div><strong>{d.packs} paquet{d.packs > 1 ? 's' : ''} à ouvrir</strong><div className="muted" style={{ fontSize: 12.5 }}>Ouvre-les pour compléter ton album</div></div></div>
        : <div className="gh-next"><span style={{ fontSize: 22 }}>📖</span><div><strong>Album : {d.owned} / {d.total} cartes</strong><div className="muted" style={{ fontSize: 12.5 }}>{d.shards > 0 ? `${d.shards} éclats pour fabriquer une carte` : 'Réclame ton paquet du jour'}</div></div></div>}
      <div className="gh-stats">
        <Stat label="cartes obtenues" value={`${d.owned}/${d.total}`} tone={d.owned > 0 ? 'good' : undefined} />
        {d.shards > 0 && <Stat label="éclats" value={formatNumber(d.shards)} />}
      </div>
      {d.dailyAvailable && <span className="gh-badge">🎁 Ton paquet du jour t'attend</span>}
      <span className="gh-go">Ouvrir →</span>
    </Link>
  );
}

/** La case des duels : invitations reçues, duels en cours et victoires. */
function DuelsCard({ d }: { d: Summary['duels'] }) {
  return (
    <Link to="/jeux/duels" className="gh-card gh-duels">
      <div className="gh-head"><span className="gh-icon">⚔️</span><div><h2>Duels</h2><div className="gh-tag">Défie un autre membre, sans rien miser</div></div></div>
      <p className="gh-desc">Lance un duel de 3 ou 7 jours à un autre membre sur le quiz, les pronostics ou les défis. Le meilleur gagne des points, et le perdant qui a joué reçoit un lot de consolation.</p>
      <div className="gh-icons" aria-hidden="true"><span>🧠</span><span>🎯</span><span>🏅</span></div>
      <div className="gh-stats">
        <Stat label="duels en cours" value={String(d.active)} tone={d.active > 0 ? 'good' : undefined} />
        <Stat label="victoires" value={String(d.won)} tone={d.won > 0 ? 'good' : undefined} />
      </div>
      {d.incoming > 0 && <span className="gh-badge">⚔️ {d.incoming} invitation{d.incoming > 1 ? 's' : ''} à répondre</span>}
      <span className="gh-go">Voir les duels →</span>
    </Link>
  );
}

/** La case des défis : avancement des défis du jour et de la semaine, bonus et série. */
function ChallengesCard({ d }: { d: Summary['challenges'] }) {
  return (
    <Link to="/jeux/defis" className="gh-card gh-challenges">
      <div className="gh-head"><span className="gh-icon">🎯</span><div><h2>Défis</h2><div className="gh-tag">Trois défis par jour, trois par semaine</div></div></div>
      <p className="gh-desc">Relève de petits défis sur les activités gratuites : roue, quiz, pronostics, cartes et parties gratuites. Chaque défi réussi rapporte des points, et les réussir tous donne un bonus avec un paquet de cartes.</p>
      <div className="gh-icons" aria-hidden="true"><span>🎡</span><span>🧠</span><span>🎯</span><span>🎴</span></div>
      <div className="gh-next"><span style={{ fontSize: 22 }}>{d.dailyDone >= d.dailyTotal ? '🌟' : '☀️'}</span><div><strong>Défis du jour : {d.dailyDone} / {d.dailyTotal}</strong><div className="muted" style={{ fontSize: 12.5 }}>{d.dailyDone >= d.dailyTotal ? (d.bonus ? 'Bonus du jour reçu !' : 'Bravo !') : 'Réussis-les tous pour le bonus du jour'}</div></div></div>
      <div className="gh-stats">
        <Stat label="défis de la semaine" value={`${d.weeklyDone}/${d.weeklyTotal}`} tone={d.weeklyDone > 0 ? 'good' : undefined} />
        {d.streak > 0 && <Stat label="jours de suite complets" value={`🔥 ${d.streak}`} tone="good" />}
      </div>
      {d.dailyDone < d.dailyTotal && <span className="gh-badge">🎯 {d.dailyTotal - d.dailyDone} défi{d.dailyTotal - d.dailyDone > 1 ? 's' : ''} à relever aujourd'hui</span>}
      <span className="gh-go">Voir les défis →</span>
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
          <Link to="/jeux/classements" className="muted">🏆 Classements</Link>
          <Link to="/wiki/guide-mise-o-jeu" className="muted">Comment ça marche ?</Link>
          <button type="button" className="secondary" style={{ marginLeft: 'auto' }} onClick={() => optOut(!me.optOut)}>{me.optOut ? 'Revenir aux jeux' : 'Me retirer des jeux'}</button>
        </div>
        {me.optOut && <div style={{ marginTop: 8, color: 'var(--danger)' }}>Tu t'es retiré des jeux : tu peux revenir quand tu veux avec le bouton ci-dessus.</div>}
      </div>

      <div className="gh-grid">
        {data.challenges?.enabled && <ChallengesCard d={data.challenges} />}
        {data.duels?.enabled && <DuelsCard d={data.duels} />}
        {data.moj.enabled && <MojCard d={data.moj} />}
        {data.slots.enabled && <SlotsCard d={data.slots} />}
        {data.hilo?.enabled && <HiLoCard d={data.hilo} />}
        {data.blackjack?.enabled && <BlackjackCard d={data.blackjack} />}
        {data.dice?.enabled && <DiceCard d={data.dice} />}
        {data.cards?.enabled && <CardsCard d={data.cards} />}
        {data.wheel?.enabled && <WheelCard d={data.wheel} />}
        {data.quiz?.enabled && <QuizCard d={data.quiz} />}
        {data.picks?.enabled && <PicksCard d={data.picks} />}
        <div className="gh-card gh-soon"><span className="gh-icon">🎲</span><h2>Bientôt</h2><p className="gh-desc">D'autres jeux arrivent. Dis-nous ceux que tu aimerais voir !</p></div>
      </div>
    </div>
  );
}
