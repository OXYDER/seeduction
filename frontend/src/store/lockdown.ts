import { create } from 'zustand';

/** Vrai quand le serveur répond « site verrouillé » (alerte générale) : l'application n'affiche alors que l'écran de déblocage. */
export const useLockdownStore = create<{ locked: boolean; setLocked: (v: boolean) => void }>((set) => ({
  locked: false,
  setLocked: (locked) => set({ locked }),
}));
