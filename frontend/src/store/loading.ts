import { create } from 'zustand';

/**
 * Suivi des requêtes en cours, pour l'écran de chargement global (voir GlobalLoader).
 *  - page      : lectures (GET) — comptent seulement pendant le chargement d'une page, pas pour les rafraîchissements en arrière-plan
 *  - mutation  : actions (envoi, modification, suppression) — écran affiché si elles traînent
 *  - immediate : connexion, inscription, confirmation par courriel — écran affiché tout de suite
 */
export type LoadKind = 'page' | 'mutation' | 'immediate';

export const useLoading = create<{ page: number; mutation: number; immediate: number }>(() => ({ page: 0, mutation: 0, immediate: 0 }));

/** Requêtes qui ne doivent jamais bloquer l'écran : messagerie instantanée, envois de fichiers (qui ont leur propre barre de progression), génération... */
const QUIET = /^\/(messenger|support\/chat|stream|presence|notifications|covers\/upload|torrents\/(upload|analyze)|templates\/generate)/;

export function classify(config: { url?: string; method?: string; silent?: boolean }): LoadKind | null {
  const url = (config.url ?? '').split('?')[0];
  if (config.silent || QUIET.test(url)) return null;
  const method = (config.method ?? 'get').toLowerCase();
  if (method === 'get' || method === 'head') return 'page';
  return /^\/auth\//.test(url) ? 'immediate' : 'mutation';
}

/** Requêtes en cours (identifiant -> genre, début). Une requête jamais décomptée expire après 60 s : elle ne peut pas bloquer l'écran pour toujours. */
const active = new Map<number, { kind: LoadKind; at: number }>();
let nextId = 1;
const EXPIRE_MS = 60_000;

function recount() {
  const now = Date.now();
  const n = { page: 0, mutation: 0, immediate: 0 };
  for (const [id, r] of active) { if (now - r.at > EXPIRE_MS) active.delete(id); else n[r.kind]++; }
  const cur = useLoading.getState();
  if (cur.page !== n.page || cur.mutation !== n.mutation || cur.immediate !== n.immediate) useLoading.setState(n);
}

/** À appeler régulièrement : fait expirer les requêtes oubliées. */
export const sweepLoading = recount;

export function trackStart(config: any) {
  const kind = classify(config);
  if (!kind) return;
  config.__loadId = nextId++;
  active.set(config.__loadId, { kind, at: Date.now() });
  recount();
}

export function trackEnd(config: any) {
  const id: number | undefined = config?.__loadId;
  if (id === undefined) return;
  active.delete(id); // une requête n'est décomptée qu'une fois
  recount();
}
