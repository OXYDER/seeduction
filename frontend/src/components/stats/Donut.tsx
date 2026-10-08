import { useId, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from 'recharts';

export const COLORS = ['#e0b84a', '#4caf50', '#7aa0ff', '#c084fc', '#f472b6', '#2dd4bf', '#ef6c4a', '#9fb8a0'];

/** Éclaircit (amount > 0) ou assombrit (amount < 0) une couleur #rrggbb. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const fmtNum = (n: number) => n.toLocaleString('fr-CA');
const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

/** Infobulle d'un anneau : pastille de couleur, nom, valeur et pourcentage. */
function DonutTip({ active, payload, total }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const color = p.payload?.__color ?? '#e0b84a';
  return (
    <div className="chart-tip">
      <div className="chart-tip-name"><span className="chart-tip-dot" style={{ background: color, color }} />{p.name}</div>
      <div className="chart-tip-value">{fmtNum(Number(p.value))} <span>· {pct(Number(p.value), total)} %</span></div>
    </div>
  );
}

/** Part survolée : elle grossit sur place (sans se déplacer : on ne voit jamais la couronne du dessous) et prend un liseré clair. */
function ActiveSlice(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return <Sector cx={cx} cy={cy} innerRadius={innerRadius - 2} outerRadius={outerRadius + 6} startAngle={startAngle} endAngle={endAngle} fill={fill} stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} />;
}

/**
 * Anneau en relief (épaisseur, dégradés, ombre) : la part survolée sort du cercle, son détail apparaît au centre et dans une infobulle ;
 * la légende à côté liste TOUTES les parts (nom, valeur, pourcentage) : plus d'étiquettes coupées ou qui se chevauchent.
 */
export function Donut({ data, height = 230 }: { data: { name: string; count: number }[]; height?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [active, setActive] = useState<number | null>(null);
  // Mémorisé : un nouveau tableau à chaque survol ferait redessiner (et animer) tout l'anneau.
  const slices = useMemo(() => data.filter((d) => Number(d.count) > 0).map((d, i) => ({ ...d, count: Number(d.count), __color: COLORS[i % COLORS.length] })), [data]);
  const total = slices.reduce((n, d) => n + d.count, 0);
  if (slices.length === 0) return <p className="muted">Aucune donnée.</p>;

  return (
    <div className="donut-wrap">
      <div className="donut-chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 8, right: 8, bottom: 14, left: 8 }}>
            <defs>
              {slices.map((s, i) => (
                <linearGradient key={i} id={`${uid}g${i}`} x1="0" y1="0" x2="0.4" y2="1">
                  <stop offset="0%" stopColor={shade(s.__color, 0.38)} />
                  <stop offset="50%" stopColor={s.__color} />
                  <stop offset="100%" stopColor={shade(s.__color, -0.25)} />
                </linearGradient>
              ))}
            </defs>
            {/* épaisseur : la même couronne, plus sombre, décalée vers le bas */}
            <Pie data={slices} dataKey="count" nameKey="name" cx="50%" cy="54%" innerRadius="52%" outerRadius="88%" paddingAngle={1.5} stroke="none" isAnimationActive={false} legendType="none" tooltipType="none">
              {slices.map((s, i) => <Cell key={i} fill={shade(s.__color, -0.55)} />)}
            </Pie>
            <Pie
              data={slices} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius="52%" outerRadius="88%" paddingAngle={1.5} stroke="rgba(0,0,0,0.25)" strokeWidth={0.5}
              activeIndex={active ?? undefined} activeShape={ActiveSlice}
              onMouseEnter={(_: any, i: number) => setActive(i)} onMouseLeave={() => setActive(null)}
              isAnimationActive={false}
            >
              {slices.map((_, i) => <Cell key={i} fill={`url(#${uid}g${i})`} style={{ cursor: 'pointer', outline: 'none' }} />)}
            </Pie>
            <Tooltip content={<DonutTip total={total} />} wrapperStyle={{ outline: 'none', zIndex: 30 }} cursor={false} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center" aria-hidden="true">
          <strong>{fmtNum(total)}</strong>
          <span className="donut-center-sub">au total</span>
        </div>
      </div>
      <ul className="donut-legend">
        {slices.map((s, i) => (
          <li key={s.name} className={active === i ? 'on' : active !== null ? 'dim' : ''} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
            <i style={{ background: `linear-gradient(135deg, ${shade(s.__color, 0.3)}, ${shade(s.__color, -0.2)})` }} />
            <span className="donut-legend-name" title={s.name}>{s.name}</span>
            <span className="donut-legend-count">{fmtNum(s.count)}</span>
            <span className="donut-legend-pct">{pct(s.count, total)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
