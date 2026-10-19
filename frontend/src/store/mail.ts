import { create } from 'zustand';

/** Une boîte courriel est-elle configurée pour cette personne de l'équipe ? (renseigné par la mise en page ; sert à afficher les boutons « Écrire par courriel ») */
export const useMailStore = create<{ hasMail: boolean; setHasMail: (v: boolean) => void }>((set) => ({ hasMail: false, setHasMail: (hasMail) => set({ hasMail }) }));
