const VARIABLE_PATTERN = /\{([a-zA-Zà-ÿÀ-ß_]+)\}/g;

/** Miroir de l'extraction côté backend, pour réagir en direct aux modifs du mode expert sans aller-retour serveur. */
export function extractVariables(content: string): string[] {
  const found = new Set<string>();
  for (const match of content.matchAll(VARIABLE_PATTERN)) {
    found.add(match[1].toLowerCase());
  }
  return [...found];
}
