/** Numéros de version des lecteurs (1.2.3, 0.4, 2.0.1.5) : seulement des nombres séparés par des points, sans texte. */
const VERSION = /^\d{1,4}(\.\d{1,4}){1,3}$/;

export function isValidVersion(v: unknown): v is string {
  return typeof v === 'string' && VERSION.test(v.trim());
}

/** Compare deux versions : négatif si a < b, 0 si égales, positif si a > b (« 1.2 » égale « 1.2.0 »). */
export function compareVersions(a: string, b: string): number {
  const pa = a.trim().split('.').map(Number), pb = b.trim().split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Retrouve un numéro de version dans un nom de fichier (« Seeduction Player Setup 0.2.0.exe » → 0.2.0), pour pré-remplir le formulaire. */
export function versionFromFilename(name: string): string | null {
  const m = /(\d{1,4}(?:\.\d{1,4}){1,3})(?=\D*$)/.exec(name.replace(/\.(exe|apk)$/i, ''));
  return m ? m[1] : null;
}
