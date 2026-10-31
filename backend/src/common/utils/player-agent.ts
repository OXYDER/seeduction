/** Le lecteur Seeduction (et son système) d'après l'en-tête User-Agent envoyé à chaque lecture. Rien pour un navigateur ou un autre outil. */
export type PlayerPlatform = 'WINDOWS' | 'MAC' | 'LINUX' | 'DESKTOP' | 'ANDROID';
export const PLATFORM_LABEL: Record<PlayerPlatform, string> = { WINDOWS: 'Windows', MAC: 'Mac', LINUX: 'Linux', DESKTOP: 'Ordinateur', ANDROID: 'Android' };

export function playerFromUserAgent(ua?: string | null): { platform: PlayerPlatform; version: string | null } | null {
  const s = String(ua ?? '');
  const android = /Seeduction-Android\/([\w.-]+)/i.exec(s);
  if (android) return { platform: 'ANDROID', version: android[1] };
  const desk = /Seeduction-Player\/([\w.-]+)/i.exec(s);
  if (desk) {
    const os = /\((win32|windows|darwin|mac|linux)\)/i.exec(s)?.[1]?.toLowerCase() ?? (/Windows|Win64/i.test(s) ? 'windows' : /Macintosh|Mac OS/i.test(s) ? 'mac' : /Linux|X11/i.test(s) ? 'linux' : '');
    return { platform: os.startsWith('win') ? 'WINDOWS' : os === 'darwin' || os === 'mac' ? 'MAC' : os === 'linux' ? 'LINUX' : 'DESKTOP', version: desk[1] };
  }
  return null;
}
