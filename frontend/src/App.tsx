import { useEffect } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LockScreen from './components/LockScreen';
import GlobalLoader from './components/GlobalLoader';
import { useLockdownStore } from './store/lockdown';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Browse from './pages/Browse';
import Favorites from './pages/Favorites';
import Bonus from './pages/Bonus';
import Pot from './pages/Pot';
import MySeeds from './pages/MySeeds';
import MyActivity from './pages/MyActivity';
import HitAndRun from './pages/HitAndRun';
import Stats from './pages/Stats';
import Dead from './pages/Dead';
import News from './pages/News';
import Support from './pages/Support';
import SupportNew from './pages/SupportNew';
import SupportTicket from './pages/SupportTicket';
import ResetPassword from './pages/ResetPassword';
import ForgotPassword from './pages/ForgotPassword';
import VerifyLink from './pages/VerifyLink';
import ForumView from './pages/ForumView';
import { ForumLatest, ForumSearch } from './pages/ForumMisc';
import TorrentDetail from './pages/TorrentDetail';
import Upload from './pages/Upload';
import Profile from './pages/Profile';
import Leaderboard from './pages/Leaderboard';
import Admin from './pages/Admin';
import Moderation from './pages/Moderation';
import Profiles from './pages/Profiles';
import Family from './pages/Family';
import Roadmap from './pages/Roadmap';
import Teams from './pages/Teams';
import TeamDetail from './pages/TeamDetail';
import TeamBySlug from './pages/TeamBySlug';
import Forum from './pages/Forum';
import ForumTopic from './pages/ForumTopic';
import Messages from './pages/Messages';
import Requests from './pages/Requests';
import Friends from './pages/Friends';
import PlayerDownload from './pages/PlayerDownload';
import Wiki from './pages/Wiki';
import Collections from './pages/Collections';
import CollectionDetail from './pages/CollectionDetail';
import HallOfFame from './pages/HallOfFame';
import Chat from './pages/Chat';
import EntityPage from './pages/EntityPage';

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
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/profiles" element={<Profiles />} />
        <Route path="/register" element={<Register />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/verify" element={<VerifyLink />} />
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
          <Route path="/wiki/:slug" element={<Wiki />} />
          <Route path="/rules" element={<Navigate to="/wiki" replace />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/bonus" element={<Bonus />} />
          <Route path="/pot" element={<Pot />} />
          <Route path="/activity" element={<MyActivity />} />
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
