import { episodeCode, shortDateFr } from '../lib/frText';

/**
 * Infos d'une release en pastilles de couleur sous son titre, toujours dans le même ordre :
 * la date d'ajout d'abord, la langue juste après, puis le reste (épisode, année, résolution, source, codec vidéo, format) et le codec audio en dernier.
 */
export default function MetaChips({ t, className = '' }: { t: any; className?: string }) {
  const items: [string, string | number | null | undefined, string][] = [
    ['dt', shortDateFr(t.createdAt), "Date d'ajout"],
    ['lang', t.language, 'Langue'],
    ['ep', episodeCode(t.season, t.episode) ?? (t.episode && !/^\d+$/.test(t.episode) ? t.episode : null), 'Saison / épisode'],
    ['yr', t.year, 'Année'],
    ['org', t.origin, 'Origine'],
    ['res', t.resolution, 'Résolution'],
    ['src', [t.source, t.hdr ? 'HDR' : ''].filter(Boolean).join(' '), 'Source'],
    ['cod', t.codec, 'Codec vidéo'],
    ['fmt', t.containerFormat, 'Format du fichier'],
    ['aud', t.audio, 'Codec audio'],
  ];
  const shown = items.filter(([, v]) => v);
  if (shown.length === 0) return null;
  return <div className={`vr-chips ${className}`}>{shown.map(([cls, v, label]) => <span key={cls} className={`vr-chip ${cls}`} title={label}>{v}</span>)}</div>;
}
