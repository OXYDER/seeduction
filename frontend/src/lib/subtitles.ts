// Sous-titres d'un torrent : codes de langue (« FR », « EN », « FR forcés », « FR-CA ») et noms lisibles.
const NAMES: Record<string, string> = {
  FR: 'Français', EN: 'Anglais', ES: 'Espagnol', DE: 'Allemand', IT: 'Italien', PT: 'Portugais', JA: 'Japonais', KO: 'Coréen', ZH: 'Chinois', RU: 'Russe', AR: 'Arabe', NL: 'Néerlandais',
  PL: 'Polonais', TR: 'Turc', SV: 'Suédois', NO: 'Norvégien', DA: 'Danois', FI: 'Finnois', CS: 'Tchèque', HU: 'Hongrois', EL: 'Grec', HE: 'Hébreu', HI: 'Hindi', TH: 'Thaï', VI: 'Vietnamien',
  ID: 'Indonésien', RO: 'Roumain', UK: 'Ukrainien',
};

/** « Français, Anglais, Français forcés » */
export function subtitleNames(list: string[] | null | undefined): string {
  return (list ?? []).map((s) => { const [code, ...rest] = s.split(' '); const base = code === 'FR-CA' ? 'Français (Canada)' : NAMES[code] ?? code; return rest.length ? `${base} ${rest.join(' ')}` : base; }).join(', ');
}

/** Version courte pour une pastille : « ST FR·EN·ES +2 ». */
export function subtitleChip(list: string[] | null | undefined, max = 3): string | null {
  const l = list ?? [];
  if (l.length === 0) return null;
  const shown = l.slice(0, max).map((s) => s.replace(' forcés', '*'));
  return `ST ${shown.join('·')}${l.length > max ? ` +${l.length - max}` : ''}`;
}
