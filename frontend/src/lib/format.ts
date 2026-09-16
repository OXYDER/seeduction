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
