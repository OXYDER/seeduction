import { useRef } from 'react';
import '../games.css';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type CardArt = { kind: 'team'; abbrev: string } | { kind: 'emoji'; emoji: string; hue: number };
export interface CardDef { id: string; set: string; name: string; rarity: Rarity; art: CardArt }

export const RARITY_LABEL: Record<Rarity, string> = { common: 'Commune', rare: 'Rare', epic: 'Épique', legendary: 'Légendaire' };
const STARS: Record<Rarity, string> = { common: '★', rare: '★★', epic: '★★★', legendary: '★★★★' };

/**
 * Une carte à collectionner. `up` : face visible ; sinon le dos. `owned` faux : silhouette (carte pas encore obtenue). Les cartes rares et au-dessus ont un reflet
 * holographique qui suit la souris ; la légendaire brille en continu.
 */
export default function CollectCard({ card, up = true, owned = true, count, className = '', onClick, tilt = true }: { card?: CardDef; up?: boolean; owned?: boolean; count?: number; className?: string; onClick?: () => void; tilt?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current; if (!el || !tilt) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${Math.round(x * 100)}%`); el.style.setProperty('--my', `${Math.round(y * 100)}%`);
    el.style.setProperty('--rx', `${((0.5 - y) * 14).toFixed(1)}deg`); el.style.setProperty('--ry', `${((x - 0.5) * 16).toFixed(1)}deg`);
  };
  const leave = () => { const el = ref.current; if (!el) return; ['--mx', '--my', '--rx', '--ry'].forEach((v) => el.style.removeProperty(v)); };
  const rarity = card?.rarity ?? 'common';
  const hue = card?.art.kind === 'emoji' ? card.art.hue : 215;
  return (
    <div ref={ref} className={`cc ${up ? 'up' : ''} r-${rarity} ${owned ? '' : 'missing'} ${onClick ? 'click' : ''} ${className}`} style={{ ['--hue' as any]: hue }} onPointerMove={move} onPointerLeave={leave} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined} aria-label={card ? `${card.name} (${RARITY_LABEL[rarity]})${owned ? '' : ', pas encore obtenue'}` : 'Carte face cachée'}>
      <div className="cc-inner">
        <div className="cc-side cc-back"><span className="cc-back-logo">⚜️</span><span className="cc-back-t">SEEDUCTION</span></div>
        <div className="cc-side cc-front">
          {card && (
            <>
              <div className="cc-top"><span className="cc-stars">{STARS[rarity]}</span>{count && count > 1 ? <span className="cc-count">×{count}</span> : null}</div>
              <div className="cc-art">
                {!owned ? <span className="cc-unknown">?</span> : card.art.kind === 'team'
                  ? <span className="cc-plate"><img src={`/api/sports/logo/${card.art.abbrev}`} alt="" loading="lazy" draggable={false} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /></span>
                  : <span className="cc-emoji">{card.art.emoji}</span>}
              </div>
              <div className="cc-name">{owned ? card.name : '???'}</div>
              <div className="cc-rar">{RARITY_LABEL[rarity]}</div>
              {owned && rarity !== 'common' && <div className="cc-foil" aria-hidden="true" />}
              {owned && rarity === 'legendary' && <div className="cc-spark" aria-hidden="true"><i /><i /><i /><i /><i /></div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
