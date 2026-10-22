/** Dates et heures de la page Direct, toujours affichées dans le fuseau du site (réglé dans Admin › Direct), pas celui du navigateur. */

const keyFmt = new Map<string, Intl.DateTimeFormat>();

/** Le jour local (AAAA-MM-JJ) d'un instant dans le fuseau donné. */
export function dayKey(d: Date | string | number, tz: string): string {
  let f = keyFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    keyFmt.set(tz, f);
  }
  return f.format(new Date(d));
}

export const hm = (d: Date | string, tz: string) => new Date(d).toLocaleTimeString('fr-CA', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
/** Majuscule à la première lettre seulement (text-transform: capitalize mettrait une majuscule à chaque mot). */
export const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
export const longDate = (d: Date | string, tz: string) => cap(new Date(d).toLocaleDateString('fr-CA', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }));

/** Arithmétique de calendrier sur des jours AAAA-MM-JJ (indépendante du fuseau : un jour est un jour). */
export const parseKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return { y, m, d }; };
export const keyOf = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};
export const addDays = (k: string, n: number) => { const { y, m, d } = parseKey(k); return keyOf(y, m, d + n); };
export const weekday = (k: string) => { const { y, m, d } = parseKey(k); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
/** Premier jour de la semaine qui contient ce jour (dimanche, ou lundi si `mondayFirst`). */
export const weekStart = (k: string, mondayFirst: boolean) => addDays(k, -((weekday(k) - (mondayFirst ? 1 : 0) + 7) % 7));
export const keyLabel = (k: string, opts: Intl.DateTimeFormatOptions) => { const { y, m, d } = parseKey(k); return cap(new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('fr-CA', { timeZone: 'UTC', ...opts })); };

/** « 2 j 04:12:33 » (ou « 2 j 04 h 12 » sans les secondes). */
export function countdown(ms: number, seconds: boolean): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  const time = seconds ? `${p(h)}:${p(m)}:${p(s)}` : `${p(h)} h ${p(m)}`;
  return days > 0 ? `${days} j ${time}` : time;
}
