import { create } from 'zustand';
import { api } from '../api/client';
import { COLORS_KEY, MODE_KEY, readColors, readMode, type EventId, type EventMode } from '../lib/eventArt';

const PREVIEW_KEY = 'seeduction-event-preview';
const MTL_KEY = 'seeduction-mtl';
const readMtl = (): boolean => { try { return localStorage.getItem(MTL_KEY) !== '0'; } catch { return true; } };
// Clé « v2 » : l'ancien réglage (activé par défaut) est ignoré, pour que la sirène soit désactivée chez tout le monde ; ensuite, le choix d'un membre (activer ou désactiver) est gardé tel quel.
const MTLSND_KEY = 'seeduction-mtl-sound-v2';
const readMtlSound = (): boolean => { try { return localStorage.getItem(MTLSND_KEY) === '1'; } catch { return false; } };
const readPreview = (): EventId | null => { try { return (sessionStorage.getItem(PREVIEW_KEY) as EventId) || null; } catch { return null; } };

interface ServerState { id: EventId | null; name: string | null; source: 'forced' | 'schedule' | null; until: string | null; particles: boolean; newYear: { at: string; year: number; daysBefore: number } | null }

interface EventThemeStore {
  server: ServerState | null;
  /** Aperçu local (administrateur) : un thème vu par soi seul, le temps de la session. */
  preview: EventId | null;
  /** Préférences de ce membre sur cet appareil. */
  mode: EventMode;
  colors: boolean;
  /** Afficher le score des Canadiens (préférence de ce membre, sur cet appareil). */
  mtl: boolean;
  /** Sirène quand le Canadien marque (préférence de ce membre, sur cet appareil). */
  mtlSound: boolean;
  load: () => Promise<void>;
  setPreview: (id: EventId | null) => void;
  setMode: (m: EventMode) => void;
  setColors: (v: boolean) => void;
  setMtl: (v: boolean) => void;
  setMtlSound: (v: boolean) => void;
}

export const useEventTheme = create<EventThemeStore>((set) => ({
  server: null,
  preview: readPreview(),
  mode: readMode(),
  colors: readColors(),
  mtl: readMtl(),
  mtlSound: readMtlSound(),
  async load() {
    try { set({ server: (await api.get('/event-themes/active')).data }); } catch { /* sans réponse : on garde l'état précédent (aucun décor au départ) */ }
  },
  setPreview(id) {
    try { if (id) sessionStorage.setItem(PREVIEW_KEY, id); else sessionStorage.removeItem(PREVIEW_KEY); } catch { /* stockage indisponible */ }
    set({ preview: id });
  },
  setMode(mode) { try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignoré */ } set({ mode }); },
  setColors(colors) { try { localStorage.setItem(COLORS_KEY, colors ? '1' : '0'); } catch { /* ignoré */ } set({ colors }); },
  setMtlSound(mtlSound) { try { localStorage.setItem(MTLSND_KEY, mtlSound ? '1' : '0'); } catch { /* ignoré */ } set({ mtlSound }); },
  setMtl(mtl) { try { localStorage.setItem(MTL_KEY, mtl ? '1' : '0'); } catch { /* ignoré */ } set({ mtl }); },
}));

/** Ce qu'il faut afficher maintenant : le thème (aperçu d'abord, puis celui du serveur), en tenant compte des préférences du membre. */
export function useEventDecor() {
  const { server, preview, mode, colors } = useEventTheme();
  const previewing = !!preview;
  const id = preview ?? (mode === 'off' ? null : server?.id ?? null);
  // Un aperçu s'affiche même si le membre a coupé les décors (l'administrateur veut justement le voir).
  const m: EventMode = previewing && mode === 'off' ? 'full' : mode;
  return {
    id,
    previewing,
    mode: m,
    colors,
    /** Particules : mode complet, et activées par l'administration (sauf en aperçu). */
    particles: m === 'full' && (previewing || (server?.particles ?? true)),
    serverActive: server?.id ?? null,
  };
}
