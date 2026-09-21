import { formatBytes } from './format';

interface TorrentFile {
  path: string;
  size: number;
}

export interface TorrentSummary {
  fileCount: number;
  totalSize: number;
  totalSizeText: string;
  /** Extension (en majuscules) qui pèse le plus lourd — le format principal du contenu. */
  mainFormat: string;
  /** Liste des fichiers prête pour la description (une ligne "nom (taille)" par fichier, tronquée). */
  filesText: string;
  /** Langues des sous-titres trouvés dans les fichiers, ex : "Français, Anglais". */
  subtitlesText: string;
}

const JUNK = /(^|\/)(thumbs\.db|\.ds_store|desktop\.ini)$/i;
const SUB_EXT = new Set(['SRT', 'ASS', 'SSA', 'SUB', 'IDX', 'VTT', 'SUP']);
const MAX_LISTED = 40;

const SUB_LANGS: [RegExp, string][] = [
  [/(^|[^a-z])(fr|fre|fra|french|francais|français)([^a-z]|$)/i, 'Français'],
  [/(^|[^a-z])(en|eng|english|anglais)([^a-z]|$)/i, 'Anglais'],
  [/(^|[^a-z])(es|spa|spanish|espanol)([^a-z]|$)/i, 'Espagnol'],
  [/(^|[^a-z])(de|ger|deu|german)([^a-z]|$)/i, 'Allemand'],
  [/(^|[^a-z])(it|ita|italian)([^a-z]|$)/i, 'Italien'],
  [/(^|[^a-z])(pt|por|portuguese)([^a-z]|$)/i, 'Portugais'],
  [/(^|[^a-z])(ja|jpn|japanese)([^a-z]|$)/i, 'Japonais'],
  [/(^|[^a-z])(nl|dut|dutch)([^a-z]|$)/i, 'Néerlandais'],
];

function extensionOf(path: string): string {
  const base = path.split('/').pop() ?? path;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toUpperCase() : '';
}

/**
 * Tire du contenu d'un .torrent (liste de fichiers + tailles) tout ce qu'on
 * peut en déduire sans télécharger quoi que ce soit : taille totale, format
 * principal, sous-titres présents, et la liste des fichiers pour la description.
 */
export function summarizeTorrent(files: TorrentFile[]): TorrentSummary {
  const visible = files.filter((f) => !JUNK.test(f.path));
  const totalSize = visible.reduce((sum, f) => sum + (Number(f.size) || 0), 0);

  const sizeByExt = new Map<string, number>();
  for (const f of visible) {
    const ext = extensionOf(f.path);
    if (ext && !SUB_EXT.has(ext) && ext !== 'NFO' && ext !== 'TXT') sizeByExt.set(ext, (sizeByExt.get(ext) ?? 0) + (Number(f.size) || 0));
  }
  const mainFormat = [...sizeByExt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  const subFiles = visible.filter((f) => SUB_EXT.has(extensionOf(f.path)));
  const langs = new Set<string>();
  for (const f of subFiles) {
    for (const [re, label] of SUB_LANGS) if (re.test(f.path)) langs.add(label);
  }
  const subtitlesText = langs.size > 0
    ? [...langs].join(', ')
    : subFiles.length > 0 ? `${subFiles.length} fichier${subFiles.length > 1 ? 's' : ''} de sous-titres` : '';

  const sorted = [...visible].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  const lines = sorted.slice(0, MAX_LISTED).map((f) => `${f.path} (${formatBytes(f.size)})`);
  if (sorted.length > MAX_LISTED) lines.push(`… et ${sorted.length - MAX_LISTED} autres fichiers`);

  return {
    fileCount: visible.length,
    totalSize,
    totalSizeText: formatBytes(totalSize),
    mainFormat,
    filesText: lines.join('\n'),
    subtitlesText,
  };
}
