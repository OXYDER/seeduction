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
const MAX_LISTED = 300;

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

interface FolderNode {
  folders: Map<string, FolderNode>;
  files: { name: string; size: number }[];
}

const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
// Les crochets casseraient la syntaxe [spoiler=Titre].
const safeName = (s: string) => s.replace(/[[\]]/g, (c) => (c === '[' ? '(' : ')'));

function countFiles(node: FolderNode): { count: number; size: number } {
  let count = node.files.length;
  let size = node.files.reduce((sum, f) => sum + f.size, 0);
  for (const child of node.folders.values()) {
    const sub = countFiles(child);
    count += sub.count;
    size += sub.size;
  }
  return { count, size };
}

function renderFolder(node: FolderNode, budget: { left: number }): string[] {
  const lines: string[] = [];
  for (const name of [...node.folders.keys()].sort(naturalCompare)) {
    const child = node.folders.get(name)!;
    const { count, size } = countFiles(child);
    lines.push(`[spoiler=📁 ${safeName(name)} — ${count} fichier${count > 1 ? 's' : ''}, ${formatBytes(size)}]`);
    lines.push(...renderFolder(child, budget));
    lines.push('[/spoiler]');
  }
  for (const f of [...node.files].sort((a, b) => naturalCompare(a.name, b.name))) {
    if (budget.left <= 0) break;
    budget.left--;
    lines.push(`${f.name} (${formatBytes(f.size)})`);
  }
  return lines;
}

/**
 * Liste des fichiers pour la description : les dossiers deviennent des blocs
 * repliables ([spoiler=…], un "+" pour les ouvrir) contenant leurs fichiers.
 * Un torrent qui n'a qu'un dossier racine l'affiche directement ouvert (déjà
 * nommé par le titre de la présentation).
 */
function buildFilesText(files: TorrentFile[]): string {
  const root: FolderNode = { folders: new Map(), files: [] };
  for (const f of files) {
    const parts = f.path.split('/').filter(Boolean);
    let node = root;
    for (const dir of parts.slice(0, -1)) {
      if (!node.folders.has(dir)) node.folders.set(dir, { folders: new Map(), files: [] });
      node = node.folders.get(dir)!;
    }
    node.files.push({ name: parts[parts.length - 1] ?? f.path, size: Number(f.size) || 0 });
  }
  let top = root;
  while (top.files.length === 0 && top.folders.size === 1) top = [...top.folders.values()][0];

  const budget = { left: MAX_LISTED };
  const lines = renderFolder(top, budget);
  const total = files.length;
  const shown = MAX_LISTED - budget.left;
  if (total > shown) lines.push(`… et ${total - shown} autres fichiers`);
  return lines.join('\n');
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

  return {
    fileCount: visible.length,
    totalSize,
    totalSizeText: formatBytes(totalSize),
    mainFormat,
    filesText: buildFilesText(visible),
    subtitlesText,
  };
}
