/**
 * Marge de téléchargement : ce que le membre peut encore télécharger avant le blocage. Le tracker bloque sous le RATIO MINIMUM du site (0,5 par défaut, propre à chaque membre), pas sous un ratio de 1,
 * et seulement après le volume de grâce des nouveaux. Même formule que backend/src/common/utils/download-margin.ts.
 */
export function downloadMargin(uploaded: number, downloaded: number, minRatio: number, graceBytes: number): number | null {
  if (!(minRatio > 0)) return null;
  return Math.max(0, Math.floor(Math.max(graceBytes, uploaded / minRatio) - downloaded));
}
