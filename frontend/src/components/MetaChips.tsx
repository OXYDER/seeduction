/** Infos d'une release (année, origine, langue, source, codec, audio) en pastilles de couleur : on repère d'un coup d'œil chaque information. */
export default function MetaChips({ t, className = '' }: { t: any; className?: string }) {
  const items: [string, string | number | null | undefined][] = [
    ['yr', t.year],
    ['org', t.origin],
    ['lang', t.language],
    ['src', [t.source, t.hdr ? 'HDR' : ''].filter(Boolean).join(' ')],
    ['cod', t.codec],
    ['aud', t.audio],
  ];
  const shown = items.filter(([, v]) => v);
  if (shown.length === 0) return null;
  return <div className={`vr-chips ${className}`}>{shown.map(([cls, v]) => <span key={cls} className={`vr-chip ${cls}`}>{v}</span>)}</div>;
}
