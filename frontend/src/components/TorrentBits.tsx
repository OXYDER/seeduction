import { healthOf } from '../lib/health';

/** Pastille de santé (rouge → vert) d'après les seeders. */
export function HealthDot({ seeders }: { seeders: number }) {
  const h = healthOf(seeders);
  return (
    <span
      title={`${h.label} (${seeders} seeder${seeders > 1 ? 's' : ''})`}
      style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: h.color, boxShadow: `0 0 6px ${h.color}88`, marginRight: 6, flexShrink: 0 }}
    />
  );
}

/** Étoile « à télécharger plus tard » (pleine si le torrent est dans la liste). */
export function FavoriteStar({ active, onToggle, size = 18 }: { active: boolean; onToggle: () => void; size?: number }) {
  return (
    <button
      type="button"
      className="fav-star"
      title={active ? 'Retirer de ma liste « à télécharger plus tard »' : 'Mettre de côté pour plus tard'}
      aria-pressed={active}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
      style={{ fontSize: size, color: active ? 'var(--gold-bright)' : 'var(--text-dim)' }}
    >
      {active ? '★' : '☆'}
    </button>
  );
}
