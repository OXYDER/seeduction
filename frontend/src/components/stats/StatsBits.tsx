import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COLORS } from './Donut';
import { tooltipStyle } from './StatsParts';

export { Donut, COLORS } from './Donut';
export * from './StatsParts';

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
