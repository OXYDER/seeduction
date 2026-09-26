export function formatBytes(bytes: number | string | bigint) {
  const b = Number(bytes);
  const units = ['o', 'Ko', 'Mo', 'Go', 'To', 'Po'];
  let i = 0, n = b;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(2)} ${units[i]}`;
}

export function formatNumber(n: number | string | bigint) {
  return Number(n).toLocaleString('fr-FR');
}

/** Durée en minutes (issue de TMDB) -> "1 h 52" / "45 min". */
export function formatRuntime(minutes?: number | null) {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}
