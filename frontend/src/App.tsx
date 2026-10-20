import { useEffect } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LockScreen from './components/LockScreen';
import GlobalLoader from './components/GlobalLoader';
import MaintenanceBanner from './components/MaintenanceBanner';
import { useLockdownStore } from './store/lockdown';
import Layout from './components/Layout';
import { lazyPage } from './lib/lazyPage';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
const Browse = lazyPage(() => import('./pages/Browse'));
const Favorites = lazyPage(() => import('./pages/Favorites'));
const Bonus = lazyPage(() => import('./pages/Bonus'));
const Donate = lazyPage(() => import('./pages/Donate'));
const TeamManagement = lazyPage(() => import('./pages/TeamManagement'));
const Notifications = lazyPage(() => import('./pages/Notifications'));
const FreeleechCalendarPage = lazyPage(() => import('./pages/FreeleechCalendarPage'));
const Pot = lazyPage(() => import('./pages/Pot'));
const Jeux = lazyPage(() => import('./pages/Jeux'));
const GamesHub = lazyPage(() => import('./pages/GamesHub'));
const Slots = lazyPage(() => import('./pages/Slots'));
const HiLo = lazyPage(() => import('./pages/HiLo'));
const Wheel = lazyPage(() => import('./pages/Wheel'));
const Tournament = lazyPage(() => import('./pages/Tournament'));
const Quiz = lazyPage(() => import('./pages/Quiz'));
const Pronostics = lazyPage(() => import('./pages/Pronostics'));
const Blackjack = lazyPage(() => import('./pages/Blackjack'));
const Dice = lazyPage(() => import('./pages/Dice'));
const Cartes = lazyPage(() => import('./pages/Cartes'));
const Defis = lazyPage(() => import('./pages/Defis'));
const Classements = lazyPage(() => import('./pages/Classements'));
const Duels = lazyPage(() => import('./pages/Duels'));
const Courriel = lazyPage(() => import('./pages/Courriel'));
const MyUploads = lazyPage(() => import('./pages/MyUploads'));
const MySeeds = lazyPage(() => import('./pages/MySeeds'));
const MyActivity = lazyPage(() => import('./pages/MyActivity'));
const HitAndRun = lazyPage(() => import('./pages/HitAndRun'));
const Stats = lazyPage(() => import('./pages/Stats'));
const Dead = lazyPage(() => import('./pages/Dead'));
const News = lazyPage(() => import('./pages/News'));
const Support = lazyPage(() => import('./pages/Support'));
const SupportNew = lazyPage(() => import('./pages/SupportNew'));
const SupportTicket = lazyPage(() => import('./pages/SupportTicket'));
const ResetPassword = lazyPage(() => import('./pages/ResetPassword'));
const ForgotPassword = lazyPage(() => import('./pages/ForgotPassword'));
const VerifyLink = lazyPage(() => import('./pages/VerifyLink'));
const ForumView = lazyPage(() => import('./pages/ForumView'));
const ForumLatest = lazyPage(() => import('./pages/ForumMisc').then((m) => ({ default: m.ForumLatest })));
const ForumSearch = lazyPage(() => import('./pages/ForumMisc').then((m) => ({ default: m.ForumSearch })));
const TorrentDetail = lazyPage(() => import('./pages/TorrentDetail'));
const Upload = lazyPage(() => import('./pages/Upload'));
const Profile = lazyPage(() => import('./pages/Profile'));
const Leaderboard = lazyPage(() => import('./pages/Leaderboard'));
const Admin = lazyPage(() => import('./pages/Admin'));
const Moderation = lazyPage(() => import('./pages/Moderation'));
import Profiles from './pages/Profiles';
const Family = lazyPage(() => import('./pages/Family'));
const Roadmap = lazyPage(() => import('./pages/Roadmap'));
const Teams = lazyPage(() => import('./pages/Teams'));
const TeamDetail = lazyPage(() => import('./pages/TeamDetail'));
const TeamBySlug = lazyPage(() => import('./pages/TeamBySlug'));
const UserByName = lazyPage(() => import('./pages/UserByName'));
const Forum = lazyPage(() => import('./pages/Forum'));
const ForumTopic = lazyPage(() => import('./pages/ForumTopic'));
const Messages = lazyPage(() => import('./pages/Messages'));
const Requests = lazyPage(() => import('./pages/Requests'));
const Friends = lazyPage(() => import('./pages/Friends'));
const PlayerDownload = lazyPage(() => import('./pages/PlayerDownload'));
const Wiki = lazyPage(() => import('./pages/Wiki'));
const Alerts = lazyPage(() => import('./pages/Alerts'));
const Achievements = lazyPage(() => import('./pages/Achievements'));
const Referrals = lazyPage(() => import('./pages/Referrals'));
const StaffBoard = lazyPage(() => import('./pages/StaffBoard'));
const ModerationLog = lazyPage(() => import('./pages/ModerationLog'));
const Integrations = lazyPage(() => import('./pages/Integrations'));
const Telegram = lazyPage(() => import('./pages/Telegram'));
const Suggestions = lazyPage(() => import('./pages/Suggestions'));
const StaffMembers = lazyPage(() => import('./pages/StaffMembers'));
const SuggestionDetail = lazyPage(() => import('./pages/SuggestionDetail'));
const Collections = lazyPage(() => import('./pages/Collections'));
const CollectionDetail = lazyPage(() => import('./pages/CollectionDetail'));
const HallOfFame = lazyPage(() => import('./pages/HallOfFame'));
const Chat = lazyPage(() => import('./pages/Chat'));
const EntityPage = lazyPage(() => import('./pages/EntityPage'));
const Status = lazyPage(() => import('./pages/Status'));
const Recap = lazyPage(() => import('./pages/Recap'));
const Series = lazyPage(() => import('./pages/Series'));

export default function App() {
  const locked = useLockdownStore((s) => s.locked);
  // Si une alerte générale est en cours, on le sait dès l'ouverture de la page (sans attendre une requête refusée).
  useEffect(() => {
    axios.get('/api/lockdown/status').then((r) => { if (r.data?.locked) useLockdownStore.getState().setLocked(true); }).catch(() => {});
  }, []);
  if (locked) return <LockScreen />;
  return (
    <BrowserRouter>
      <GlobalLoader />
      <MaintenanceBanner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/profiles" element={<Profiles />} />
        <Route path="/register" element={<Register />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/verify" element={<VerifyLink />} />
        <Route path="/status" element={<Status />} />
        {/* Layout redirige vers /login si aucune session valide : le site
            entier est privé, rien n'est visible aux non-membres. */}
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/torrents/:id" element={<TorrentDetail />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/users/:id" element={<Profile />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/hall-of-fame" element={<HallOfFame />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/entities/:id" element={<EntityPage />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/moderation" element={<Moderation />} />
          <Route path="/family" element={<Family />} />
          <Route path="/roadmap" element={<Roadmap />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/teams/:id" element={<TeamDetail />} />
          <Route path="/team/:slug" element={<TeamBySlug />} />
          <Route path="/u/:username" element={<UserByName />} />
          <Route path="/forum" element={<Forum />} />
          <Route path="/forum/f/:id" element={<ForumView />} />
          <Route path="/forum/latest" element={<ForumLatest />} />
          <Route path="/forum/search" element={<ForumSearch />} />
          <Route path="/forum/topics/:id" element={<ForumTopic />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/player" element={<PlayerDownload />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/collections/:id" element={<CollectionDetail />} />
          <Route path="/wiki" element={<Wiki />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/referrals" element={<Referrals />} />
          <Route path="/staff-board" element={<StaffBoard />} />
          <Route path="/moderation-log" element={<ModerationLog />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/telegram" element={<Telegram />} />
          <Route path="/suggestions" element={<Suggestions />} />
          <Route path="/members" element={<StaffMembers />} />
          <Route path="/suggestions/:id" element={<SuggestionDetail />} />
          <Route path="/wiki/:slug" element={<Wiki />} />
          <Route path="/rules" element={<Navigate to="/wiki" replace />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/bonus" element={<Bonus />} />
          <Route path="/soutenir" element={<Donate />} />
          <Route path="/equipe" element={<TeamManagement />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/freeleech" element={<FreeleechCalendarPage />} />
          <Route path="/pot" element={<Pot />} />
          <Route path="/mes-envois" element={<MyUploads />} />
          <Route path="/jeux" element={<GamesHub />} />
          <Route path="/jeux/mise-o-jeu" element={<Jeux />} />
          <Route path="/jeux/machines" element={<Slots />} />
          <Route path="/jeux/plus-haut-plus-bas" element={<HiLo />} />
          <Route path="/jeux/roue" element={<Wheel />} />
          <Route path="/jeux/tournoi" element={<Tournament />} />
          <Route path="/jeux/quiz" element={<Quiz />} />
          <Route path="/jeux/pronostics" element={<Pronostics />} />
          <Route path="/jeux/blackjack" element={<Blackjack />} />
          <Route path="/jeux/des" element={<Dice />} />
          <Route path="/jeux/cartes" element={<Cartes />} />
          <Route path="/jeux/defis" element={<Defis />} />
          <Route path="/jeux/classements" element={<Classements />} />
          <Route path="/jeux/duels" element={<Duels />} />
          <Route path="/courriel" element={<Courriel />} />
          <Route path="/activity" element={<MyActivity />} />
          <Route path="/recap" element={<Recap />} />
          <Route path="/series" element={<Series />} />
          <Route path="/seeds" element={<MySeeds />} />
          <Route path="/hit-and-run" element={<HitAndRun />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/dead" element={<Dead />} />
          <Route path="/support" element={<Support />} />
          <Route path="/support/new" element={<SupportNew />} />
          <Route path="/support/:id" element={<SupportTicket />} />
          <Route path="/news" element={<News />} />
          <Route path="/news/:id" element={<News />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
