// Format du fichier vidéo (conteneur) lu dans la liste des fichiers du torrent : le plus gros fichier vidéo donne son extension (.mkv → MKV).
// Sert quand le NFO / MediaInfo ne le dit pas : sans cela, seuls les torrents dont le MediaInfo était collé affichaient leur format.

const BY_EXT: Record<string, string> = {
  mkv: 'MKV', mp4: 'MP4', m4v: 'MP4', avi: 'AVI', mov: 'MOV', wmv: 'WMV', webm: 'WEBM', flv: 'FLV', mpg: 'MPEG', mpeg: 'MPEG',
  ts: 'TS', m2ts: 'TS', mts: 'TS', iso: 'ISO', vob: 'VOB',
};
/** Les fichiers qui accompagnent une vidéo (bande-annonce, échantillon) ne décident pas du format. */
const SIDE = /(?:^|[\\/._ -])(?:sample|trailer|extras?|featurettes?|bonus)(?:[\\/._ -]|$)/i;

export function containerOf(files: { path: string; size?: number }[]): string | null {
  const bySize = new Map<string, number>();
  for (const f of files.slice(0, 5000)) {
    const path = String(f?.path ?? '');
    const ext = /\.([a-z0-9]{2,4})$/i.exec(path)?.[1]?.toLowerCase();
    const label = ext ? BY_EXT[ext] : undefined;
    if (!label || SIDE.test(path)) continue;
    bySize.set(label, (bySize.get(label) ?? 0) + (Number(f.size) || 1));
  }
  let best: string | null = null;
  for (const [label, size] of bySize) if (best === null || size > (bySize.get(best) ?? 0)) best = label;
  return best;
}
