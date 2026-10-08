import { episodeCode, seasonEpisodeOf, shortDateFr } from '../lib/frText';

/** Ordre d'affichage : la date d'ajout d'abord, la langue juste après, puis le reste, et le codec audio en dernier. */
const ORDER = ['dt', 'lang', 'ep', 'ep2', 'yr', 'org', 'res', 'src', 'cod', 'fmt', 'aud'] as const;
/** Quand la place manque (cartes, rangées), on retire d'abord les moins utiles pour se retrouver : l'ordre ci-dessus est conservé pour ce qui reste. */
const DROP_FIRST = ['org', 'fmt', 'yr', 'cod', 'aud', 'src', 'res', 'ep2', 'ep', 'dt', 'lang'] as const;

/**
 * Infos d'une release en pastilles de couleur : date d'ajout, langue, épisode, année, résolution, source, codec vidéo, format, codec audio.
 * `limit` : nombre maximum de pastilles (cartes, rangées étroites) ; les autres sont résumées par « +N » (leur détail est dans l'infobulle).
 */
export default function MetaChips({ t, className = '', limit, inline, explicitEpisode }: { t: any; className?: string; limit?: number; /** Sans conteneur : les pastilles s'insèrent dans une ligne existante (lignes groupées). */ inline?: boolean; /** « Saison 17 » et « Épisode 3 » en toutes lettres (vedette de l'accueil) au lieu de « S17E03 ». */ explicitEpisode?: boolean }) {
  const se = seasonEpisodeOf(t);
  const seasonNum = se.season && /^\d+$/.test(se.season);
  const epLabel = explicitEpisode && seasonNum ? `Saison ${Number(se.season)}` : episodeCode(se.season, se.episode);
  const ep2Label = explicitEpisode && seasonNum && se.episode ? (/^\d+$/.test(se.episode) ? `Épisode ${Number(se.episode)}` : se.episode) : null;
  const all: Record<(typeof ORDER)[number], [string | number | null | undefined, string]> = {
    dt: [shortDateFr(t.createdAt), "Date d'ajout"],
    lang: [t.language, 'Langue'],
    ep: [epLabel ?? (se.episode && !/^\d+$/.test(se.episode) ? se.episode : null), explicitEpisode ? 'Saison' : 'Saison / épisode'],
    ep2: [ep2Label, 'Épisode'],
    yr: [t.year, 'Année'],
    org: [t.origin, 'Origine'],
    res: [t.resolution, 'Résolution'],
    src: [[t.source, t.hdr ? 'HDR' : ''].filter(Boolean).join(' '), 'Source'],
    cod: [t.codec, 'Codec vidéo'],
    fmt: [t.containerFormat, 'Format du fichier'],
    aud: [t.audio, 'Codec audio'],
  };
  const present = ORDER.filter((k) => all[k][0]);
  if (present.length === 0) return null;
  let shown = [...present];
  const hidden: (typeof ORDER)[number][] = [];
  if (limit && shown.length > limit) {
    for (const k of DROP_FIRST) {
      if (shown.length <= limit) break;
      if (shown.includes(k)) { shown = shown.filter((x) => x !== k); hidden.push(k); }
    }
  }
  const content = (
    <>
      {shown.map((k) => <span key={k} className={`vr-chip ${k}`} title={all[k][1]}>{all[k][0]}</span>)}
      {hidden.length > 0 && <span className="vr-chip more" title={ORDER.filter((k) => hidden.includes(k)).map((k) => `${all[k][1]} : ${all[k][0]}`).join('\n')}>+{hidden.length}</span>}
    </>
  );
  return inline ? content : <div className={`vr-chips ${className}`}>{content}</div>;
}
