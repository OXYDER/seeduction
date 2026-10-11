import { useMemo, useState } from 'react';
import { formatBytes } from '../lib/format';

interface FileEntry { path: string; size: number }
interface Node {
  name: string;
  path: string;
  size: number;
  files: number;
  children: Map<string, Node>;
  file?: boolean;
}

function build(files: FileEntry[]): Node {
  const root: Node = { name: '', path: '', size: 0, files: 0, children: new Map() };
  for (const f of files) {
    const parts = String(f.path ?? '').split(/[\\/]+/).filter(Boolean);
    if (parts.length === 0) continue;
    const size = Number(f.size) || 0;
    let cur = root;
    cur.size += size; cur.files += 1;
    parts.forEach((part, i) => {
      const last = i === parts.length - 1;
      const key = last ? `${part}\u0000${cur.children.size}` : part; // deux fichiers du même nom ne se confondent pas
      let next = cur.children.get(key);
      if (!next) {
        next = { name: part, path: `${cur.path}/${part}`, size: 0, files: 0, children: new Map(), file: last };
        cur.children.set(key, next);
      }
      if (!last) { next.size += size; next.files += 1; } else next.size = size;
      cur = next;
    });
  }
  return root;
}

const icon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['mkv', 'mp4', 'avi', 'mov', 'wmv', 'm4v', 'ts', 'webm', 'mpg', 'mpeg'].includes(ext)) return '🎬';
  if (['mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a', 'opus', 'wma', 'ape'].includes(ext)) return '🎵';
  if (['srt', 'ass', 'ssa', 'sub', 'idx', 'sup', 'vtt', 'smi', 'sbv'].includes(ext)) return '💬';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return '🖼️';
  if (['nfo', 'txt', 'md', 'diz'].includes(ext)) return '📝';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'iso', 'img', 'bin'].includes(ext) || /^r\d{2}$/.test(ext)) return '📦';
  if (['exe', 'msi', 'dmg', 'pkg', 'apk', 'deb', 'appimage'].includes(ext)) return '⚙️';
  if (['dll', 'so', 'dylib', 'sys', 'ini', 'cfg', 'conf', 'json', 'xml', 'yml', 'yaml', 'dat', 'db'].includes(ext)) return '🧩';
  if (['rom', 'nes', 'sfc', 'smc', 'gba', 'nds', 'z64', 'gb', 'gbc', 'cue'].includes(ext)) return '🎮';
  if (['ttf', 'otf', 'woff', 'woff2'].includes(ext)) return '🔤';
  if (['epub', 'pdf', 'mobi', 'azw3', 'cbz', 'cbr'].includes(ext)) return '📚';
  return '📄';
};

/** Fichiers d'un torrent en arborescence : un dossier se déplie (+) ou se replie (−), avec le nombre de fichiers et la taille totale de son contenu. */
export default function FileTree({ files, truncatedBy = 0 }: { files: FileEntry[]; truncatedBy?: number }) {
  const root = useMemo(() => build(files), [files]);
  // Un torrent d'un seul dossier racine s'ouvre sur son contenu ; un gros torrent démarre replié (sauf le premier niveau).
  const [open, setOpen] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const walk = (n: Node, depth: number) => {
      for (const c of n.children.values()) {
        if (c.file) continue;
        if (files.length <= 40 || depth === 0) s.add(c.path);
        walk(c, depth + 1);
      }
    };
    walk(root, 0);
    return s;
  });
  const folders = useMemo(() => {
    const all: string[] = [];
    const walk = (n: Node) => { for (const c of n.children.values()) if (!c.file) { all.push(c.path); walk(c); } };
    walk(root);
    return all;
  }, [root]);

  const toggle = (p: string) => setOpen((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const sorted = (n: Node) => [...n.children.values()].sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  function rows(n: Node, depth: number): React.ReactNode[] {
    return sorted(n).flatMap((c) => {
      const pad = { paddingLeft: depth * 18 };
      if (c.file) {
        return [(
          <div key={c.path + c.name} className="ftree-row file" style={pad}>
            <span className="ftree-box" aria-hidden />
            <span className="ftree-icon" aria-hidden>{icon(c.name)}</span>
            <span className="ftree-name" title={c.name}>{c.name}</span>
            <span className="muted ftree-size">{formatBytes(c.size)}</span>
          </div>
        )];
      }
      const isOpen = open.has(c.path);
      return [
        (
          <div key={c.path} className="ftree-row dir" style={pad}>
            <button type="button" className="ftree-box" onClick={() => toggle(c.path)} aria-expanded={isOpen} aria-label={`${isOpen ? 'Replier' : 'Déplier'} ${c.name}`}>{isOpen ? '−' : '+'}</button>
            <span className="ftree-icon dir" aria-hidden>{isOpen ? '📂' : '📁'}</span>
            <button type="button" className="ftree-name dirname" onClick={() => toggle(c.path)} title={c.name}>{c.name}</button>
            <span className="muted ftree-size">{c.files} fichier{c.files > 1 ? 's' : ''} · {formatBytes(c.size)}</span>
          </div>
        ),
        ...(isOpen ? rows(c, depth + 1) : []),
      ];
    });
  }

  if (files.length === 0) return <p className="muted">Aucun fichier listé.</p>;
  return (
    <div className="ftree">
      {folders.length > 0 && (
        <div className="row ftree-tools">
          <button type="button" className="secondary" onClick={() => setOpen(new Set(folders))}>+ Tout déplier</button>
          <button type="button" className="secondary" onClick={() => setOpen(new Set())}>− Tout replier</button>
        </div>
      )}
      <div className="ftree-body" role="tree">{rows(root, 0)}</div>
      {truncatedBy > 0 && <p className="muted" style={{ margin: '6px 0 0' }}>… et {truncatedBy} autre(s) fichier(s)</p>}
    </div>
  );
}
