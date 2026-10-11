// Description d'un pack de plusieurs films : un bloc par film, dans l'ordre chronologique de sortie, puis les informations du torrent (une seule fois).

export interface PackFilm {
  titre: string;
  titre_original?: string;
  année?: string;
  /** Date de sortie « AAAA-MM-JJ » (sert à l'ordre) */
  releaseDate?: string | null;
  genre?: string;
  durée?: string;
  note?: string;
  réalisateur?: string;
  acteurs?: string;
  studio?: string;
  description?: string;
  affiche?: string;
}

const TITLE = (t: string) => `[size=6][b][color=#e0b84a]${t}[/color][/b][/size]`;
const H = (name: string) => `[b][color=#e0b84a]${name}[/color][/b]`;
const L = (label: string, value?: string) => (value && value.trim() ? `[color=#a89253]${label} :[/color] ${value.trim()}` : '');
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 2012-05-04 » → « 4 mai 2012 » ; « 2012 » reste « 2012 ». */
export function frenchDate(d?: string | null): string {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(String(d ?? '').trim());
  if (!m) return '';
  if (!m[2]) return m[1];
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return m[1];
  return m[3] ? `${Number(m[3])}${m[3] === '01' ? 'er' : ''} ${month} ${m[1]}` : `${month} ${m[1]}`;
}

/** Ordre chronologique de sortie ; les films sans date passent après, par année puis par titre. */
export function sortChronologically<T extends { titre: string; releaseDate?: string | null; année?: string }>(films: T[]): T[] {
  const key = (f: T) => (f.releaseDate && /^\d{4}/.test(f.releaseDate) ? f.releaseDate : f.année && /^\d{4}$/.test(f.année) ? `${f.année}-99-99` : '9999-99-99');
  return [...films].sort((a, b) => key(a).localeCompare(key(b)) || a.titre.localeCompare(b.titre, 'fr'));
}

/** Les champs du torrent (taille, langue, vidéo, audio, sous-titres, fichiers, notes...) : une seule fois, en fin de description. */
const TORRENT_LINES: [string, string][] = [
  ['Catégorie', 'catégorie'], ['Taille', 'taille'], ['Fichiers', 'nb_fichiers'], ['Langue', 'langue'],
];
const SPEC_LINES: [string, string][] = [['Vidéo', 'vidéo'], ['Audio', 'audio'], ['Source', 'source'], ['Format', 'format'], ['Sous-titres', 'sous_titres']];

export function buildPackBBCode(input: PackFilm[], torrent: Record<string, string> = {}): string {
  const films = sortChronologically(input.filter((f) => f && f.titre));
  const label = (f: PackFilm) => `${f.titre}${f.année ? ` (${f.année})` : ''}`;
  const out: string[] = [TITLE(`Pack de ${films.length} film${films.length > 1 ? 's' : ''}`), ''];

  out.push(H('Au programme (par ordre de sortie)'), '[block]', ...films.map((f, i) => `${i + 1}. ${label(f)}`), '[/block]', '');

  films.forEach((f, i) => {
    out.push(H(`${i + 1}. ${label(f)}`));
    if (f.affiche) out.push(`[center][img]${f.affiche}[/img][/center]`);
    const info = [
      L('Titre original', f.titre_original), L('Sortie', frenchDate(f.releaseDate) || f.année), L('Genre', f.genre), L('Durée', f.durée), L('Note', f.note),
      L('Réalisation', f.réalisateur), L('Acteurs', f.acteurs), L('Studio', f.studio),
    ].filter(Boolean);
    if (info.length) out.push('[block]', ...info, '[/block]');
    if (f.description?.trim()) out.push(H('Synopsis'), f.description.trim());
    out.push('');
  });

  const t = (k: string) => (torrent[k] ?? '').trim();
  const infos = TORRENT_LINES.map(([l, k]) => L(l, t(k))).filter(Boolean);
  const specs = SPEC_LINES.map(([l, k]) => L(l, t(k))).filter(Boolean);
  if (infos.length) out.push(H('Le torrent'), '[block]', ...infos, '[/block]', '');
  if (specs.length) out.push(H('Spécifications'), '[block]', ...specs, '[/block]', '');
  if (t('fichiers')) out.push(H('Contenu'), t('fichiers'), '');
  if (t('notes')) out.push(H('Notes'), t('notes'), '');
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}
