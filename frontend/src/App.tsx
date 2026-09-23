import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Browse from './pages/Browse';
import Favorites from './pages/Favorites';
import ForumView from './pages/ForumView';
import { ForumLatest, ForumSearch } from './pages/ForumMisc';
import TorrentDetail from './pages/TorrentDetail';
import Upload from './pages/Upload';
import Profile from './pages/Profile';
import Leaderboard from './pages/Leaderboard';
import Admin from './pages/Admin';
import Forum from './pages/Forum';
import ForumTopic from './pages/ForumTopic';
import Messages from './pages/Messages';
import Requests from './pages/Requests';
import Rules from './pages/Rules';
import Collections from './pages/Collections';
import CollectionDetail from './pages/CollectionDetail';
import HallOfFame from './pages/HallOfFame';
import Chat from './pages/Chat';
import EntityPage from './pages/EntityPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
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
          <Route path="/forum" element={<Forum />} />
          <Route path="/forum/f/:id" element={<ForumView />} />
          <Route path="/forum/latest" element={<ForumLatest />} />
          <Route path="/forum/search" element={<ForumSearch />} />
          <Route path="/forum/topics/:id" element={<ForumTopic />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/collections/:id" element={<CollectionDetail />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/favorites" element={<Favorites />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
