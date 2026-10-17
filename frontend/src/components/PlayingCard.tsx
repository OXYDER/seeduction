import { labelOf } from '../lib/cards';

export type Suit = 'spade' | 'heart' | 'diamond' | 'club';

const PATHS: Record<Suit, string> = {
  heart: 'M12 21.5s-8.5-5.4-8.5-11.6A4.7 4.7 0 0 1 12 7.2a4.7 4.7 0 0 1 8.5 2.7c0 6.2-8.5 11.6-8.5 11.6z',
  diamond: 'M12 1.5l7.2 10.5L12 22.5 4.8 12z',
  spade: 'M12 1.8c4.3 4.8 8.4 7.4 8.4 11.3a4.4 4.4 0 0 1-7.3 3.3c.1 2.3 1 4 2.6 5.6H8.3c1.6-1.6 2.5-3.3 2.6-5.6a4.4 4.4 0 0 1-7.3-3.3C3.6 9.2 7.7 6.6 12 1.8z',
  club: 'M12 1.8a4.4 4.4 0 0 1 4 6.2 4.5 4.5 0 1 1-3 8.3c.1 2.2.8 3.9 2.4 5.5H8.6c1.6-1.6 2.3-3.3 2.4-5.5A4.5 4.5 0 1 1 8 8a4.4 4.4 0 0 1 4-6.2z',
};
const RED = '#d3202a', BLACK = '#16161c';
const colorOf = (s: Suit) => (s === 'heart' || s === 'diamond' ? RED : BLACK);

/** Emplacements (en fraction de la zone centrale) des symboles d'une carte de 2 à 10, comme sur un vrai jeu. */
const PIPS: Record<number, [number, number][]> = {
  2: [[0.5, 0.14], [0.5, 0.86]],
  3: [[0.5, 0.14], [0.5, 0.5], [0.5, 0.86]],
  4: [[0.28, 0.14], [0.72, 0.14], [0.28, 0.86], [0.72, 0.86]],
  5: [[0.28, 0.14], [0.72, 0.14], [0.5, 0.5], [0.28, 0.86], [0.72, 0.86]],
  6: [[0.28, 0.14], [0.72, 0.14], [0.28, 0.5], [0.72, 0.5], [0.28, 0.86], [0.72, 0.86]],
  7: [[0.28, 0.14], [0.72, 0.14], [0.5, 0.32], [0.28, 0.5], [0.72, 0.5], [0.28, 0.86], [0.72, 0.86]],
  8: [[0.28, 0.14], [0.72, 0.14], [0.5, 0.32], [0.28, 0.5], [0.72, 0.5], [0.5, 0.68], [0.28, 0.86], [0.72, 0.86]],
  9: [[0.28, 0.12], [0.72, 0.12], [0.28, 0.37], [0.72, 0.37], [0.5, 0.5], [0.28, 0.63], [0.72, 0.63], [0.28, 0.88], [0.72, 0.88]],
  10: [[0.28, 0.1], [0.72, 0.1], [0.5, 0.24], [0.28, 0.37], [0.72, 0.37], [0.28, 0.63], [0.72, 0.63], [0.5, 0.76], [0.28, 0.9], [0.72, 0.9]],
};

function Pip({ suit, x, y, size, flip }: { suit: Suit; x: number; y: number; size: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x - size / 2} ${y - size / 2}) ${flip ? `rotate(180 ${size / 2} ${size / 2})` : ''}`}>
      <svg width={size} height={size} viewBox="0 0 24 24"><path d={PATHS[suit]} fill={colorOf(suit)} /></svg>
    </g>
  );
}

/** Face d'une carte : coins, symboles disposés comme un vrai jeu, figures encadrées. */
function Face({ rank, suit }: { rank: number; suit: Suit }) {
  const W = 200, H = 280, c = colorOf(suit), label = labelOf(rank);
  const zone = { x: 44, y: 46, w: 112, h: 188 };
  const face = rank >= 11 && rank <= 13;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pcard-svg" aria-label={`${label} de ${suit}`}>
      <defs>
        <linearGradient id="pc-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#ece6d6" /></linearGradient>
        <linearGradient id="pc-face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff3c4" /><stop offset="1" stopColor="#f0d089" /></linearGradient>
      </defs>
      <rect x="2" y="2" width={W - 4} height={H - 4} rx="16" fill="url(#pc-bg)" stroke="#bdb59f" strokeWidth="2" />
      <rect x="10" y="10" width={W - 20} height={H - 20} rx="10" fill="none" stroke={c} strokeOpacity=".12" strokeWidth="1.5" />
      {[false, true].map((flip) => (
        <g key={String(flip)} transform={flip ? `rotate(180 ${W / 2} ${H / 2})` : undefined}>
          <text x="22" y="40" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize={label.length > 1 ? 30 : 36} fill={c}>{label}</text>
          <Pip suit={suit} x={22} y={62} size={20} />
        </g>
      ))}
      {face ? (
        <g>
          <rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx="8" fill="url(#pc-face)" stroke={c} strokeOpacity=".5" strokeWidth="2" />
          <rect x={zone.x + 6} y={zone.y + 6} width={zone.w - 12} height={zone.h - 12} rx="5" fill="none" stroke={c} strokeOpacity=".3" strokeWidth="1" />
          <text x={W / 2} y={H / 2 + 24} textAnchor="middle" fontFamily="Georgia, serif" fontWeight="700" fontSize="92" fill={c} opacity=".92">{label}</text>
          <Pip suit={suit} x={zone.x + 24} y={zone.y + 24} size={24} />
          <Pip suit={suit} x={zone.x + zone.w - 24} y={zone.y + zone.h - 24} size={24} flip />
        </g>
      ) : rank === 14 ? (
        <Pip suit={suit} x={W / 2} y={H / 2} size={104} />
      ) : (
        (PIPS[rank] ?? []).map(([fx, fy], i) => <Pip key={i} suit={suit} x={zone.x + fx * zone.w} y={zone.y + fy * zone.h} size={rank >= 8 ? 30 : 34} flip={fy > 0.5} />)
      )}
    </svg>
  );
}

function Back() {
  return (
    <svg viewBox="0 0 200 280" className="pcard-svg" aria-label="Carte face cachée">
      <defs>
        <linearGradient id="pc-back" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2b1f6b" /><stop offset="1" stopColor="#120a33" /></linearGradient>
        <pattern id="pc-lat" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0h22M0 0v22" stroke="#e7c35a" strokeOpacity=".35" strokeWidth="1.2" /></pattern>
      </defs>
      <rect x="2" y="2" width="196" height="276" rx="16" fill="#f4efe0" stroke="#bdb59f" strokeWidth="2" />
      <rect x="12" y="12" width="176" height="256" rx="10" fill="url(#pc-back)" />
      <rect x="12" y="12" width="176" height="256" rx="10" fill="url(#pc-lat)" />
      <rect x="20" y="20" width="160" height="240" rx="7" fill="none" stroke="#e7c35a" strokeOpacity=".8" strokeWidth="2" />
      <circle cx="100" cy="140" r="46" fill="#1a1050" stroke="#e7c35a" strokeWidth="3" />
      <text x="100" y="161" textAnchor="middle" fontSize="62" fill="#f6d36a">⚜</text>
    </svg>
  );
}

/**
 * Une carte à jouer qui se retourne en 3D. `up` : face visible ; sinon le dos. `state` colore la carte après une réponse (bonne : halo vert, mauvaise : rouge).
 */
export default function PlayingCard({ rank, suit, up, state, className = '' }: { rank?: number; suit?: Suit; up: boolean; state?: 'win' | 'lose' | 'idle'; className?: string }) {
  return (
    <div className={`pcard ${up ? 'up' : ''} ${state && state !== 'idle' ? state : ''} ${className}`}>
      <div className="pcard-inner">
        <div className="pcard-side pcard-back"><Back /></div>
        <div className="pcard-side pcard-front">{rank && suit ? <Face rank={rank} suit={suit} /> : <Back />}</div>
      </div>
    </div>
  );
}
