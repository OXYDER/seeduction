// Formats lisibles nativement par un <video> de navigateur, sans transcodage côté serveur (voir STREAMING.md) —
// doit rester identique à PLAYABLE_EXTENSIONS côté backend (backend/src/stream/stream.service.ts).
const PLAYABLE_EXTENSIONS = new Set(['mp4', 'm4v', 'webm', 'ogv']);

export function isPlayableFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return PLAYABLE_EXTENSIONS.has(ext);
}

/** Fichiers du torrent qu'on peut proposer en « Visualiser en ligne », dans l'ordre du torrent. */
export function playableFiles(fileList: { path: string; size: number }[] | null | undefined): { index: number; path: string; size: number }[] {
  return (fileList ?? [])
    .map((f, index) => ({ ...f, index }))
    .filter((f) => isPlayableFile(f.path));
}

export function streamUrl(torrentId: string, fileIndex: number, passkey: string): string {
  return `/api/stream/${torrentId}?file=${fileIndex}&passkey=${encodeURIComponent(passkey)}`;
}
