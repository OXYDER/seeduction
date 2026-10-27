import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useEventTheme } from '../store/eventTheme';
import { useMessenger } from '../store/messenger';
import { STATUS_COLOR, STATUS_LABEL, type PublicStatus } from '../lib/presence';
import { timeAgo } from '../lib/time';
import Avatar from './Avatar';
import Nick from './Nick';
import TeamLogo from './TeamLogo';

interface Side { abbrev: string; name: string; score: number | null }
interface Game { id: number; startUtc: string; state: 'FUT' | 'PRE' | 'LIVE' | 'FINAL' | 'PPD'; home: Side; away: Side; side: 'home' | 'away'; won: boolean | null; period: string | null; clock: { remaining: string } | null }
interface Canadiens { enabled: boolean; live: Game | null; featured: Game | null; last: Game[]; next: Game[] }

const mine = (g: Game) => (g.side === 'home' ? g.home : g.away);
const other = (g: Game) => (g.side === 'home' ? g.away : g.home);
const when = (iso: string) => new Date(iso).toLocaleString('fr-CA', { weekday: 'long', hour: 'numeric', minute: '2-digit' });

/** Les Canadiens : le match en cours, le dernier résultat ou le prochain match, avec le lien vers le direct. */
function CanadiensCard() {
  const enabled = useEventTheme((s) => s.mtl);
  const [d, setD] = useState<Canadiens | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const load = () => api.get('/sports/canadiens').then((r) => setD(r.data)).catch(() => undefined);
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 60_000);
    return () => clearInterval(t);
  }, [enabled]);
  if (!enabled || !d || d.enabled === false) return null;
  const now = d.live ?? d.featured ?? d.last?.[0] ?? null;
  const next = d.live ? null : d.next?.[0] ?? null;
  if (!now && !next) return null;
  const row = (g: Game, label: string) => {
    const m = mine(g), o = other(g);
    const played = g.state === 'LIVE' || g.state === 'FINAL';
    return (
      <div className="hr-game">
        <span className="hr-teams"><TeamLogo abbrev={m.abbrev} name={m.name} size={24} /><strong>{played ? `${m.score ?? 0} – ${o.score ?? 0}` : g.side === 'home' ? 'vs' : '@'}</strong><TeamLogo abbrev={o.abbrev} name={o.name} size={24} /></span>
        <span className="hr-sub">{label}</span>
        {g.state === 'FINAL' && <span className={`hr-chip ${g.won ? 'ok' : 'ko'}`}>{g.won ? 'Victoire' : 'Défaite'}</span>}
        {g.state === 'LIVE' && <span className="hr-chip live">En cours{g.period ? ` · ${g.period}` : ''}{g.clock ? ` ${g.clock.remaining}` : ''}</span>}
      </div>
    );
  };
  return (
    <section className="hr-card">
      <h4>🏒 Canadiens<Link to="/canadiens-en-direct">Direct →</Link></h4>
      {now && row(now, now.state === 'FINAL' ? 'Dernier match' : now.state === 'LIVE' ? 'En ce moment' : when(now.startUtc))}
      {next && next.id !== now?.id && row(next, `Prochain : ${when(next.startUtc)}`)}
    </section>
  );
}

interface Friend { id: string; username: string; avatarUrl?: string | null; status: PublicStatus }

/** Les amis en ligne (présence en direct du Messenger), avec un bouton pour leur écrire. */
function FriendsCard() {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const onlineMap = useMessenger((s) => s.online);
  const openDirect = useMessenger((s) => s.openDirect);
  useEffect(() => {
    const load = () => api.get('/friends').then((r) => setFriends(r.data.friends ?? [])).catch(() => undefined);
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 120_000);
    return () => clearInterval(t);
  }, []);
  if (friends === null) return null;
  const online = friends.map((f) => ({ ...f, status: (onlineMap[f.id] ?? f.status ?? 'OFFLINE') as PublicStatus })).filter((f) => f.status !== 'OFFLINE').sort((a, b) => a.username.localeCompare(b.username, 'fr', { sensitivity: 'base' }));
  return (
    <section className="hr-card">
      <h4>👫 Amis en ligne ({online.length})<Link to="/friends">Tous →</Link></h4>
      {online.length === 0 && <p className="hr-empty">{friends.length === 0 ? "Tu n'as pas encore d'amis. " : 'Aucun ami en ligne pour le moment.'}{friends.length === 0 && <Link to="/members">Trouver des membres →</Link>}</p>}
      {online.slice(0, 6).map((f) => (
        <div key={f.id} className="hr-friend">
          <Link to={`/users/${f.id}`} className="hr-fmain"><span className="hr-av"><Avatar user={f} size={26} /><i style={{ background: STATUS_COLOR[f.status] }} title={STATUS_LABEL[f.status]} /></span><Nick id={f.id} name={f.username} /></Link>
          <button type="button" className="hr-msg" title={`Écrire à ${f.username}`} aria-label={`Écrire à ${f.username}`} onClick={() => { void openDirect({ id: f.id, username: f.username, avatarUrl: f.avatarUrl }); }}>💬</button>
        </div>
      ))}
      {online.length > 6 && <Link to="/friends" className="hr-more">+ {online.length - 6} autres →</Link>}
    </section>
  );
}

/** Les dernières conversations (non lues d'abord) : un clic ouvre la discussion. */
function ChatCard() {
  const conversations = useMessenger((s) => s.conversations);
  const openWindow = useMessenger((s) => s.openWindow);
  const list = [...conversations].filter((c) => !c.archived && c.last).sort((a, b) => (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0) || new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()).slice(0, 4);
  if (list.length === 0) return null;
  const name = (c: (typeof list)[number]) => (c.type === 'DIRECT' ? c.other?.username ?? 'Message privé' : c.name ? `#${c.name}` : 'Discussion');
  return (
    <section className="hr-card">
      <h4>💬 Dans le chat<Link to="/chat">Ouvrir →</Link></h4>
      {list.map((c) => (
        <button key={c.id} type="button" className="hr-chat" onClick={() => openWindow(c.id)}>
          <span className="hr-chat-top"><b>{name(c)}</b>{c.unread > 0 && <span className="hr-badge">{c.unread}</span>}<small>{timeAgo(c.lastMessageAt)}</small></span>
          <span className="hr-chat-prev">{c.last?.senderUsername ? `${c.last.senderUsername} : ` : ''}{c.last?.preview}</span>
        </button>
      ))}
    </section>
  );
}

interface Challenge { id: string; icon: string; title: string; target: number; progress: number; done: boolean; points: number }

/** Le défi de la semaine qui avance le moins loin (ou le premier non terminé), avec sa progression. */
function ChallengeCard() {
  const [ch, setCh] = useState<{ item: Challenge; left: number } | null>(null);
  useEffect(() => {
    api.get('/games/challenges').then((r) => {
      if (!r.data?.enabled) return;
      const weekly: Challenge[] = r.data.weekly ?? [];
      const open = weekly.filter((c) => !c.done);
      if (open.length) setCh({ item: open.sort((a, b) => b.progress / b.target - a.progress / a.target)[0], left: open.length });
    }).catch(() => undefined);
  }, []);
  if (!ch) return null;
  const c = ch.item, pct = Math.round((c.progress / c.target) * 100);
  return (
    <section className="hr-card">
      <h4>🏆 Défi de la semaine<Link to="/jeux/defis">Tous →</Link></h4>
      <div className="hr-ch"><span aria-hidden="true">{c.icon}</span><span><b>{c.title}</b><span className="hr-sub">{c.progress} / {c.target}{c.points > 0 ? ` · +${c.points} pts` : ''}{ch.left > 1 ? ` · ${ch.left - 1} autre${ch.left > 2 ? 's' : ''}` : ''}</span></span></div>
      <div className="hr-bar"><i style={{ width: `${pct}%` }} /></div>
    </section>
  );
}

/** Colonne de droite de l'accueil : match des Canadiens, amis en ligne, chat, défi de la semaine. Chaque carte disparaît s'il n'y a rien à montrer. */
export default function HomeRail() {
  return (
    <aside className="home-rail" aria-label="Autour de toi">
      <CanadiensCard />
      <FriendsCard />
      <ChatCard />
      <ChallengeCard />
    </aside>
  );
}
