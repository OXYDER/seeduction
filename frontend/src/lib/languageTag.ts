// Langue d'une release selon la règle de Seeduction (même logique que le serveur : backend/src/common/utils/language.ts et
// importer/release-meta.ts, pour que le formulaire d'envoi et l'import automatique donnent la même étiquette).
//
//  - une seule piste audio en français : VOF (version officielle), TRUEFRENCH ou VFF (France), VFI (internationale), VFB (belge), VFQ (québécoise)
//  - plusieurs langues avec UNE piste française : MULTI + sa précision (MULTI.VFQ...) ; VFF et VFQ ensemble : MULTI.VF2
//  - aucune piste française : VOSTFR (sous-titres français complets obligatoires) ; piste muette : MUET (MUET.VOSTFR)

export const FR_VARIANTS = ['VOF', 'TRUEFRENCH', 'VFF', 'VFI', 'VFB', 'VFQ'] as const;
type Variant = typeof FR_VARIANTS[number];

export const LANGUAGE_LABELS: Record<string, string> = {
  VOF: 'VOF — version officielle française',
  TRUEFRENCH: 'TRUEFRENCH — version française francophone',
  VFF: 'VFF — version française (France)',
  VFI: 'VFI — version française internationale',
  VFB: 'VFB — version française belge',
  VFQ: 'VFQ — version française québécoise',
  'MULTI.VOF': 'MULTI.VOF — plusieurs langues, piste VOF',
  'MULTI.TRUEFRENCH': 'MULTI.TRUEFRENCH — plusieurs langues, piste TRUEFRENCH',
  'MULTI.VFF': 'MULTI.VFF — plusieurs langues, piste VFF',
  'MULTI.VFI': 'MULTI.VFI — plusieurs langues, piste VFI',
  'MULTI.VFB': 'MULTI.VFB — plusieurs langues, piste VFB',
  'MULTI.VFQ': 'MULTI.VFQ — plusieurs langues, piste VFQ',
  'MULTI.VF2': 'MULTI.VF2 — plusieurs langues, VFF + VFQ',
  VOSTFR: 'VOSTFR — sans piste française, sous-titres français complets',
  MUET: 'MUET — piste audio muette',
  'MUET.VOSTFR': 'MUET.VOSTFR — muet, sous-titres français',
};
/** Étiquettes proposées à l'envoi, par groupe. */
export const LANGUAGE_GROUPS: { label: string; values: string[] }[] = [
  { label: 'Une seule piste française', values: [...FR_VARIANTS] },
  { label: 'Plusieurs langues (une piste française)', values: [...FR_VARIANTS.map((v) => `MULTI.${v}`), 'MULTI.VF2'] },
  { label: 'Sans piste française', values: ['VOSTFR', 'MUET', 'MUET.VOSTFR'] },
];

const tokensOf = (name: string) => name.replace(/\.torrent$/i, '').split(/[.\_\[\]()\s]+/).filter(Boolean);
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const LANG_CODE: Record<string, string> = { french: 'fr', francais: 'fr', fr: 'fr', fre: 'fr', fra: 'fr', english: 'en', anglais: 'en', en: 'en', eng: 'en' };

function fromName(name: string) {
  const all = tokensOf(name).flatMap((t) => [t.toLowerCase(), ...t.toLowerCase().split('-')]);
  const has = (...w: string[]) => w.some((x) => all.includes(x));
  const fr = new Set<Variant>();
  if (has('vof')) fr.add('VOF');
  if (has('truefrench')) fr.add('TRUEFRENCH');
  if (has('vff')) fr.add('VFF');
  if (has('vfi')) fr.add('VFI');
  if (has('vfb')) fr.add('VFB');
  if (has('vfq', 'vq', 'vfqc', 'quebec', 'québec', 'canadien')) fr.add('VFQ');
  if (has('vf2')) { fr.add('VFF'); fr.add('VFQ'); }
  return { fr, multi: has('multi', 'multi2', 'multi3', 'multilang', 'multilangue'), muet: has('muet'), vostfr: has('vostfr', 'vost', 'subfrench') };
}

const variantOf = (label: string): Variant => {
  if (/\((?:ca|can)\)|canad|qu[eé]b|fr-?ca|\bvfq\b|\bvq\b/i.test(label)) return 'VFQ';
  if (/\((?:be|bel)\)|belg|fr-?be|\bvfb\b/i.test(label)) return 'VFB';
  if (/\bvfi\b|international/i.test(label)) return 'VFI';
  if (/\bvof\b/i.test(label)) return 'VOF';
  if (/truefrench/i.test(label)) return 'TRUEFRENCH';
  return 'VFF';
};

function fromMediaInfo(nfo: string) {
  const fr = new Set<Variant>();
  let nonFr = 0;
  let subsFr = false;
  let section = '';
  let lang = '';
  let title = '';
  const end = () => { if (section === 'audio' && lang) { if (lang === 'fr') fr.add(variantOf(title)); else nonFr++; } lang = ''; title = ''; };
  for (const line of nfo.split(/\r?\n/)) {
    const head = line.match(/^\s*(General|Video|Audio|Text|Menu|Other)(?:\s*#\d+)?\s*$/i);
    if (head) { end(); section = head[1].toLowerCase(); continue; }
    const l = line.match(/^\s*Language\s*:\s*(.+)$/i)?.[1]?.trim();
    if (l) {
      const code = LANG_CODE[strip(l.split(/[\s/(]/)[0])] ?? strip(l).slice(0, 2);
      if (section === 'audio') { lang = code; title = l + ' ' + title; }
      if (section === 'text' && code === 'fr') subsFr = true;
    }
    if (section === 'audio' && /^\s*Title\s*:/i.test(line)) title += ' ' + line;
  }
  end();
  for (const line of nfo.split(/\r?\n/)) if (/^\s*(release|nom|name|titre|langue|language|audio)\b.*[:.]/i.test(line) && /\bvfq\b|qu[eé]b/i.test(line)) fr.add('VFQ');
  return { fr, nonFr, subsFr };
}

/** Étiquette de langue d'une release d'après son nom et son NFO / MediaInfo ; undefined si rien de précis (« FRENCH », « MULTi » seuls). */
export function languageTagFrom(name: string, nfo = ''): string | undefined {
  const n = fromName(name);
  const m = fromMediaInfo(nfo);
  const all = new Set<Variant>([...n.fr, ...m.fr]);
  if (n.fr.size === 0 && m.fr.size === 0) {
    if (n.muet) return n.vostfr ? 'MUET.VOSTFR' : 'MUET';
    if (n.vostfr || m.subsFr) return 'VOSTFR';
    return undefined;
  }
  if (all.has('VFF') && all.has('VFQ')) return 'MULTI.VF2';
  const variant = (n.fr.size ? [...n.fr][0] : [...m.fr][0]) as Variant;
  return n.multi || m.nonFr > 0 ? `MULTI.${variant}` : variant;
}
