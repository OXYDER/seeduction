import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBytes, formatNumber } from '../../lib/format';
import { Bars, ChartCard, Donut, Section, Tile, gridStyle, shortDate, tooltipStyle } from './StatsBits';

const dayLabel = (d: string) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

/** « Toi dans les classements » : où se situe le membre. */
function MyPlace({ me }: { me: any }) {
  if (!me) return null;
  const rank = (n: number | null, label: string) => (n === null
    ? <div className="st-me-item"><strong>—</strong><span>{label}<small className="muted"> (il faut avoir téléchargé {me.minDownloadedGb} Go)</small></span></div>
    : <div className="st-me-item"><strong>#{n}</strong><span>{label}<small className="muted"> sur {me.members}</small></span></div>);
  return (
    <div className="panel st-me">
      <h3 style={{ marginTop: 0 }}>🧭 Toi dans les classements</h3>
      <div className="st-me-grid">
        {rank(me.uploadRank, 'Upload')}
        {rank(me.ratioRank, 'Ratio')}
        {rank(me.bonusRank, 'Points bonus')}
        <div className="st-me-item"><strong>{me.ratio === null ? '∞' : me.ratio.toFixed(2)}</strong><span>Ton ratio</span></div>
        <div className="st-me-item"><strong>{formatNumber(me.snatches)}</strong><span>Téléchargements complétés</span></div>
        <div className="st-me-item"><strong>{formatNumber(me.seedHours)} h</strong><span>De seed au total</span></div>
        <div className="st-me-item"><strong>{formatNumber(me.uploads)}</strong><span>Torrents envoyés</span></div>
        <div className={`st-me-item${me.hnrOpen ? ' bad' : ''}`}><strong>{me.hnrOpen}</strong><span>Hit &amp; run à régulariser</span></div>
      </div>
    </div>
  );
}

/** Vue d'ensemble : chiffres clés avec tendance, courbes de la période, records, et ta place. */
export default function StatsOverview({ data, me, days }: { data: any; me: any; days: number }) {
  const g = data.global;
  const x = data.extra;
  const t = data.trends;
  const rec = data.records;
  const record = (label: string, r: { date: string; count: number } | null, unit: string) => r && r.count > 0 ? (
    <div className="st-record"><strong>{formatNumber(r.count)}</strong> {unit}<span className="muted">{label} · {dayLabel(r.date)}</span></div>
  ) : null;

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="st-live panel">
        <span className="st-live-dot" /> <strong>En ce moment</strong>
        <span>👥 {formatNumber(data.online)} membre{data.online > 1 ? 's' : ''} en ligne</span>
        <span>🔗 {formatNumber(x.counts.activePeers)} pairs actifs</span>
        <span>🌱 {formatNumber(g.totalSeeders)} seeders</span>
        <span>⬇️ {formatNumber(g.totalLeechers)} leechers</span>
      </div>

      <MyPlace me={me} />

      <Section title={`Les ${days} derniers jours, comparés aux ${days} d'avant`}>
        <div className="grid" style={gridStyle(190)}>
          <Tile label="Nouveaux membres" value={formatNumber(t.members.cur)} trend={t.members} />
          <Tile label="Nouveaux torrents" value={formatNumber(t.torrents.cur)} trend={t.torrents} />
          <Tile label="Téléchargements complétés" value={formatNumber(t.snatches.cur)} trend={t.snatches} />
          <Tile label="Commentaires" value={formatNumber(t.comments.cur)} trend={t.comments} />
        </div>
      </Section>

      <Section title="Le site en chiffres">
        <div className="grid" style={gridStyle(170)}>
          <Tile label="Membres" value={formatNumber(g.totalUsers)} />
          <Tile label="Torrents" value={formatNumber(g.totalTorrents)} />
          <Tile label="Volume du catalogue" value={formatBytes(g.totalSize)} />
          <Tile label="Trafic total échangé" value={formatBytes(g.totalTraffic)} />
          <Tile label="Téléchargements complétés" value={formatNumber(g.totalCompleted)} />
          <Tile label="Ratio moyen" value={x.economy.averageRatio != null ? Number(x.economy.averageRatio).toFixed(2) : '—'} />
        </div>
      </Section>

      <Link to="/dead" className="panel st-dead-banner">
        <span style={{ fontSize: 34 }}>☠️</span>
        <div>
          <strong>{formatNumber(data.deadCount)} torrent{data.deadCount > 1 ? 's' : ''} sans seeder</strong>
          <div className="muted">Redonne-leur vie : tu gagnes des points bonus et d'autres membres pourront enfin les télécharger.</div>
        </div>
        <span className="st-dead-cta">Voir la zone de réanimation →</span>
      </Link>

      <div className="grid" style={gridStyle(380)}>
        <ChartCard title="Nouveaux torrents par jour"><Bars data={data.torrentsPerDay.map((d: any) => ({ ...d, date: shortDate(d.date) }))} x="date" y="count" label="Torrents" color="#e0b84a" /></ChartCard>
        <ChartCard title="Téléchargements complétés par jour"><Bars data={x.snatchesPerDay.map((d: any) => ({ ...d, date: shortDate(d.date) }))} x="date" label="Complétés" color="#7aa0ff" /></ChartCard>
        <ChartCard title="Croissance du nombre de membres">
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={data.membersCumulative.map((d: any) => ({ ...d, date: shortDate(d.date) }))}>
              <defs><linearGradient id="gm" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4caf50" stopOpacity={0.6} /><stop offset="100%" stopColor="#4caf50" stopOpacity={0.05} /></linearGradient></defs>
              <CartesianGrid stroke="#1f3d2a" vertical={false} />
              <XAxis dataKey="date" stroke="#8fa896" fontSize={11} interval="preserveStartEnd" />
              <YAxis stroke="#8fa896" fontSize={11} allowDecimals={false} domain={['dataMin - 1', 'dataMax + 1']} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="total" name="Membres" stroke="#4caf50" fill="url(#gm)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Taille du catalogue (torrents)">
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={data.torrentsCumulative.map((d: any) => ({ ...d, date: shortDate(d.date) }))}>
              <defs><linearGradient id="gt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e0b84a" stopOpacity={0.6} /><stop offset="100%" stopColor="#e0b84a" stopOpacity={0.05} /></linearGradient></defs>
              <CartesianGrid stroke="#1f3d2a" vertical={false} />
              <XAxis dataKey="date" stroke="#8fa896" fontSize={11} interval="preserveStartEnd" />
              <YAxis stroke="#8fa896" fontSize={11} allowDecimals={false} domain={['dataMin - 1', 'dataMax + 1']} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="total" name="Torrents" stroke="#e0b84a" fill="url(#gt)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Volume échangé (cumulé, en To)">
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={data.trafficPerDay.map((d: any) => ({ date: shortDate(d.date), upload: +(d.upload / 1e12).toFixed(3), download: +(d.download / 1e12).toFixed(3) }))}>
              <CartesianGrid stroke="#1f3d2a" vertical={false} />
              <XAxis dataKey="date" stroke="#8fa896" fontSize={11} interval="preserveStartEnd" />
              <YAxis stroke="#8fa896" fontSize={11} unit=" To" />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="upload" name="Upload (To)" stroke="#4caf50" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="download" name="Download (To)" stroke="#e05a5a" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Torrents par catégorie"><Donut data={data.categories} /></ChartCard>
        <ChartCard title="Téléchargements par catégorie" hint={`Sur les ${days} derniers jours`}>
          {data.snatchesByCategory.length === 0 ? <p className="muted">Aucun téléchargement sur la période.</p> : <Bars data={data.snatchesByCategory} x="name" label="Téléchargements" colors />}
        </ChartCard>
      </div>

      <Section title="Records de la période">
        <div className="st-records panel">
          {record('Jour de record', rec.torrents, 'torrents envoyés')}
          {record('Jour de record', rec.snatches, 'téléchargements complétés')}
          {record('Jour de record', rec.comments, 'commentaires')}
          {record('Jour de record', rec.members, 'nouveaux membres')}
          {!rec.torrents && !rec.snatches && !rec.comments && !rec.members && <span className="muted">Pas encore assez d'activité pour établir des records.</span>}
        </div>
      </Section>
    </div>
  );
}
