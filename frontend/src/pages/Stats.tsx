import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import { CLASS_LABEL } from '../lib/memberClass';
import StatsOverview from '../components/stats/StatsOverview';
import StatsMembers from '../components/stats/StatsMembers';
import StatsTorrents from '../components/stats/StatsTorrents';
import { Bars, ChartCard, Donut, Section, Tile, gridStyle, shortDate } from '../components/stats/StatsBits';

const TABS = [
  { id: 'overview', label: '📈 Aperçu' },
  { id: 'members', label: '👥 Membres' },
  { id: 'torrents', label: '🎞️ Torrents' },
  { id: 'community', label: '💬 Communauté' },
  { id: 'economy', label: '⚙️ Économie' },
] as const;
type TabId = typeof TABS[number]['id'];
const PERIODS = [7, 30, 90];

/** Statistiques de la communauté : aperçu avec tendances, classements des membres et des torrents, communauté, économie. */
export default function Stats() {
  const [params, setParams] = useSearchParams();
  const tab: TabId = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'overview') as TabId;
  const days = PERIODS.includes(Number(params.get('days'))) ? Number(params.get('days')) : 30;
  const [data, setData] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api.get('/stats/overview', { params: { days } }).then((r) => setData(r.data)).catch(() => setError('Statistiques indisponibles'));
  }, [days]);
  useEffect(() => { api.get('/stats/me').then((r) => setMe(r.data)).catch(() => {}); }, []);

  const go = (patch: Record<string, string>) => { const next = new URLSearchParams(params); Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k))); setParams(next, { replace: true }); };

  if (error) return <p className="muted">{error}</p>;
  if (!data) return <p className="muted">Chargement...</p>;
  const periodPicker = tab === 'overview' || tab === 'community';

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>📊 Statistiques</h1>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {periodPicker && (
            <div className="row st-periods">
              {PERIODS.map((d) => <button key={d} type="button" className={d === days ? 'on' : 'secondary'} onClick={() => go({ days: d === 30 ? '' : String(d) })}>{d} jours</button>)}
            </div>
          )}
          <Link to="/dead" className="secondary st-link">☠️ Réanimation</Link>
          <Link to="/roadmap" className="secondary st-link">🗺️ Roadmap</Link>
        </div>
      </div>

      <div className="row tabs st-tabs">
        {TABS.map((t) => <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} onClick={() => go({ tab: t.id === 'overview' ? '' : t.id })}>{t.label}</button>)}
      </div>

      {tab === 'overview' && <StatsOverview data={data} me={me} days={days} />}
      {tab === 'members' && <StatsMembers classes={data.extra.memberClasses} />}
      {tab === 'torrents' && <StatsTorrents topCompleted={data.topCompleted} mostCommented={data.extra.mostCommented} deadCount={data.deadCount} />}
      {tab === 'community' && <Community data={data} days={days} />}
      {tab === 'economy' && <Economy data={data} />}
    </div>
  );
}

/** Activité de la communauté : participation, demandes, courbes de la période. */
function Community({ data, days }: { data: any; days: number }) {
  const x = data.extra;
  return (
    <div className="grid" style={{ gap: 18 }}>
      <Section title="Participation">
        <div className="grid" style={gridStyle(180)}>
          <Tile label="Nouveaux membres (7 j)" value={formatNumber(x.counts.newMembersWeek)} />
          <Tile label="Nouveaux torrents (7 j)" value={formatNumber(x.counts.uploadsWeek)} />
          <Tile label="Nouveaux torrents (30 j)" value={formatNumber(x.counts.uploadsMonth)} />
          <Tile label="Commentaires" value={formatNumber(x.counts.comments)} />
          <Tile label="Messages du chat" value={formatNumber(x.counts.messages)} />
          <Tile label="Sujets du forum" value={formatNumber(x.counts.forumTopics)} />
          <Tile label="Messages du forum" value={formatNumber(x.counts.forumPosts)} />
          <Tile label="Collections" value={formatNumber(x.counts.collections)} />
          <Tile label="Favoris" value={formatNumber(x.counts.favorites)} />
          <Tile label="Amitiés" value={formatNumber(x.counts.friendships)} />
          <Tile label="Demandes ouvertes" value={formatNumber(x.counts.requestsOpen)} />
          <Tile label="Demandes comblées" value={formatNumber(x.counts.requestsFilled)} />
        </div>
      </Section>
      <Section title={`Activité des ${days} derniers jours`}>
        <div className="grid" style={gridStyle(380)}>
          <ChartCard title="Nouveaux membres par jour"><Bars data={data.membersPerDay.map((d: any) => ({ ...d, date: shortDate(d.date) }))} x="date" label="Membres" color="#4caf50" /></ChartCard>
          <ChartCard title="Commentaires par jour"><Bars data={x.commentsPerDay.map((d: any) => ({ ...d, date: shortDate(d.date) }))} x="date" label="Commentaires" color="#c084fc" /></ChartCard>
        </div>
      </Section>
    </div>
  );
}

/** Économie du site : points, ratio, hit & run, répartition des rangs, résolutions et langues. */
function Economy({ data }: { data: any }) {
  const x = data.extra;
  return (
    <div className="grid" style={{ gap: 18 }}>
      <Section title="Économie">
        <div className="grid" style={gridStyle(190)}>
          <Tile label="Points bonus en circulation" value={formatNumber(x.economy.bonusInCirculation)} />
          <Tile label="Ratio moyen des membres" value={x.economy.averageRatio != null ? Number(x.economy.averageRatio).toFixed(2) : '—'} />
          <Tile label="Hit & run non régularisés" value={formatNumber(x.counts.hnrOpen)} tone={x.counts.hnrOpen ? 'warn' : 'good'} />
          <Tile label="Pairs actifs (45 min)" value={formatNumber(x.counts.activePeers)} />
        </div>
      </Section>
      <Section title="Répartitions">
        <div className="grid" style={gridStyle(340)}>
          <ChartCard title="Résolutions"><Donut data={x.byResolution} /></ChartCard>
          <ChartCard title="Langues"><Donut data={x.byLanguage} /></ChartCard>
          <ChartCard title="Rangs des membres"><Donut data={x.memberClasses.map((c: any) => ({ ...c, name: CLASS_LABEL[c.name] ?? c.name }))} /></ChartCard>
          <ChartCard title="Rôles"><Donut data={x.roles.map((r: any) => ({ ...r, name: r.name }))} /></ChartCard>
        </div>
      </Section>
    </div>
  );
}
