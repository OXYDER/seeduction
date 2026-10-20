import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import Loading from '../components/Loading';

interface Cmp { beatsPercent: number; median: number; average: number; members: number }
interface Data {
  month: { key: string; label: string; days: number; current: boolean };
  months: { key: string; label: string; current: boolean }[];
  sharing: { uploaded: number; downloaded: number; best: { day: string; up: number } | null; daily: { day: string; up: number }[]; activeDays: number; hasData: boolean };
  watching: { totalSeconds: number; series: { title: string; cover: string | null; episodes: number; seconds: number }[]; other: { title: string; cover: string | null; seconds: number }[]; seriesCount: number; otherCount: number };
  points: { earned: number; spent: number; net: number; bySource: { source: string; label: string; credit: number; debit: number }[] };
  badges: { code: string; name: string; icon: string; points: number }[];
  activity: { completed: number; uploadsApproved: number; comments: number; forumPosts: number };
  compare: { upload: Cmp | null; points: Cmp | null };
}

const fmt = (n: number) => Math.round(n).toLocaleString('fr-CA');
const hours = (s: number) => (s >= 3600 ? Math.floor(s / 3600) + ' h ' + String(Math.round((s % 3600) / 60)).padStart(2, '0') + ' min' : Math.max(1, Math.round(s / 60)) + ' min');
const dayLabel = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });

function Stat({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <div className="panel" style={{ display: 'grid', gap: 2, textAlign: 'center' }}>
      <div style={{ fontSize: 26 }} aria-hidden>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold-bright)' }}>{value}</div>
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

/** Une barre « parmi les autres membres » : ma position, la médiane et la moyenne, sans nommer personne. */
function Position({ title, mine, cmp, format }: { title: string; mine: number; cmp: Cmp | null; format: (n: number) => string }) {
  if (!cmp) return <div className="muted" style={{ fontSize: 13 }}>{title} : pas assez de membres actifs ce mois-ci pour te comparer.</div>;
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <strong>{title}</strong>
        <span style={{ color: 'var(--gold-bright)', fontWeight: 700 }}>{cmp.beatsPercent > 0 ? 'Tu dépasses ' + cmp.beatsPercent + ' % des membres actifs' : 'Tu fais partie des membres les plus calmes ce mois-ci'}</span>
      </div>
      <div style={{ position: 'relative', height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.1)' }} aria-label={'Plus que ' + cmp.beatsPercent + ' % des membres'}>
        <div style={{ width: cmp.beatsPercent + '%', height: '100%', borderRadius: 5, background: 'var(--gold, #e0b84a)' }} />
      </div>
      <div className="muted" style={{ fontSize: 12.5 }}>Toi : {format(mine)} · médiane des membres : {format(cmp.median)} · moyenne : {format(cmp.average)} ({cmp.members} membres actifs comparés, anonymement)</div>
    </div>
  );
}

/** Mon récap du mois : partage, visionnage, points, badges et ma place parmi les membres. */
export default function Recap() {
  const [params, setParams] = useSearchParams();
  const mois = params.get('mois') ?? '';
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setData(null); setError('');
    api.get('/recap', { params: mois ? { mois } : {} }).then((r) => setData(r.data)).catch((e) => setError(e.response?.data?.message ?? 'Chargement impossible'));
  }, [mois]);
  if (error) return <p style={{ color: 'var(--danger)' }}>{error}</p>;
  if (!data) return <Loading />;
  const d = data;
  const quiet = !d.sharing.hasData && d.watching.totalSeconds === 0 && d.points.earned === 0 && d.badges.length === 0;

  return (
    <div className="grid">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ margin: 0 }}>📅 Mon récap de {d.month.label}</h1>
        <select value={d.month.key} onChange={(e) => setParams(e.target.value === d.months[0]?.key ? {} : { mois: e.target.value })} aria-label="Choisir un mois">
          {d.months.map((m) => <option key={m.key} value={m.key}>{m.label}{m.current ? ' (en cours)' : ''}</option>)}
        </select>
      </div>
      {d.month.current && <p className="muted" style={{ margin: 0 }}>Le mois n'est pas fini : les chiffres de partage se mettent à jour chaque nuit.</p>}
      {quiet && <div className="panel"><p style={{ margin: 0 }}>Rien à raconter pour ce mois-ci. Seede quelques torrents, regarde un film dans le <Link to="/player">lecteur Seeduction</Link>, joue aux <Link to="/jeux">jeux</Link> : ton récap se remplira tout seul.</p></div>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Stat icon="⬆️" label="Envoyé" value={formatBytes(d.sharing.uploaded)} sub={d.sharing.activeDays + ' jour(s) de partage'} />
        <Stat icon="⬇️" label="Reçu" value={formatBytes(d.sharing.downloaded)} />
        <Stat icon="🪙" label="Points gagnés" value={fmt(d.points.earned)} sub={d.points.spent ? fmt(d.points.spent) + ' dépensés' : undefined} />
        <Stat icon="🎬" label="Regardé dans le lecteur" value={d.watching.totalSeconds ? hours(d.watching.totalSeconds) : '—'} sub={d.watching.seriesCount + ' série(s), ' + d.watching.otherCount + ' film(s) ou autre(s)'} />
      </div>

      {d.sharing.best && (
        <div className="panel" style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ margin: 0 }}>🏆 Ton meilleur jour de partage</h3>
          <div style={{ fontSize: 18 }}><strong style={{ textTransform: 'capitalize' }}>{dayLabel(d.sharing.best.day)}</strong> : <strong style={{ color: 'var(--gold-bright)' }}>{formatBytes(d.sharing.best.up)}</strong> envoyés.</div>
          <div style={{ width: '100%', height: 140 }}>
            <ResponsiveContainer>
              <BarChart data={d.sharing.daily.map((x) => ({ jour: Number(x.day.slice(8)), up: x.up }))}>
                <XAxis dataKey="jour" tick={{ fontSize: 11 }} interval={2} />
                <Tooltip formatter={(v: any) => formatBytes(Number(v))} labelFormatter={(l) => 'Jour ' + l} contentStyle={{ background: '#0d1224', border: '1px solid rgba(255,255,255,0.2)' }} />
                <Bar dataKey="up" fill="#e0b84a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>Le relevé se fait chaque nuit : le jour est celui qui précède le relevé. L'upload comprend le double upload.</span>
        </div>
      )}

      {(d.watching.series.length > 0 || d.watching.other.length > 0) && (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0 }}>📺 Ce que tu as regardé</h3>
          {d.watching.series.length > 0 && (
            <div className="cw-rail">
              {d.watching.series.map((s) => (
                <div key={s.title} className="cw-card">
                  <div className="cw-poster" style={{ cursor: 'default' }}>{s.cover ? <img src={s.cover} alt="" loading="lazy" /> : <span className="cw-noimg">📺</span>}<span className="cw-badge">{s.episodes} épisode{s.episodes > 1 ? 's' : ''}</span></div>
                  <div className="cw-info"><span className="cw-title" title={s.title}>{s.title}</span><small className="muted">{hours(s.seconds)}</small></div>
                </div>
              ))}
            </div>
          )}
          {d.watching.other.length > 0 && (
            <div className="muted" style={{ fontSize: 13 }}>Films et autres : {d.watching.other.map((o) => o.title + ' (' + hours(o.seconds) + ')').join(' · ')}</div>
          )}
          <span className="muted" style={{ fontSize: 12 }}>Seul ce qui est lu dans le lecteur Seeduction compte (jamais le contenu pour adultes). Le temps est approximatif.</span>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <div className="panel" style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
          <h3 style={{ margin: 0 }}>🪙 D'où viennent tes points</h3>
          {d.points.bySource.length === 0 ? <span className="muted">Aucun mouvement de points ce mois-ci.</span> : d.points.bySource.slice(0, 8).map((s) => (
            <div key={s.source} className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
              <span>{s.label}</span><span><strong style={{ color: 'var(--success)' }}>+{fmt(s.credit)}</strong>{s.debit > 0 && <span className="muted"> · −{fmt(s.debit)}</span>}</span>
            </div>
          ))}
        </div>
        <div className="panel" style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
          <h3 style={{ margin: 0 }}>🏅 Badges du mois ({d.badges.length})</h3>
          {d.badges.length === 0 ? <span className="muted">Aucun nouveau badge ce mois-ci. <Link to="/achievements">Voir les prochains</Link></span> : d.badges.map((b) => (
            <div key={b.code} className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}><span>{b.icon} {b.name}</span>{b.points > 0 && <span className="muted">+{b.points} pts</span>}</div>
          ))}
        </div>
        <div className="panel" style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
          <h3 style={{ margin: 0 }}>🤝 Ton activité</h3>
          <div className="row" style={{ justifyContent: 'space-between' }}><span>Torrents terminés</span><strong>{d.activity.completed}</strong></div>
          <div className="row" style={{ justifyContent: 'space-between' }}><span>Torrents approuvés</span><strong>{d.activity.uploadsApproved}</strong></div>
          <div className="row" style={{ justifyContent: 'space-between' }}><span>Commentaires</span><strong>{d.activity.comments}</strong></div>
          <div className="row" style={{ justifyContent: 'space-between' }}><span>Messages du forum</span><strong>{d.activity.forumPosts}</strong></div>
        </div>
      </div>

      <div className="panel" style={{ display: 'grid', gap: 14 }}>
        <h3 style={{ margin: 0 }}>👥 Et par rapport aux autres membres ?</h3>
        <Position title="Partage (upload du mois)" mine={d.sharing.uploaded} cmp={d.compare.upload} format={formatBytes} />
        <Position title="Points gagnés" mine={d.points.earned} cmp={d.compare.points} format={fmt} />
        <span className="muted" style={{ fontSize: 12 }}>La comparaison est anonyme : personne n'est nommé, et seuls les membres actifs ce mois-ci sont comptés. Ce n'est pas un classement, juste de quoi te situer.</span>
      </div>
    </div>
  );
}
