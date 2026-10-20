/**
 * Points bonus du seed, version simple à comprendre : chaque torrent que tu seedes rapporte des points chaque heure, et il en rapporte PLUS quand
 *  - il est gros (garder un gros fichier coûte de la place : un petit fichier de quelques Mo ne rapporte presque rien),
 *  - il est rare (peu de seeders : c'est ton seed qui le garde en vie).
 * Logique pure (testée) ; la lecture des seeds est dans EconomyService.
 */

/** Poids du fichier : 1 pour 4 Go ; en dessous, (0,25 Go + taille) ÷ 4,25 Go ; au-dessus, il monte doucement (environ 1,26 à 25 Go, 1,39 à 60 Go). */
export function sizeWeight(sizeBytes: number): number {
  const gb = Math.max(0, sizeBytes) / 1e9;
  if (gb <= 4) return (0.25 + gb) / 4.25;
  return 1 + 0.1 * Math.log2(gb / 4);
}

/** Bonus de rareté : un torrent presque seul (3 seeders ou moins) vaut le double, puis 1,5 jusqu'à 10 seeders, 1,2 jusqu'à 50, et 1 au-delà. `seeders` compte aussi le membre. */
export function rarityBonus(seeders: number): number {
  if (seeders <= 3) return 2;
  if (seeders <= 10) return 1.5;
  if (seeders <= 50) return 1.2;
  return 1;
}

/** Points par heure d'un torrent seedé. */
export function torrentHourly(sizeBytes: number, seeders: number, base: number): number {
  return base * sizeWeight(sizeBytes) * rarityBonus(Math.max(1, seeders));
}

export interface SeededTorrent { size: number; seeders: number }

/** Total par heure d'un membre : les `cap` torrents qui rapportent le plus (le plafond évite de gagner en accumulant des milliers de petits fichiers). */
export function memberHourly(torrents: SeededTorrent[], base: number, cap: number): number {
  const rates = torrents.map((t) => torrentHourly(t.size, t.seeders, base)).sort((a, b) => b - a).slice(0, Math.max(0, cap));
  return Math.round(rates.reduce((s, r) => s + r, 0) * 100) / 100;
}
