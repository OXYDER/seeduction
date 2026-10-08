/** Durée en heures, lisible : 24 → « 1 jour », 36 → « 36 h », 72 → « 3 jours ». */
export function durationFr(hours: number): string {
  if (hours >= 24 && hours % 24 === 0) { const d = hours / 24; return `${d} jour${d > 1 ? 's' : ''}`; }
  return `${hours} h`;
}

export interface TierLike { freeleechHours: number; doubleUploadHours: number; tokens: number; rainPoints: number }

/** Récompenses d'un palier en une phrase : « freeleech 6 h · 1 jeton par donateur ». */
export function tierPerks(t: TierLike): string {
  return [
    t.freeleechHours > 0 ? `freeleech global ${durationFr(t.freeleechHours)}` : '',
    t.doubleUploadHours > 0 ? `double upload ${durationFr(t.doubleUploadHours)}` : '',
    t.tokens > 0 ? `${t.tokens} jeton${t.tokens > 1 ? 's' : ''} freeleech par donateur` : '',
    t.rainPoints > 0 ? `${t.rainPoints} points pour chaque membre actif` : '',
  ].filter(Boolean).join(' · ');
}
