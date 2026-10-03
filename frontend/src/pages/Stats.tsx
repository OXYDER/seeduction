import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client';
import { formatBytes, formatNumber } from '../lib/format';
import TorrentLink from '../components/TorrentLink';
import UserLink from '../components/UserLink';
import { CLASS_LABEL } from '../lib/memberClass';

const COLORS = ['#e0b84a', '#4caf50', '#7aa0ff', '#c084fc', '#f472b6', '#2dd4bf', '#ef6c4a', '#9fb8a0'];
const tooltipStyle = { background: '#0c1912', border: '1px solid #1f3d2a' };

/** Statistiques de la communauté : activité des 30 derniers jours, répartition, torrents à reseeder. */
export default function Stats() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/stats/overview').then((r) => setData(r.data)).catch(() => setError('Statistiques indisponibles'));
  }, []);

  if (error) return <p className="muted">{error}</p>;
  if (!data) return <p className="muted">Chargement...</p>;

  const g = data.global;
  const x = data.extra;
  const tile = (label: string, value: string) => (
    <div className="panel"><div className="muted">{label}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div></div>
  );
  const short = (d: string) => d.slice(5);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>📊 Statistiques</h1>
        <Link to="/roadmap" className="secondary" style={{ padding: '6px 14px', borderRadius: 8 }}>🗺️ Roadmap et journal des modifications</Link>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        {tile('Membres', formatNumber(g.totalUsers))}
        {tile('Torrents', formatNumber(g.totalTorrents))}
        {tile('Seeders', formatNumber(g.totalSeeders))}
        {tile('Leechers', formatNumber(g.totalLeechers))}
        {tile('Téléchargements complétés', formatNumber(g.totalCompleted))}
        {tile('Volume du catalogue', formatBytes(g.totalSize))}
        {tile('Trafic total', formatBytes(g.totalTraffic))}
        {tile('Torrents sans seeder', formatNumber(data.deadCount))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <div className="panel">
          <h3>Nouveaux torrents (30 jours)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.torrentsPerDay.map((d: any) => ({ ...d, date: short(d.date) }))}>
              <CartesianGrid stroke="#1f3d2a" vertical={false} />
              <XAxis dataKey="date" stroke="#8fa896" fontSize={11} />
              <YAxis stroke="#8fa896" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Torrents" fill="#e0b84a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <h3>Nouveaux membres (30 jours)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.membersPerDay.map((d: any) => ({ ...d, date: short(d.date) }))}>
              <CartesianGrid stroke="#1f3d2a" vertical={false} />
              <XAxis dataKey="date" stroke="#8fa896" fontSize={11} />
              <YAxis stroke="#8fa896" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Membres" fill="#4caf50" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <h3>Volume échangé cumulé (30 jours)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.trafficPerDay.map((d: any) => ({ date: short(d.date), upload: +(d.upload / 1e12).toFixed(3), download: +(d.download / 1e12).toFixed(3) }))}>
              <CartesianGrid stroke="#1f3d2a" vertical={false} />
              <XAxis dataKey="date" stroke="#8fa896" fontSize={11} />
              <YAxis stroke="#8fa896" fontSize={11} unit=" To" />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="upload" name="Upload (To)" stroke="#4caf50" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="download" name="Download (To)" stroke="#e05a5a" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <h3>Répartition par catégorie</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.categories} dataKey="count" nameKey="name" outerRadius={80} label={(e: any) => e.name}>
                {data.categories.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <TopTorrents data={data} />
        <TopMembers x={x} />
      </div>

      {x && (
        <>
          <h2 style={{ margin: '8px 0 0' }}>Activité de la communauté</h2>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            {tile('Nouveaux membres (7 j)', formatNumber(x.counts.newMembersWeek))}
            {tile('Nouveaux torrents (7 j)', formatNumber(x.counts.uploadsWeek))}
            {tile('Nouveaux torrents (30 j)', formatNumber(x.counts.uploadsMonth))}
            {tile('Pairs actifs (45 min)', formatNumber(x.counts.activePeers))}
            {tile('Commentaires', formatNumber(x.counts.comments))}
            {tile('Messages du chat', formatNumber(x.counts.messages))}
            {tile('Sujets / messages du forum', `${formatNumber(x.counts.forumTopics)} / ${formatNumber(x.counts.forumPosts)}`)}
            {tile('Collections', formatNumber(x.counts.collections))}
            {tile('Favoris', formatNumber(x.counts.favorites))}
            {tile('Amitiés', formatNumber(x.counts.friendships))}
            {tile('Demandes ouvertes / comblées', `${formatNumber(x.counts.requestsOpen)} / ${formatNumber(x.counts.requestsFilled)}`)}
          </div>

          <h2 style={{ margin: '8px 0 0' }}>Économie</h2>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            {tile('Points bonus en circulation', formatNumber(x.economy.bonusInCirculation))}
            {tile('Ratio moyen des membres', x.economy.averageRatio != null ? Number(x.economy.averageRatio).toFixed(2) : '—')}
            {tile('Hit & run non régularisés', formatNumber(x.counts.hnrOpen))}
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
            <div className="panel">
              <h3>Téléchargements complétés (30 jours)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={x.snatchesPerDay.map((d: any) => ({ ...d, date: short(d.date) }))}>
                  <CartesianGrid stroke="#1f3d2a" vertical={false} />
                  <XAxis dataKey="date" stroke="#8fa896" fontSize={11} />
                  <YAxis stroke="#8fa896" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="Complétés" fill="#7aa0ff" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="panel">
              <h3>Commentaires (30 jours)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={x.commentsPerDay.map((d: any) => ({ ...d, date: short(d.date) }))}>
                  <CartesianGrid stroke="#1f3d2a" vertical={false} />
                  <XAxis dataKey="date" stroke="#8fa896" fontSize={11} />
                  <YAxis stroke="#8fa896" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="Commentaires" fill="#c084fc" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {[['Résolutions', x.byResolution], ['Langues', x.byLanguage], ['Rangs des membres', x.memberClasses.map((c: any) => ({ ...c, name: CLASS_LABEL[c.name] ?? c.name }))]].map(([title, list]: any) => (
              <div className="panel" key={title}>
                <h3>{title}</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={list} dataKey="count" nameKey="name" outerRadius={75} label={(e: any) => e.name}>
                      {list.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>

        </>
      )}
    </div>
  );
}

interface Tab { key: string; label: string; body: ReactNode }

/** Plusieurs classements dans un seul encadré : on change de liste avec les onglets. */
function TabbedTop({ title, tabs, footer }: { title: string; tabs: Tab[]; footer?: ReactNode }) {
  const [key, setKey] = useState(tabs[0]?.key);
  const current = tabs.find((t) => t.key === key) ?? tabs[0];
  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {tabs.map((t) => <button key={t.key} type="button" className={`secondary${t.key === current.key ? ' on' : ''}`} onClick={() => setKey(t.key)}>{t.label}</button>)}
      </div>
      {current.body}
      {footer && <div style={{ marginTop: 10 }}>{footer}</div>}
    </div>
  );
}

const rows = (list: any[], render: (item: any, i: number) => ReactNode, empty = "Rien pour l'instant.") => (
  <table><tbody>
    {list.map((item, i) => <tr key={item.id ?? item.user?.id ?? item.torrent?.id ?? i}>{render(item, i)}</tr>)}
    {list.length === 0 && <tr><td className="muted">{empty}</td></tr>}
  </tbody></table>
);
const rank = (i: number) => <td className="muted" style={{ width: 28 }}>{i + 1}</td>;

/** Tous les classements de torrents, regroupés. */
function TopTorrents({ data }: { data: any }) {
  const x = data.extra;
  const tabs: Tab[] = [
    { key: 'dl', label: '⬇️ Plus téléchargés', body: rows(data.topCompleted, (t, i) => <>{rank(i)}<td><TorrentLink torrent={t} /></td><td className="muted" style={{ whiteSpace: 'nowrap' }}>{t.completedCount} ✓ · {t.seeders} S</td></>) },
    ...(x ? [
      { key: 'cm', label: '💬 Plus commentés', body: rows(x.mostCommented, (c, i) => <>{rank(i)}<td><TorrentLink torrent={c.torrent} /></td><td className="muted" style={{ whiteSpace: 'nowrap' }}>{c.count} 💬</td></>, 'Aucun commentaire.') },
      { key: 'big', label: '📦 Plus gros', body: rows(x.biggest, (t, i) => <>{rank(i)}<td><TorrentLink torrent={t} /></td><td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatBytes(t.size)}</td></>) },
    ] : []),
    {
      key: 'dead', label: `🔁 À reseeder (${data.deadCount})`,
      body: (
        <>
          <p className="muted" style={{ marginTop: 0 }}>Torrents complétés par des membres mais sans aucun seeder : si tu les as encore, remets-les en seed (et gagne des points bonus).</p>
          {rows(data.dead, (t, i) => <>{rank(i)}<td><TorrentLink torrent={t} /></td><td className="muted" style={{ whiteSpace: 'nowrap' }}>{t.completedCount} ✓</td></>, '✓ Tous les torrents ont des seeders.')}
        </>
      ),
    },
  ];
  return <TabbedTop title="🏆 Top torrents" tabs={tabs} />;
}

/** Tous les classements de membres, regroupés (upload, envois, seed, badges). */
function TopMembers({ x }: { x: any }) {
  const [board, setBoard] = useState<any[] | null>(null);
  const [fame, setFame] = useState<any[] | null>(null);
  useEffect(() => {
    api.get('/users/leaderboard', { params: { limit: 10 } }).then((r) => setBoard(r.data)).catch(() => setBoard([]));
    api.get('/badges/hall-of-fame').then((r) => setFame(r.data.slice(0, 10))).catch(() => setFame([]));
  }, []);
  const tabs: Tab[] = [
    {
      key: 'up', label: '⬆️ Upload',
      body: board === null ? <p className="muted">Chargement…</p> : rows(board, (u, i) => <>{rank(i)}<td><UserLink user={u} /></td><td className="muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{formatBytes(u.uploaded)} · ratio {u.ratio ? u.ratio.toFixed(2) : '∞'}</td></>),
    },
    ...(x ? [
      { key: 'send', label: "📤 Plus d'envois", body: rows(x.topUploaders, (u, i) => <>{rank(i)}<td><UserLink user={u.user} /></td><td className="muted" style={{ textAlign: 'right' }}>{u.count} torrent{u.count > 1 ? 's' : ''}</td></>) },
      { key: 'seed', label: '🌱 Seeders', body: rows(x.topSeeders, (u, i) => <>{rank(i)}<td><UserLink user={u.user} /></td><td className="muted" style={{ textAlign: 'right' }}>{u.count} torrent{u.count > 1 ? 's' : ''}</td></>, 'Personne ne seede en ce moment.') },
    ] : []),
    {
      key: 'badges', label: '🎖️ Badges',
      body: fame === null ? <p className="muted">Chargement…</p> : rows(fame, (e, i) => <>{rank(i)}<td><UserLink user={e.user} /></td><td className="muted" style={{ textAlign: 'right' }}>{e.badgeCount} badge{e.badgeCount > 1 ? 's' : ''}</td></>, "Aucun badge décerné pour l'instant."),
    },
  ];
  return <TabbedTop title="👥 Top membres" tabs={tabs} footer={<span className="muted"><Link to="/leaderboard">Classement complet →</Link> · <Link to="/hall-of-fame">Hall of Fame →</Link></span>} />;
}
