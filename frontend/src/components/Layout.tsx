import Nick from './Nick';
import { applyDefaultView } from '../lib/viewMode';
import { applyTipStyle } from '../lib/tipStyle';
import { useEventTheme } from '../store/eventTheme';
import { Suspense, useCallback, useEffect, useState, FormEvent } from 'react';
import { Outlet, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { api } from '../api/client';
import { formatBytes, formatNumber } from '../lib/format';
import HeaderStats, { type EconInfo } from './HeaderStats';
import MessageRequestDialog from './MessageRequestDialog';
import NotificationsBell from './NotificationsBell';
import TelegramHeaderLink from './TelegramHeaderLink';
import InstallPrompt from './InstallPrompt';
import ThemeSwitcher from './ThemeSwitcher';
import SearchBox from './SearchBox';
import { addSearch } from '../lib/searchHistory';
import Avatar from './Avatar';
import QuickSearch from './QuickSearch';
import FriendsStrip from './FriendsStrip';
import ChatDock from './ChatDock';
import BrowserNotifications from './BrowserNotifications';
import IdleWatcher from './IdleWatcher';
import NotificationAutoRead from './NotificationAutoRead';
import { EventIcon, EventRoot, EventStrip } from './EventDecor';
import NewYearCountdown from './NewYearCountdown';
import CanadiensPill from './CanadiensPill';
import MyUploadsIcon from './MyUploadsIcon';
import { useMyUploads } from '../store/myUploads';
import FriendsMenu from './FriendsMenu';
import MessagesMenu from './MessagesMenu';
import { useDonors } from '../store/donors';
import { useDeleted } from '../store/deleted';
import { useRanks } from '../store/ranks';
import ChatRail from './ChatRail';
import StatusSwitcher from './StatusSwitcher';
import { useDmStore } from '../store/dm';
import { useMessenger, privateUnreadOf, publicUnreadOf } from '../store/messenger';
import { useQueue } from '../store/queue';
import { useSupport } from '../store/support';
import { useNewsUnseen } from '../lib/news';
import { ProfileName } from './UserLink';
import Breadcrumbs from './Breadcrumbs';
import Staff2faBanner from './Staff2faBanner';
import { useMailStore } from '../store/mail';
import { PageLoading } from './Loading';
import AccountMenu from './AccountMenu';
import SeedObligations from './SeedObligations';
import { useTheme } from '../lib/theme';
import { PRESENCE_OPTIONS } from '../lib/presence';

export interface Profile {
  id: string;
  username: string;
  role: string;
  uploaded: string;
  downloaded: string;
  bonusPoints: number;
  ratio: number | null;
  createdAt: string;
  avatarUrl?: string | null;
  presenceStatus?: 'ONLINE' | 'AWAY' | 'BUSY' | 'INVISIBLE';
  statusText?: string | null;
  watching?: string | null;
  _count: { torrentsUploaded: number; invitees: number };
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  _count?: { torrents: number };
  children?: { id: string; _count?: { torrents: number } }[];
}

export interface LayoutContext {
  profile: Profile | null;
  categories: Category[];
}

export const CATEGORY_STYLE: Record<string, { icon: string; color: string }> = {
  films: { icon: '🎬', color: '#7aa0ff' },
  'series-tv': { icon: '📺', color: '#c084fc' },
  musique: { icon: '🎵', color: '#f472b6' },
  jeux: { icon: '🎮', color: '#4caf50' },
  applications: { icon: '💻', color: '#e0b84a' },
  animes: { icon: '🌸', color: '#ef6c4a' },
  livres: { icon: '📚', color: '#2dd4bf' },
  xxx: { icon: '🔞', color: '#9fb8a0' },
  jeunesse: { icon: '🧸', color: '#facc15' },
  'spectacles-et-humour': { icon: '🎭', color: '#fb923c' },
  sports: { icon: '🏆', color: '#38bdf8' },
  'formations-et-cours': { icon: '🎓', color: '#a3e635' },
  autres: { icon: '📁', color: '#94a3b8' },
  'films-videos': { icon: '🎬', color: '#7aa0ff' },
  ebook: { icon: '📚', color: '#2dd4bf' },
  audio: { icon: '🎵', color: '#f472b6' },
  'jeux-video': { icon: '🎮', color: '#4caf50' },
  emulation: { icon: '🕹️', color: '#f59e0b' },
  gps: { icon: '🧭', color: '#22d3ee' },
  nulled: { icon: '🧩', color: '#a78bfa' },
  'imprimante-3d': { icon: '🧊', color: '#fb7185' },
};

type NavGroupId = 'accueil' | 'catalogue' | 'bibliotheque' | 'communaute' | 'jeux' | 'perso' | 'aide' | 'equipe';
interface NavItem { to: string; icon: string; cls: string; label: string; match: (path: string) => boolean; group: NavGroupId; staffOnly?: boolean; adminOnly?: boolean; /** Visible seulement pendant une diffusion en direct. */ liveOnly?: boolean; /** Seulement dans le menu latéral groupé (pas dans la barre du haut du thème classique). */ sideOnly?: boolean }

/** Les sections du menu latéral : chacune se replie d'un clic (celle de la page courante s'ouvre tout seul ; les quatre premières sont ouvertes au départ). */
const NAV_GROUPS: { id: NavGroupId; icon: string; label: string; color: string }[] = [
  { id: 'accueil', icon: '🏠', label: 'Accueil', color: '#f59e0b' },
  { id: 'catalogue', icon: '🎬', label: 'Catalogue', color: '#38bdf8' },
  { id: 'bibliotheque', icon: '📚', label: 'Ma bibliothèque', color: '#34d399' },
  { id: 'communaute', icon: '👥', label: 'Communauté', color: '#f472b6' },
  { id: 'jeux', icon: '🎲', label: 'Jeux', color: '#a78bfa' },
  { id: 'perso', icon: '👤', label: 'Personnel', color: '#fb923c' },
  { id: 'aide', icon: '❓', label: 'Aide', color: '#2dd4bf' },
  { id: 'equipe', icon: '🛡️', label: 'Équipe', color: '#f87171' },
];
const DEFAULT_OPEN_GROUPS = ['accueil', 'catalogue', 'bibliotheque', 'communaute'];

const starts = (prefix: string) => (p: string) => p === prefix || p.startsWith(`${prefix}/`);

/** Le lien de la section en cours est surligné (les pages de détail comptent dans leur section : un torrent → Parcourir). */
const NAV_ITEMS: NavItem[] = [
  { to: '/', icon: '🏠', cls: 'c-home', label: 'Tableau de bord', match: (p) => p === '/', group: 'accueil' },
  { to: '/news', icon: '📰', cls: 'c-rules', label: 'Nouvelles', match: starts('/news'), group: 'accueil' },
  { to: '/browse', icon: '🔍', cls: 'c-search', label: 'Parcourir', match: (p) => (starts('/browse')(p) && !window.location.search.includes('categoryId=')) || starts('/torrents')(p) || starts('/entities')(p), group: 'catalogue' },
  { to: '/suggestions', icon: '💡', cls: 'c-forum', label: 'Suggestions', match: starts('/suggestions'), group: 'catalogue' },
  { to: '/dead', icon: '☠️', cls: 'c-forum', label: 'Réanimation', match: starts('/dead'), group: 'catalogue' },
  { to: '/activity', icon: '📈', cls: 'c-search', label: 'Mes torrents', match: starts('/activity'), group: 'bibliotheque', sideOnly: true },
  { to: '/seeds', icon: '🌱', cls: 'c-search', label: 'Mes seeds', match: (p) => starts('/seeds')(p) || starts('/hit-and-run')(p), group: 'bibliotheque', sideOnly: true },
  { to: '/favorites', icon: '⭐', cls: 'c-collections', label: 'Favoris', match: starts('/favorites'), group: 'bibliotheque' },
  { to: '/collections', icon: '📚', cls: 'c-collections', label: 'Collections', match: starts('/collections'), group: 'bibliotheque' },
  { to: '/requests', icon: '💬', cls: 'c-chat', label: 'Demandes', match: starts('/requests'), group: 'bibliotheque' },
  { to: '/upload', icon: '⬆️', cls: 'c-upload', label: 'Envoyer', match: starts('/upload'), group: 'bibliotheque' },
  { to: '/chat', icon: '🗨️', cls: 'c-livechat', label: 'Chat', match: starts('/chat'), group: 'communaute' },
  { to: '/forum', icon: '👥', cls: 'c-forum', label: 'Forums', match: starts('/forum'), group: 'communaute' },
  { to: '/friends', icon: '👫', cls: 'c-collections', label: 'Amis', match: starts('/friends'), group: 'communaute' },
  { to: '/teams', icon: '🏴', cls: 'c-forum', label: 'Teams', match: starts('/teams'), group: 'communaute' },
  { to: '/canadiens-en-direct', icon: '🔴', cls: 'c-livechat', label: 'Canadiens en direct', match: starts('/canadiens-en-direct'), liveOnly: true, group: 'communaute' },
  { to: '/stats', icon: '📊', cls: 'c-search', label: 'Stats et classements', match: (p) => starts('/stats')(p) || starts('/leaderboard')(p) || starts('/hall-of-fame')(p), group: 'communaute' },
  { to: '/jeux', icon: '🎲', cls: 'c-chat', label: 'Tous les jeux', match: (p) => p === '/jeux', group: 'jeux' },
  { to: '/jeux/mise-o-jeu', icon: '🏒', cls: 'c-chat', label: 'Mise-O-jeu', match: starts('/jeux/mise-o-jeu'), group: 'jeux', sideOnly: true },
  { to: '/jeux/duels', icon: '⚔️', cls: 'c-chat', label: 'Duels', match: starts('/jeux/duels'), group: 'jeux', sideOnly: true },
  { to: '/jeux/defis', icon: '🏆', cls: 'c-chat', label: 'Défis', match: starts('/jeux/defis'), group: 'jeux', sideOnly: true },
  { to: '/jeux/quiz', icon: '❓', cls: 'c-chat', label: 'Quiz', match: starts('/jeux/quiz'), group: 'jeux', sideOnly: true },
  { to: '/profile', icon: '🪪', cls: 'c-home', label: 'Mon profil', match: starts('/profile'), group: 'perso', sideOnly: true },
  { to: '/bonus', icon: '✦', cls: 'c-rules', label: 'Points bonus', match: starts('/bonus'), group: 'perso', sideOnly: true },
  { to: '/referrals', icon: '🎟️', cls: 'c-rules', label: 'Inviter un ami', match: starts('/referrals'), group: 'perso', sideOnly: true },
  { to: '/wiki', icon: '📖', cls: 'c-rules', label: 'Wiki', match: (p) => starts('/wiki')(p) || starts('/rules')(p), group: 'aide' },
  { to: '/support', icon: '🛟', cls: 'c-livechat', label: 'Support', match: starts('/support'), group: 'aide' },
  { to: '/soutenir', icon: '❤️', cls: 'c-rules', label: 'Soutenir', match: starts('/soutenir'), group: 'aide' },
  { to: '/staff-board', icon: '📋', cls: 'c-staff', label: 'Tableau de bord', match: starts('/staff-board'), staffOnly: true, group: 'equipe' },
  { to: '/moderation', icon: '🛡️', cls: 'c-staff', label: 'Modération', match: starts('/moderation'), staffOnly: true, group: 'equipe' },
  { to: '/equipe', icon: '🏅', cls: 'c-staff', label: 'Équipe et rangs', match: starts('/equipe'), staffOnly: true, group: 'equipe' },
  { to: '/admin', icon: '👑', cls: 'c-staff', label: 'Staff', match: starts('/admin'), staffOnly: true, group: 'equipe' },
];

/**
 * Compte famille : tant que le profil n'est pas choisi (jeton « de compte »), aucune page du site ne s'affiche ni ne fait
 * d'appel — on va droit à l'écran « Qui est-ce ? ».
 */
export default function Layout() {
  const token = useAuthStore((s) => s.accessToken);
  const scope = useAuthStore((s) => s.scope);
  if (token && scope === 'account') return <Navigate to="/profiles" replace />;
  return <LayoutInner />;
}

function LayoutInner() {
  const { user, accessToken, logout, login } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  // Torrents sans seeder que ce membre a déjà téléchargés : la pastille « Réanimation » l'invite à les remettre en seed.
  const [deadMine, setDeadMine] = useState(0);
  const [search, setSearch] = useState('');
  // Le texte du champ de recherche ne suit pas le membre d'une section à l'autre : il n'est conservé que tant qu'on affiche les résultats de cette recherche.
  useEffect(() => {
    setSearch(location.pathname === '/browse' ? new URLSearchParams(location.search).get('search') ?? '' : '');
  }, [location.pathname, location.search]);
  const [statusOpen, setStatusOpen] = useState(false);
  const theme = useTheme();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sideCollapsed') === '1'; } catch { return false; }
  });
  // Les donateurs (❤️ à côté de leur pseudo, partout) : chargés une fois connecté, rafraîchis toutes les 10 minutes.
  useEffect(() => {
    if (!profile) return;
    void useDonors.getState().load();
    void useDeleted.getState().load();
    void useRanks.getState().load();
    const t = window.setInterval(() => { void useDonors.getState().load(); void useDeleted.getState().load(); void useRanks.getState().load(); }, 10 * 60_000);
    return () => window.clearInterval(t);
  }, [profile?.id]);
  // Les @pseudo écrits dans du texte formaté (forum, commentaires...) sont des liens simples : on les ouvre sans recharger le site.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a.mention') as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      navigate(a.getAttribute('href') ?? '/');
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [navigate]);
  // Menu réduit : les bulles de discussion et les fenêtres se recollent à ses icônes (voir index.css, body.side-collapsed).
  useEffect(() => {
    document.body.classList.toggle('side-collapsed', collapsed);
    return () => document.body.classList.remove('side-collapsed');
  }, [collapsed]);
  function toggleCollapsed() {
    setCollapsed((v) => {
      try { localStorage.setItem('sideCollapsed', v ? '0' : '1'); } catch { /* stockage indisponible */ }
      return !v;
    });
  }
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [forumUnread, setForumUnread] = useState(0);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const onlineMap = useMessenger((s) => s.online);
  const friendsOnline = friendIds.filter((id) => (onlineMap[id] ?? 'OFFLINE') !== 'OFFLINE').length;
  const [econ, setEcon] = useState<EconInfo | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => { api.get('/roadmap/version').then((r) => setVersion(r.data.version)).catch(() => {}); }, []);
  const dmConnect = useDmStore((s) => s.connect);
  const dmDisconnect = useDmStore((s) => s.disconnect);
  const dmBump = useDmStore((s) => s.friendRequestBump);
  const msgrConnect = useMessenger((s) => s.connect);
  const msgrDisconnect = useMessenger((s) => s.disconnect);
  const privUnread = useMessenger((s) => privateUnreadOf(s.conversations));
  const pubUnread = useMessenger((s) => publicUnreadOf(s.conversations));
  const queueTotal = useQueue((s) => s.total);
  const refreshQueue = useQueue((s) => s.refresh);
  const resetQueue = useQueue((s) => s.reset);
  const supportMine = useSupport((s) => s.mine);
  const supportStaff = useSupport((s) => s.staff);
  const refreshSupport = useSupport((s) => s.refreshBadge);
  const [accountOpen, setAccountOpen] = useState(false);
  const newsUnseen = useNewsUnseen((s) => s.unseen);
  const refreshNews = useNewsUnseen((s) => s.refresh);
  useEffect(() => {
    if (!accessToken) return;
    void refreshNews();
    const t = setInterval(() => { if (!document.hidden) void refreshNews(); }, 5 * 60_000);
    return () => clearInterval(t);
  }, [accessToken, refreshNews]);

  // Compteur de messages privés non lus (pastille de l'icône ✉️) : rafraîchi à chaque changement de page, toutes les minutes, et dès qu'un message est lu.
  // « Mes envois » : torrents à corriger (demande de l'équipe). Rafraîchi à chaque changement de page et toutes les 2 minutes.
  const refreshMyUploads = useMyUploads((s) => s.refresh);
  const myUploadsHold = useMyUploads((s) => s.hold);
  useEffect(() => {
    if (!accessToken) return;
    void refreshMyUploads();
    const t = setInterval(() => { if (!document.hidden) void refreshMyUploads(); }, 2 * 60_000);
    return () => clearInterval(t);
  }, [accessToken, location.pathname, refreshMyUploads]);

  const refreshUnreadMessages = useCallback(() => {
    if (!accessToken) return;
    api.get('/messages/unread-count').then((r) => setUnreadMessages(Number(r.data) || 0)).catch(() => {});
  }, [accessToken]);
  useEffect(() => {
    setDrawer(false);
    refreshUnreadMessages();
  }, [location.pathname, refreshUnreadMessages]);
  useEffect(() => {
    if (!accessToken) return;
    const t = setInterval(() => { if (!document.hidden) refreshUnreadMessages(); }, 60_000);
    window.addEventListener('pm:changed', refreshUnreadMessages);
    return () => { clearInterval(t); window.removeEventListener('pm:changed', refreshUnreadMessages); };
  }, [accessToken, refreshUnreadMessages]);

  // Chat privé (amis) et chat public : connectés tant qu'on est authentifié, indépendamment de la page affichée
  // (façon Messenger — accessibles partout via les bulles, pas seulement sur leurs pages dédiées).
  useEffect(() => {
    if (accessToken && user) { dmConnect(accessToken); msgrConnect(accessToken, { id: user.id, username: user.username }); }
    else { dmDisconnect(); msgrDisconnect(); }
    return () => { if (!accessToken) { dmDisconnect(); msgrDisconnect(); } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) { setPendingFriendRequests(0); return; }
    const load = () => api.get('/friends').then((r) => { setPendingFriendRequests(r.data.incoming?.length ?? 0); setFriendIds((r.data.friends ?? []).map((f: any) => f.id)); }).catch(() => {});
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 90_000);
    return () => clearInterval(t);
  }, [accessToken, dmBump]);

  // Hit & run, torrents en seed : pastilles du haut, rafraîchies à chaque page puis toutes les 2 minutes.
  useEffect(() => {
    if (!accessToken) return;
    const load = () => api.get('/bonus/me').then((r) => setEcon({
      seeding: r.data.seedingCount ?? 0, hnr: (r.data.unresolved ?? []).filter((u: { repairing?: boolean }) => !u.repairing).length, perHour: r.data.perHour ?? 0, minRatio: r.data.minRatio ?? 0.5, graceGb: r.data.rules?.ratioGraceGb ?? 5,
      giftGb: r.data.rules?.welcomeUploadGb ?? 0, hnrSeedHours: r.data.rules?.hnrSeedHours ?? 72, hnrRatio: r.data.rules?.hnrRatio ?? 1, hnrLimit: r.data.rules?.hnrLimit ?? 5, maxTorrents: r.data.rules?.bonusMaxTorrents ?? 200,
    })).catch(() => {});
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 120_000);
    return () => clearInterval(t);
  }, [accessToken, location.pathname]);

  // Sujets non lus du forum (pastille du menu) : à chaque page, puis toutes les 2 minutes.
  useEffect(() => {
    if (!accessToken) { setForumUnread(0); return; }
    const load = () => api.get('/forum/unread-count').then((r) => setForumUnread(Number(r.data?.unread) || 0)).catch(() => {});
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 120_000);
    return () => clearInterval(t);
  }, [accessToken, location.pathname]);

  useEffect(() => {
    if (!accessToken) return;
    api.get('/categories').then((r) => setCategories(r.data)).catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) {
      api.get('/users/me').then((r) => { setProfile(r.data); applyDefaultView(r.data.defaultView); applyTipStyle(r.data.tipStyle); useEventTheme.getState().applyAccountMtlSound(r.data.goalSound === true); useMessenger.getState().setBubbles(r.data.chatBubbles !== false); }).catch(() => {});
    } else {
      setProfile(null);
    }
  }, [accessToken]);

  // Les chiffres du haut (ratio, upload, téléchargé, points) restent à jour : sans ça ils gardaient les valeurs de la connexion pendant que les listes de membres montraient les chiffres du moment.
  // On ne remplace que les statistiques (pas le reste du profil, pour ne pas écraser un réglage en cours de modification).
  useEffect(() => {
    if (!accessToken) return;
    let last = Date.now();
    const refresh = () => {
      if (document.hidden) return;
      last = Date.now();
      api.get('/users/me').then((r) => setProfile((p) => (p ? { ...p, uploaded: r.data.uploaded, downloaded: r.data.downloaded, bonusPoints: r.data.bonusPoints, ratio: r.data.ratio } : r.data))).catch(() => undefined);
    };
    const t = setInterval(refresh, 30_000);
    const onVisible = () => { if (!document.hidden && Date.now() - last > 10_000) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); };
  }, [accessToken]);

  // Compte famille : revenir à l'écran « Qui est-ce ? » (nouveau choix de profil, donc nouveau PIN).
  async function switchProfile() {
    try {
      const { data } = await api.post('/family/exit');
      msgrDisconnect();
      dmDisconnect();
      login(data.accessToken, user, 'account');
      navigate('/profiles');
    } catch { /* session expirée : l'intercepteur s'en occupe */ }
  }

  const isStaff = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(user?.role ?? '');
  const isAdmin = ['ADMIN', 'OWNER'].includes(user?.role ?? '');

  // Direct : le lien du menu n'apparaît que pendant une diffusion planifiée (page « Direct » ; Admin > Direct).
  const [liveNow, setLiveNow] = useState(false);
  useEffect(() => {
    if (!accessToken) { setLiveNow(false); return; }
    const load = () => api.get('/live').then((r) => setLiveNow(!!r.data?.live)).catch(() => undefined);
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    return () => clearInterval(t);
  }, [accessToken]);

  // Courriel (équipe) : le lien apparaît dans le menu du compte seulement si une boîte a été configurée pour ce membre ; pastille = courriels non lus.
  const [hasMail, setHasMail] = useState(false);
  const publishMail = useMailStore((st) => st.setHasMail);
  useEffect(() => { publishMail(hasMail); }, [hasMail, publishMail]);
  const [mailUnread, setMailUnread] = useState(0);
  useEffect(() => {
    if (!accessToken || !isStaff) { setHasMail(false); setMailUnread(0); return; }
    api.get('/webmail/mailboxes').then((r) => setHasMail((r.data?.length ?? 0) > 0)).catch(() => setHasMail(false));
  }, [accessToken, isStaff]);
  useEffect(() => {
    if (!accessToken || !hasMail) { setMailUnread(0); return; }
    const load = () => api.get('/webmail/unread').then((r) => setMailUnread(r.data.unread ?? 0)).catch(() => undefined);
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 120_000);
    return () => clearInterval(t);
  }, [accessToken, hasMail, location.pathname === '/courriel']);

  // File de modération (staff) : pastille du menu, recomptée à chaque changement de page et toutes les minutes.
  useEffect(() => {
    if (!accessToken || !isStaff) { resetQueue(); return; }
    void refreshQueue();
  }, [accessToken, isStaff, location.pathname, refreshQueue, resetQueue]);
  useEffect(() => {
    if (!accessToken || !isStaff) return;
    const t = setInterval(() => { if (!document.hidden) void refreshQueue(); }, 60_000);
    return () => clearInterval(t);
  }, [accessToken, isStaff, refreshQueue]);

  useEffect(() => {
    if (!accessToken) return;
    const load = () => api.get('/stats/dead/mine-count').then((r) => setDeadMine(r.data.count ?? 0)).catch(() => {});
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 10 * 60_000);
    return () => clearInterval(t);
  }, [accessToken]);

  // Pastille du support : réponses non lues à mes billets (et, pour l'équipe, billets en attente).
  useEffect(() => {
    if (!accessToken) return;
    void refreshSupport();
    const t = setInterval(() => { if (!document.hidden) void refreshSupport(); }, 60_000);
    return () => clearInterval(t);
  }, [accessToken, refreshSupport, location.pathname]);

  /** Pastilles d'un lien du menu : messages privés / publics non lus pour « Chat », éléments à traiter pour « Modération ». */
  // Thème d'événement : une petite icône à la suite de quelques entrées du menu (chacune la sienne).
  const EVENT_NAV: Record<string, number> = { '/news': 0, '/forum': 1, '/chat': 2, '/requests': 3, '/suggestions': 4, '/soutenir': 5 };
  const evNav = (to: string) => (to in EVENT_NAV ? <EventIcon seed={EVENT_NAV[to]} size={15} className="ev-nav" /> : null);
  const badgesFor = (item: NavItem) => {
    const fmt = (n: number) => (n > 99 ? '99+' : String(n));
    if (item.to === '/chat') {
      return (
        <>
          {privUnread > 0 && <span className="side-badge red" title={`${privUnread} message${privUnread > 1 ? 's' : ''} privé${privUnread > 1 ? 's' : ''} non lu${privUnread > 1 ? 's' : ''}`}>{fmt(privUnread)}</span>}
          {pubUnread > 0 && <span className="side-badge red outline" title={`${pubUnread} message${pubUnread > 1 ? 's' : ''} public${pubUnread > 1 ? 's' : ''} non lu${pubUnread > 1 ? 's' : ''}`}># {fmt(pubUnread)}</span>}
        </>
      );
    }
    if (item.to === '/friends') {
      return (
        <>
          {pendingFriendRequests > 0 && <span className="side-badge red" title={`${pendingFriendRequests} demande${pendingFriendRequests > 1 ? 's' : ''} d'ami`}>{fmt(pendingFriendRequests)}</span>}
          {friendsOnline > 0 && <span className="side-badge green" title={`${friendsOnline} ami${friendsOnline > 1 ? 's' : ''} en ligne`}>{fmt(friendsOnline)}</span>}
        </>
      );
    }
    if (item.to === '/upload' && myUploadsHold > 0) return <span className="side-badge red" title={`${myUploadsHold} torrent${myUploadsHold > 1 ? 's' : ''} à corriger : l'équipe te demande une modification`}>{fmt(myUploadsHold)}</span>;
    if (item.to === '/dead' && deadMine > 0) return <span className="side-badge red" title={`${deadMine} torrent${deadMine > 1 ? 's' : ''} sans seeder que tu peux relancer`}>{fmt(deadMine)}</span>;
    if (item.to === '/forum' && forumUnread > 0) return <span className="side-badge red" title={`${forumUnread} sujet${forumUnread > 1 ? 's' : ''} non lu${forumUnread > 1 ? 's' : ''} dans le forum`}>{fmt(forumUnread)}</span>;
    if (item.to === '/news' && newsUnseen > 0) return <span className="side-badge red" title={`${newsUnseen} nouvelle${newsUnseen > 1 ? 's' : ''} non lue${newsUnseen > 1 ? 's' : ''}`}>{fmt(newsUnseen)}</span>;
    if (item.to === '/support' && supportMine > 0) {
      return (
        <>
          {supportMine > 0 && <span className="side-badge red" title={`${supportMine} réponse${supportMine > 1 ? 's' : ''} à tes billets`}>{fmt(supportMine)}</span>}
        </>
      );
    }
    if (item.to === '/moderation' && queueTotal + (supportStaff ?? 0) > 0) {
      const all = queueTotal + (supportStaff ?? 0);
      return <span className="side-badge red" title={`${queueTotal} élément${queueTotal > 1 ? 's' : ''} à modérer et ${supportStaff ?? 0} billet${(supportStaff ?? 0) > 1 ? 's' : ''} de support en attente`}>{fmt(all)}</span>;
    }
    return null;
  };

  // Menu en groupes : ceux que le membre a ouverts sont mémorisés ; le groupe de la page courante s'ouvre tout seul.
  const [openGroups, setOpenGroups] = useState<string[]>(() => { try { const raw = localStorage.getItem('side-groups-v2'); if (raw === null) return DEFAULT_OPEN_GROUPS; const v = JSON.parse(raw); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : DEFAULT_OPEN_GROUPS; } catch { return []; } });
  const saveGroups = (g: string[]) => { setOpenGroups(g); try { localStorage.setItem('side-groups-v2', JSON.stringify(g)); } catch { /* préférence facultative */ } };
  const toggleGroup = (id: string) => saveGroups(openGroups.includes(id) ? openGroups.filter((x) => x !== id) : [...openGroups, id]);
  useEffect(() => {
    const here = NAV_ITEMS.find((i) => i.match(location.pathname));
    if (here && !openGroups.includes(here.group)) setOpenGroups((g) => (g.includes(here.group) ? g : [...g, here.group]));
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  // Recherche rapide : Ctrl+K (ou ⌘K) depuis n'importe quelle page.
  const [quickOpen, setQuickOpen] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setQuickOpen((v) => !v); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  /** Pastille d'une entrée en chiffre (pour résumer un groupe replié : un « 2 » sur « Communauté » = 2 choses à voir dedans). */
  const countOf = (item: NavItem): number => {
    switch (item.to) {
      case '/friends': return pendingFriendRequests;
      case '/forum': return forumUnread;
      case '/news': return newsUnseen;
      case '/support': return supportMine;
      case '/moderation': return queueTotal + (supportStaff ?? 0);
      case '/dead': return deadMine;
      default: return 0;
    }
  };

  function goSearch(query?: string) {
    const q = query ?? search;
    addSearch(q);
    navigate(`/browse?search=${encodeURIComponent(q)}`);
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    goSearch();
  }

  // Le site n'est pas visible aux non-membres : tout ce qui passe par ce
  // Layout (donc tout sauf /login et /register) exige une session valide.
  if (!accessToken) return <Navigate to="/login" replace />;

  // ---- Thème Prestige : barre latérale (ordinateur) / barre d'onglets (mobile) ----
  if (theme === 'prestige') {
    const visibleNav = NAV_ITEMS.filter((item) => (!item.staffOnly || isStaff) && (!item.adminOnly || isAdmin) && (!item.liveOnly || liveNow || starts('/canadiens-en-direct')(location.pathname)) && !(item.to === '/upload' && user?.profile && !user.profile.perms?.upload)); // sans le droit d'envoi accordé par le profil principal
    const tabs = ['/', '/browse', '/upload', '/forum'].map((to) => NAV_ITEMS.find((i) => i.to === to)!);

    return (
      <div className={`shell${collapsed ? ' collapsed' : ''}`}>
        {drawer && <div className="shell-overlay" onClick={() => setDrawer(false)} />}
        <aside className={`side-nav${drawer ? ' open' : ''}`}>
          <div className="side-head">
            <Link to="/" className="side-brand" title="Accueil">
              <img src="/logo-icon.png" alt="" width={34} height={34} />
              <span>SEEDUCTION</span>
            </Link>
            <button
              type="button"
              className="secondary side-collapse"
              onClick={toggleCollapsed}
              title={collapsed ? 'Agrandir le menu' : 'Réduire le menu (icônes seules)'}
              aria-label={collapsed ? 'Agrandir le menu' : 'Réduire le menu'}
              aria-expanded={!collapsed}
            >
              {collapsed ? '❯' : '❮'}
            </button>
          </div>

          <div className="side-user">
            <div
              className="side-user-card"
              style={{ position: 'relative', cursor: 'pointer' }}
              onClick={() => setAccountOpen((v) => !v)}
              title="Mon compte"
              aria-haspopup="menu"
              aria-expanded={accountOpen}
            >
              <span style={{ position: 'relative', display: 'inline-block', width: 38, height: 38, flexShrink: 0 }}>
                <Avatar user={{ username: user?.username, avatarUrl: profile?.avatarUrl }} size={38} />
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: '50%',
                    background: (PRESENCE_OPTIONS.find((o) => o.value === profile?.presenceStatus) ?? PRESENCE_OPTIONS[0]).color,
                    border: '2px solid var(--bg-panel, #10162a)',
                  }}
                />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="side-user-name">{user?.username ? <ProfileName username={user.username} /> : null}</div>
                <div className="side-user-sub">
                  Ratio <strong style={{ color: profile?.ratio != null && profile.ratio < 1 ? 'var(--danger)' : 'var(--success)' }}>{profile?.ratio != null ? profile.ratio.toFixed(2) : '∞'}</strong>
                </div>
                {(profile?.watching || profile?.statusText) && (
                  <div className="side-user-sub">
                    {profile?.watching ? <span title={profile.watching}>🎬 {profile.watching}</span> : <span style={{ fontStyle: 'italic' }}>{profile?.statusText}</span>}
                  </div>
                )}
              </div>
              <StatusSwitcher
                value={profile?.presenceStatus}
                statusText={profile?.statusText}
                open={statusOpen}
                onOpenChange={setStatusOpen}
                onChange={(v, t) => setProfile((p) => (p ? { ...p, presenceStatus: v, statusText: t } : p))}
              />
            </div>
            <AccountMenu
              userId={user?.id}
              profile={profile}
              open={accountOpen}
              onClose={() => setAccountOpen(false)}
              onStatus={() => { setAccountOpen(false); setStatusOpen(true); }}
              canUpload={!user?.profile || user.profile.perms?.upload !== false}
              mail={hasMail ? { unread: mailUnread } : null}
            />
            <button className="secondary side-logout" onClick={() => { logout(); window.location.assign('/login'); }} title="Se déconnecter">⎋</button>
          </div>
          {user && (
            <div className="side-family">
              {user?.profile && <button type="button" className="secondary" onClick={switchProfile} title="Changer de profil (PIN demandé)">↔ Changer de profil</button>}
              {(!user?.profile || user.profile.isMaster) && <Link to="/family" className={`secondary${starts('/family')(location.pathname) ? ' active' : ''}`} title="Compte famille : profils, activité, conversations des enfants">👨‍👩‍👧 Famille</Link>}
            </div>
          )}
          <nav className="side-links">
            {(() => {
              const link = (item: NavItem) => {
                const active = item.match(location.pathname);
                return (
                  <Link key={item.to} to={item.to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} title={item.label}>
                    <span className="side-icon">{item.icon}</span>
                    <span>{item.label}</span>
                    {evNav(item.to)}{badgesFor(item)}
                  </Link>
                );
              };
              // Menu réduit (icônes seules) : la liste à plat, comme avant.
              if (collapsed) return visibleNav.map(link);
              // Le catalogue par type : une entrée par catégorie principale (Films, Séries...), sous « Parcourir ».
              const catItems: NavItem[] = categories.map((c) => ({ to: `/browse?categoryId=${c.id}`, icon: CATEGORY_STYLE[c.slug]?.icon ?? '📁', cls: 'c-search', label: c.name, group: 'catalogue' as const, sideOnly: true, match: (p: string) => starts('/browse')(p) && window.location.search.includes(`categoryId=${c.id}`) }));
              return (
                <>
                  {NAV_GROUPS.map((g) => {
                    let items = visibleNav.filter((i) => i.group === g.id);
                    if (g.id === 'catalogue') items = [...items.slice(0, 1), ...catItems, ...items.slice(1)];
                    if (items.length === 0) return null;
                    const open = openGroups.includes(g.id);
                    const hasActive = items.some((i) => i.match(location.pathname));
                    const todo = open ? 0 : items.reduce((n, i) => n + countOf(i) + (i.to === '/chat' ? privUnread + pubUnread : 0), 0);
                    return (
                      <div key={g.id} className={`side-group${open ? ' open' : ''}${hasActive ? ' here' : ''}`} style={{ ['--gc' as string]: g.color }}>
                        <button type="button" className="side-group-head" onClick={() => toggleGroup(g.id)} aria-expanded={open}>
                          <span className="side-icon">{g.icon}</span>
                          <span>{g.label}</span>
                          {todo > 0 && <span className="side-badge red" title="À voir dans cette section">{todo > 99 ? '99+' : todo}</span>}
                          <span className="side-chev" aria-hidden="true">›</span>
                        </button>
                        {open && <div className="side-group-items">{items.map(link)}</div>}
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </nav>
          {version && <Link to="/roadmap" className="side-version" title="Roadmap et journal des modifications">v{version}</Link>}

        </aside>
        <FriendsStrip />

        <div className="shell-main">
          <header className="side-topbar">
            <button type="button" className="secondary side-burger" onClick={() => setDrawer(true)} aria-label="Ouvrir le menu">☰</button>
            <form className="side-search" onSubmit={submitSearch}>
              <SearchBox
                placeholder="Rechercher un torrent, un acteur, un producteur, un genre, un membre..."
                value={search}
                onChange={setSearch}
                onSubmit={goSearch}
                scopes={['torrents', 'users', 'categories', 'entities']}
                history
              />
            </form>
            <button type="button" className="secondary side-kbd" onClick={() => setQuickOpen(true)} title="Recherche rapide : pages, torrents, membres">Ctrl K</button>
            {profile && (
              <HeaderStats profile={profile} econ={econ} teamExempt={['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(profile.role)} />
            )}
            <div className="row" style={{ gap: 8 }}>
              <NewYearCountdown />
              <CanadiensPill />
              <ThemeSwitcher />
              <SeedObligations />
              <TelegramHeaderLink />
              <NotificationsBell />
              <MyUploadsIcon />
              <MessagesMenu unread={unreadMessages} active={starts('/messages')(location.pathname)} />
              <FriendsMenu pending={pendingFriendRequests} online={friendsOnline} active={starts('/friends')(location.pathname)} />
            </div>
          </header>

          <QuickSearch open={quickOpen} onClose={() => setQuickOpen(false)} pages={visibleNav.map((i) => ({ to: i.to, icon: i.icon, label: i.label }))} />
          <main className="container">
            <EventStrip />
            <Staff2faBanner />
            <Breadcrumbs />
            <div key={location.pathname} className="page-enter">
              <Suspense fallback={<PageLoading />}><Outlet context={{ profile, categories } satisfies LayoutContext} /></Suspense>
            </div>
          </main>
        </div>

        <nav className="tabbar" aria-label="Navigation principale">
          {tabs.map((item) => {
            const active = item.match(location.pathname);
            return (
              <Link key={item.to} to={item.to} className={active ? 'active' : ''}>
                <span>{item.icon}</span>
                <small>{item.label}</small>
              </Link>
            );
          })}
          <button type="button" onClick={() => setDrawer(true)} className="tab-more">
            <span>☰{(privUnread + pubUnread + (isStaff ? queueTotal : 0)) > 0 && <i className="tab-dot" />}</span>
            <small>Menu</small>
          </button>
        </nav>

        <EventRoot />
        <InstallPrompt />
        <ChatRail />
        <ChatDock />
        <MessageRequestDialog />
        <BrowserNotifications />
        <IdleWatcher />
        <NotificationAutoRead />
      </div>
    );
  }

  return (
    <div>
      <div className="topbar">
        <Link to="/" className="row" style={{ gap: 8 }}>
          <img src="/logo-icon.png" alt="" width={26} height={26} />
          <span className="topbar-brand">Seeduction Tracker</span>
        </Link>
        {profile && (
          <div className="topbar-stats">
            <div className="topbar-stat ratio">
              <span className="label">Ratio :</span>
              <span className="value">{profile.ratio != null ? profile.ratio.toFixed(2) : '∞'}</span>
            </div>
            <div className="topbar-stat up">
              <span className="label">Upload :</span>
              <span className="value">{formatBytes(profile.uploaded)}</span>
            </div>
            <div className="topbar-stat down">
              <span className="label">Téléchargé :</span>
              <span className="value">{formatBytes(profile.downloaded)}</span>
            </div>
            <Link to="/bonus" className="topbar-stat" title="Boutique bonus et règle du seed">
              <span className="label">Points Seed :</span>
              <span className="value">{formatNumber(Math.round(profile.bonusPoints))}</span>
            </Link>
            <div className="topbar-stat" title="Upload moins téléchargé">
              <span className="label">Différentiel :</span>
              <span className="value">{Number(profile.uploaded) >= Number(profile.downloaded) ? '+' : '−'}{formatBytes(Math.abs(Number(profile.uploaded) - Number(profile.downloaded)))}</span>
            </div>
            {econ && <Link to="/seeds" className="topbar-stat" title="Torrents en seed / hit & run"><span className="label">Seeds / H&amp;R :</span><span className="value">{econ.seeding} / {econ.hnr}</span></Link>}
            <Link to="/referrals" className="topbar-stat" title="Inviter un ami : créer un code d'invitation, voir mes invités">
              <span className="label">Invitations :</span>
              <span className="value">{profile._count.invitees}</span>
            </Link>
          </div>
        )}
        <div className="row">
          <NewYearCountdown />
          <CanadiensPill />
          <ThemeSwitcher />
          <SeedObligations />
          <TelegramHeaderLink />
          <NotificationsBell />
          <MyUploadsIcon />
          <Link to="/messages" className={`top-link${starts('/messages')(location.pathname) ? ' active' : ''}`}>Messages</Link>
          <Link to="/friends" className={`top-link${starts('/friends')(location.pathname) ? ' active' : ''}`}>Amis{pendingFriendRequests > 0 ? ` (${pendingFriendRequests})` : ''}{friendsOnline > 0 && <span className="online-count" title="Amis en ligne"> ● {friendsOnline}</span>}</Link>
          <Link to="/profile" className={`top-link${starts('/profile')(location.pathname) || starts('/users')(location.pathname) ? ' active' : ''}`}><Nick id={user?.id} name={user?.username ?? ''} /></Link>
          <button className="secondary" onClick={() => { logout(); window.location.assign('/login'); }}>
            Déconnexion
          </button>
        </div>
      </div>

      <div className="mainnav">
        <div className="nav-links">
          {NAV_ITEMS.filter((item) => !item.sideOnly && (!item.staffOnly || isStaff) && (!item.adminOnly || isAdmin) && (!item.liveOnly || liveNow || starts('/canadiens-en-direct')(location.pathname))).map((item) => {
            const active = item.match(location.pathname);
            return (
              <Link key={item.to} to={item.to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
                <span className={`nav-icon ${item.cls}`}>{item.icon}</span>{item.label}{evNav(item.to)}{badgesFor(item)}
              </Link>
            );
          })}
        </div>

        <form className="search-row" onSubmit={submitSearch}>
          <SearchBox
            placeholder="Rechercher un torrent, un acteur, un producteur, un genre, un membre..."
            value={search}
            onChange={setSearch}
            onSubmit={goSearch}
            scopes={['torrents', 'users', 'categories', 'entities']}
            history
          />
          <button type="submit">Rechercher</button>
        </form>

        {categories.length > 0 && (
          <div className="category-chips">
            {categories.map((c) => {
              const style = CATEGORY_STYLE[c.slug];
              const activeCategory = location.pathname === '/browse' ? new URLSearchParams(location.search).get('categoryId') : null;
              const isActive = !!activeCategory && (activeCategory === c.id || !!c.children?.some((sub) => sub.id === activeCategory));
              return (
                <Link key={c.id} to={`/browse?categoryId=${c.id}`} title={c.name} className={[c.imageUrl ? 'has-image' : '', isActive ? 'active' : ''].filter(Boolean).join(' ') || undefined}>
                  {c.imageUrl ? (
                    <img src={c.imageUrl} alt={c.name} className="category-img" />
                  ) : (
                    <>
                      {style ? <span>{style.icon}</span> : <span className="dot" style={{ background: 'var(--gold)' }} />}
                      {c.name}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="container">
        <EventStrip />
        <Staff2faBanner />
        <Breadcrumbs />
        <Suspense fallback={<PageLoading />}><Outlet context={{ profile, categories } satisfies LayoutContext} /></Suspense>
      </div>

      <EventRoot />
      <InstallPrompt />
      <ChatRail />
      <ChatDock />
      <BrowserNotifications />
      <IdleWatcher />
      <NotificationAutoRead />
    </div>
  );
}
