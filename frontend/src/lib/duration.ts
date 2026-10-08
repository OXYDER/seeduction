/** Durée en heures, lisible : 24 → « 1 jour », 36 → « 36 h », 72 → « 3 jours ». */
export function durationFr(hours: number): string {
  if (hours >= 24 && hours % 24 === 0) { const d = hours / 24; return `${d} jour${d > 1 ? 's' : ''}`; }
  return `${hours} h`;
}
