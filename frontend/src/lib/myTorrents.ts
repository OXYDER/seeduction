/** « Mes torrents » : filtres, tri et export de la liste du membre (seeds, téléchargements en cours et terminés, envois). Logique pure, sans affichage. */

export interface MyTorrent {
  torrentId: string; name: string; coverImage: string | null; size: number;
  category: { id: string; name: string; parent: { id: string; name: string } | null } | null;
  resolution: string | null; language: string | null; status: string; seeders: number; leechers: number; completedCount: number;
  addedAt: string; startedAt: string | null; firstDay: string | null; completedAt: string | null;
  seedingNow: boolean; leechingNow: boolean; completed: boolean; own: boolean;
  progress: number; lastAnnounceAt: string | null; receivedBytes: number | null; sentBytes: number | null; ratio: number | null;
  seedSeconds: number; requiredSeconds: number; satisfied: boolean;
  state: 'done' | 'progress' | 'idle' | 'hnr' | 'none'; hnr: boolean; hnrResolved: boolean;
}

export type StatusFilter = 'all' | 'seeding' | 'leeching' | 'completed' | 'todo' | 'hnr' | 'own';
export type SortKey = 'date' | 'added' | 'name' | 'size' | 'category' | 'received' | 'sent' | 'ratio' | 'seedTime' | 'progress' | 'announce';

export interface Filters {
  status: StatusFilter;
  q: string;
  /** Catégorie : l'identifiant d'une sous-catégorie ou d'une catégorie parente (toutes ses sous-catégories), ou '' pour toutes. */
  category: string;
  resolution: string;
  size: '' | 'xs' | 's' | 'm' | 'l';
  from: string; // AAAA-MM-JJ
  to: string;
  sort: SortKey;
  dir: 'asc' | 'desc';
}

export const DEFAULT_FILTERS: Filters = { status: 'all', q: '', category: '', resolution: '', size: '', from: '', to: '', sort: 'date', dir: 'desc' };

const GO = 1024 ** 3;
export const SIZE_RANGES: Record<Exclude<Filters['size'], ''>, { label: string; min: number; max: number }> = {
  xs: { label: 'Moins de 1 Go', min: 0, max: GO },
  s: { label: '1 à 5 Go', min: GO, max: 5 * GO },
  m: { label: '5 à 20 Go', min: 5 * GO, max: 20 * GO },
  l: { label: 'Plus de 20 Go', min: 20 * GO, max: Infinity },
};

/** La date d'un torrent dans la liste : sa date de fin de téléchargement, sinon son ajout sur le site (envois, téléchargements en cours). */
export const dateOf = (r: MyTorrent): number => new Date(r.completedAt ?? r.startedAt ?? r.addedAt).getTime();

export function matchesStatus(r: MyTorrent, s: StatusFilter): boolean {
  switch (s) {
    case 'seeding': return r.seedingNow;
    case 'leeching': return r.leechingNow;
    case 'completed': return r.completed;
    case 'todo': return r.state === 'progress' || r.state === 'idle' || r.state === 'hnr';
    case 'hnr': return r.state === 'hnr';
    case 'own': return r.own;
    default: return true;
  }
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function applyFilters(rows: MyTorrent[], f: Filters, ignoreStatus = false): MyTorrent[] {
  const q = strip(f.q.trim());
  const from = f.from ? new Date(f.from + 'T00:00:00').getTime() : null;
  const to = f.to ? new Date(f.to + 'T23:59:59.999').getTime() : null;
  const sz = f.size ? SIZE_RANGES[f.size] : null;
  return rows.filter((r) => {
    if (!ignoreStatus && !matchesStatus(r, f.status)) return false;
    if (q && !strip(r.name).includes(q) && !strip(r.category?.name ?? '').includes(q)) return false;
    if (f.category && r.category?.id !== f.category && r.category?.parent?.id !== f.category) return false;
    if (f.resolution && r.resolution !== f.resolution) return false;
    if (sz && !(r.size >= sz.min && r.size < sz.max)) return false;
    const d = dateOf(r);
    if (from !== null && d < from) return false;
    if (to !== null && d > to) return false;
    return true;
  });
}

const value = (r: MyTorrent, k: SortKey): number | string => {
  switch (k) {
    case 'date': return dateOf(r);
    case 'added': return new Date(r.addedAt).getTime();
    case 'name': return r.name.toLowerCase();
    case 'size': return r.size;
    case 'category': return `${r.category?.parent?.name ?? r.category?.name ?? ''} ${r.category?.name ?? ''}`.toLowerCase();
    case 'received': return r.receivedBytes ?? -1;
    case 'sent': return r.sentBytes ?? -1;
    case 'ratio': return r.ratio ?? -1;
    case 'seedTime': return r.seedSeconds;
    case 'progress': return r.progress;
    case 'announce': return r.lastAnnounceAt ? new Date(r.lastAnnounceAt).getTime() : 0;
  }
};

export function sortRows(rows: MyTorrent[], key: SortKey, dir: 'asc' | 'desc'): MyTorrent[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a, key), y = value(b, key);
    const c = typeof x === 'string' ? x.localeCompare(String(y), 'fr') : (x as number) - (y as number);
    return c !== 0 ? c * m : dateOf(b) - dateOf(a);
  });
}

/** Les catégories présentes dans la liste, regroupées par catégorie parente (pour le sélecteur). */
export function categoryOptions(rows: MyTorrent[]): { id: string; name: string; children: { id: string; name: string; count: number }[]; count: number }[] {
  const groups = new Map<string, { id: string; name: string; children: Map<string, { id: string; name: string; count: number }>; count: number }>();
  for (const r of rows) {
    const c = r.category; if (!c) continue;
    const p = c.parent ?? c;
    const g = groups.get(p.id) ?? { id: p.id, name: p.name, children: new Map(), count: 0 };
    g.count++;
    if (c.parent) { const ch = g.children.get(c.id) ?? { id: c.id, name: c.name, count: 0 }; ch.count++; g.children.set(c.id, ch); }
    groups.set(p.id, g);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map((g) => ({ id: g.id, name: g.name, count: g.count, children: [...g.children.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')) }));
}

/** Export CSV (séparateur « ; » et BOM : s'ouvre correctement dans Excel en français). */
export function toCsv(rows: MyTorrent[]): string {
  const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const iso = (v: string | null) => (v ? new Date(v).toISOString().replace('T', ' ').slice(0, 16) : '');
  const head = ['Torrent', 'Catégorie', 'Taille (octets)', 'Ajouté sur le site', 'Début du téléchargement', 'Terminé', 'Reçu (octets)', 'Envoyé (octets)', 'Ratio', 'Seed cumulé (h)', 'Obligation de seed', 'En seed', 'En téléchargement', 'Mon envoi'];
  const lines = rows.map((r) => [
    r.name, r.category ? [r.category.parent?.name, r.category.name].filter(Boolean).join(' > ') : '', r.size, iso(r.addedAt), iso(r.startedAt), iso(r.completedAt), r.receivedBytes ?? '', r.sentBytes ?? '', r.ratio ?? '',
    Math.round(r.seedSeconds / 360) / 10, r.own ? 'Aucune (ton envoi)' : r.satisfied ? 'Atteinte' : r.completed ? 'Pas atteinte' : '', r.seedingNow ? 'oui' : 'non', r.leechingNow ? 'oui' : 'non', r.own ? 'oui' : 'non',
  ].map(cell).join(';'));
  return '﻿' + [head.map(cell).join(';'), ...lines].join('\r\n');
}
