/**
 * Marge de téléchargement : le volume qu'un membre peut encore télécharger avant que le tracker bloque ses nouveaux téléchargements. Le blocage (voir TrackerService.announce) vise le RATIO MINIMUM du
 * site (celui du membre, 0,5 par défaut), pas un ratio de 1, et ne s'applique qu'une fois le volume de grâce des nouveaux dépassé : le téléchargement total peut donc monter jusqu'au plus grand de
 * « grâce » et « upload ÷ ratio minimum ». Logique pure (testée) ; l'interface du site en reprend la même formule.
 */
export function downloadMarginBytes(uploaded: number, downloaded: number, minRatio: number, graceBytes: number): number | null {
  if (!(minRatio > 0)) return null; // aucun ratio minimum : pas de limite
  const cap = Math.max(graceBytes, uploaded / minRatio);
  return Math.max(0, Math.floor(cap - downloaded));
}
