const GB = 1024 ** 3;
const TB = 1024 ** 4;

// Paliers basés sur le volume total uploadé, purement côté front (aucune
// donnée persistée) : le titre est toujours dérivé de `user.uploaded`.
const RANKS = [
  { title: 'Nouveau', min: 0 },
  { title: 'Utilisateur', min: 10 * GB },
  { title: 'Utilisateur Power', min: 50 * GB },
  { title: 'Élite', min: 250 * GB },
  { title: 'Seed Lord', min: 1 * TB },
  { title: 'Seed King', min: 5 * TB },
  { title: 'Légende', min: 20 * TB },
];

export function getRankInfo(uploadedBytes: number | string | bigint) {
  const uploaded = Number(uploadedBytes);
  let current = RANKS[0];
  let next = RANKS[1] as typeof RANKS[number] | undefined;

  for (let i = 0; i < RANKS.length; i++) {
    if (uploaded >= RANKS[i].min) {
      current = RANKS[i];
      next = RANKS[i + 1];
    }
  }

  if (!next) {
    return { title: current.title, next: null, progressPercent: 100 };
  }

  const span = next.min - current.min;
  const progress = span > 0 ? ((uploaded - current.min) / span) * 100 : 100;
  return {
    title: current.title,
    next: next.title,
    progressPercent: Math.max(0, Math.min(100, Math.round(progress))),
  };
}
