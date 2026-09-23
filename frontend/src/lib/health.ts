export interface Health { color: string; label: string }

/** Santé d'un torrent d'après ses seeders : de quoi savoir d'un coup d'œil s'il se téléchargera bien. */
export function healthOf(seeders: number): Health {
  if (seeders <= 0) return { color: '#e05a5a', label: 'Aucun seeder : le téléchargement risque de ne pas démarrer' };
  if (seeders < 3) return { color: '#f0a030', label: 'Peu de seeders : téléchargement possiblement lent' };
  if (seeders < 10) return { color: '#c8d24a', label: 'Correct' };
  return { color: '#4caf50', label: 'Excellent : beaucoup de seeders' };
}
