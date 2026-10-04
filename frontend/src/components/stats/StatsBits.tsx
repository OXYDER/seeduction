import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import UserLink from '../UserLink';

export const COLORS = ['#e0b84a', '#4caf50', '#7aa0ff', '#c084fc', '#f472b6', '#2dd4bf', '#ef6c4a', '#9fb8a0'];
export const tooltipStyle = { background: '#0c1912', border: '1px solid #1f3d2a', color: '#e9f2ea' };
export const shortDate = (d: string) => d.slice(5).replace('-', '/');

const MEDALS = ['🥇', '🥈', '🥉'];

/** Une case chiffrée, avec (facultatif) l'évolution par rapport à la période précédente. */
export function Tile({ label, value, hint, trend, tone }: { label: string; value: ReactNode; hint?: ReactNode; trend?: { cur: number; prev: number; pct: number | null }; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className={`panel st-tile${tone ? ` ${tone}` : ''}`}>
      <div className="muted st-tile-label">{label}</div>
      <div className="st-tile-value">{value}</div>
      {trend && <Trend {...trend} />}
      {hint && <div className="muted st-tile-hint">{hint}</div>}
    </div>
  );
}

/** « ▲ 12 % » (vert), « ▼ 8 % » (rouge) par rapport à la période d'avant. */
export function Trend({ cur, prev, pct }: { cur: number; prev: number; pct: number | null }) {
  if (pct === null) return <div className="muted st-trend">{prev === 0 && cur > 0 ? 'Nouveau' : '—'} <span>(avant : {prev})</span></div>;
  const up = pct > 0, flat = pct === 0;
  return <div className={`st-trend ${flat ? 'flat' : up ? 'up' : 'down'}`}>{flat ? '＝ stable' : `${up ? '▲' : '▼'} ${Math.abs(pct)} %`} <span className="muted">(avant : {prev})</span></div>;
}

export interface BoardRow { key: string; who: ReactNode; value: number; text: string; sub?: ReactNode }

/** Un classement : rang, nom, valeur, et une barre proportionnelle derrière chaque ligne. */
export function Board({ title, hint, icon, rows, empty = 'Personne pour le moment.', medals = true }: { title: string; hint?: string; icon?: string; rows: BoardRow[]; empty?: string; /** Faux pour les classements « à éviter » (ratios bas, hit & run...) : pas de médailles. */ medals?: boolean }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0.0001);
  return (
    <div className="panel st-board">
      <h3>{icon && <span>{icon} </span>}{title}</h3>
      {hint && <p className="muted st-board-hint">{hint}</p>}
      {rows.length === 0 && <p className="muted">{empty}</p>}
      <ol>
        {rows.map((r, i) => (
          <li key={r.key}>
            <i className="st-bar" style={{ width: `${Math.max(3, (Math.abs(r.value) / max) * 100)}%` }} />
            <span className="st-rank">{medals ? MEDALS[i] ?? i + 1 : i + 1}</span>
            <span className="st-who">{r.who}{r.sub && <small className="muted"> {r.sub}</small>}</span>
            <span className="st-val">{r.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const memberRows = (board: any[] | undefined, text: (v: number, x: any) => string, sub?: (x: any) => ReactNode): BoardRow[] =>
  (board ?? []).map((x) => ({ key: x.user.id, who: <UserLink user={x.user} />, value: x.value, text: text(x.value, x), sub: sub?.(x) }));

export const torrentRows = (board: any[] | undefined, text: (v: number, x: any) => string, sub?: (x: any) => ReactNode): BoardRow[] =>
  (board ?? []).map((x) => ({ key: x.torrent.id, who: <Link to={`/torrents/${x.torrent.id}`} className="st-torrent" title={x.torrent.name}>{x.torrent.name}</Link>, value: x.value, text: text(x.value, x), sub: sub?.(x) }));

export function ChartCard({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <div className="panel">
      <h3>{title}</h3>
      {hint && <p className="muted" style={{ marginTop: 0 }}>{hint}</p>}
      {children}
    </div>
  );
}

export function Bars({ data, x = 'name', y = 'count', color = '#e0b84a', label = 'Nombre', height = 210, unit, colors }: { data: any[]; x?: string; y?: string; color?: string; label?: string; height?: number; unit?: string; colors?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid stroke="#1f3d2a" vertical={false} />
        <XAxis dataKey={x} stroke="#8fa896" fontSize={11} interval="preserveStartEnd" />
        <YAxis stroke="#8fa896" fontSize={11} allowDecimals={false} unit={unit} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
        <Bar dataKey={y} name={label} fill={color}>{colors && data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, height = 220 }: { data: { name: string; count: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="name" innerRadius={42} outerRadius={80} paddingAngle={2} label={(e: any) => e.name}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="st-section">
      <h2>{title}</h2>
      {hint && <p className="muted" style={{ marginTop: -6 }}>{hint}</p>}
      {children}
    </section>
  );
}

export const gridStyle = (min = 320) => ({ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` });
