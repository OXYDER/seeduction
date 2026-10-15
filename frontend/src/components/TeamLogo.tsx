/** Logo d'une équipe de la LNH. Ils sont plus larges que hauts (3 : 2) : on les met dans une plaque blanche à leur format pour qu'ils prennent toute la place. */
export default function TeamLogo({ abbrev, name, size = 26 }: { abbrev: string; name?: string; size?: number }) {
  return (
    <span className="mtl-logo" style={{ width: Math.round(size * 1.5) + 6, height: size + 4 }} title={name ?? abbrev}>
      <img src={`/api/sports/logo/${abbrev}`} alt={name ?? abbrev} width={Math.round(size * 1.5)} height={size} loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
    </span>
  );
}
