import { create } from 'zustand';
import { api } from '../api/client';
import { COLORS_KEY, MODE_KEY, readColors, readMode, type EventId, type EventMode } from '../lib/eventArt';

const PREVIEW_KEY = 'seeduction-event-preview';
const readPreview = (): EventId | null => { try { return (sessionStorage.getItem(PREVIEW_KEY) as EventId) || null; } catch { return null; } };

interface ServerState { id: EventId | null; name: string | null; source: 'forced' | 'schedule' | null; until: string | null; particles: boolean }

interface EventThemeStore {
  server: ServerState | null;
  /** Aperçu local (administrateur) : un thème vu par soi seul, le temps de la session. */
  preview: EventId | null;
  /** Préférences de ce membre sur cet appareil. */
  mode: EventMode;
  colors: boolean;
  load: () => Promise<void>;
  setPreview: (id: EventId | null) => void;
  setMode: (m: EventMode) => void;
  setColors: (v: boolean) => void;
}

export const useEventTheme = create<EventThemeStore>((set) => ({
  server: null,
  preview: readPreview(),
  mode: readMode(),
  colors: readColors(),
  async load() {
    try { set({ server: (await api.get('/event-themes/active')).data }); } catch { /* sans réponse : on garde l'état précédent (aucun décor au départ) */ }
  },
  setPreview(id) {
    try { if (id) sessionStorage.setItem(PREVIEW_KEY, id); else sessionStorage.removeItem(PREVIEW_KEY); } catch { /* stockage indisponible */ }
    set({ preview: id });
  },
  setMode(mode) { try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignoré */ } set({ mode }); },
  setColors(colors) { try { localStorage.setItem(COLORS_KEY, colors ? '1' : '0'); } catch { /* ignoré */ } set({ colors }); },
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
