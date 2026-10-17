import { useMemo } from 'react';

/** Pièce d'or. */
function Coin({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <defs><radialGradient id="csg" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#fff6b0" /><stop offset="0.5" stopColor="#f5c02a" /><stop offset="1" stopColor="#a86a00" /></radialGradient></defs>
      <circle cx="16" cy="16" r="14.5" fill="url(#csg)" stroke="#8a5600" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="#fff0a0" strokeWidth="1.2" opacity=".8" />
      <path d="M16 9l2 4.6 5 .5-3.8 3.3 1.2 4.9L16 19.7l-4.4 2.6 1.2-4.9L9 14.1l5-.5z" fill="#fff0a0" opacity=".9" />
    </svg>
  );
}

const rand = (n: number) => Math.floor(Math.random() * n);

/** Pluie de pièces d'or (et, si fournis, d'objets du thème) qui tombent en tournant. Utilise les styles `.slot-rain` du site. */
export default function CoinShower({ coins, items }: { coins: number; items?: string[] }) {
  const drops = useMemo(() => Array.from({ length: coins }, (_, i) => ({
    k: i, x: rand(100), d: 1.5 + Math.random() * 1.7, w: Math.random() * 0.9, s: 18 + rand(20), flip: 0.5 + Math.random() * 0.7, emoji: items && i % 3 === 0 ? items[i % items.length] : null,
  })), [coins, items]);
  return (
    <div className="slot-rain" aria-hidden="true">
      {drops.map((d) => (
        <span key={d.k} style={{ left: `${d.x}%`, animationDuration: `${d.d}s`, animationDelay: `${d.w}s`, ['--flip' as any]: `${d.flip}s`, fontSize: d.s }}>
          {d.emoji ?? <Coin size={d.s} />}
        </span>
      ))}
    </div>
  );
}
