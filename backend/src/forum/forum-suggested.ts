/**
 * Structure de forum proposée pour démarrer : 4 catégories et 11 forums, pas plus. Créée à la demande (Admin > Forum > « Ajouter les forums suggérés »),
 * jamais automatiquement ; ce qui existe déjà (même nom au même endroit) n'est pas recréé, rien n'est modifié ni supprimé.
 */
export interface SuggestedForum { name: string; icon: string; description: string; locked?: boolean }
export interface SuggestedCategory { name: string; icon: string; description: string; forums: SuggestedForum[] }

export const SUGGESTED_FORUMS: SuggestedCategory[] = [
  {
    name: 'Communauté', icon: '👋', description: 'Faire connaissance et discuter librement.',
    forums: [
      { name: 'Présentations', icon: '🙋', description: 'Dis-nous qui tu es, ce que tu aimes regarder et écouter.' },
      { name: 'Discussions générales', icon: '💬', description: 'Tout ce qui touche la vie de la communauté.' },
      { name: 'Hors-sujet', icon: '☕', description: 'La salle de pause : humour, actualité, tout ce qui ne rentre nulle part ailleurs.' },
    ],
  },
  {
    name: 'Médias', icon: '🎬', description: 'Parler de ce que tu regardes, écoutes et joues.',
    forums: [
      { name: 'Films et séries', icon: '🎞️', description: 'Recommandations, avis, théories, sorties à ne pas manquer.' },
      { name: 'Musique', icon: '🎵', description: 'Albums, artistes, concerts, qualité audio (FLAC, vinyles...).' },
      { name: 'Jeux et logiciels', icon: '🎮', description: 'Jeux, outils, astuces d\'installation.' },
    ],
  },
  {
    name: 'Aide et technique', icon: '🛠️', description: 'Un problème ? Quelqu\'un a sûrement déjà la réponse.',
    forums: [
      { name: 'Aide et dépannage', icon: '🆘', description: 'Ratio, ports, connexion, hit & run : pose ta question (cherche d\'abord dans le wiki).' },
      { name: 'Clients, seedbox et outils', icon: '🔌', description: 'qBittorrent, ruTorrent, Sonarr, Radarr, Prowlarr : configurations et astuces.' },
    ],
  },
  {
    name: 'Seeduction', icon: '⭐', description: 'La vie du site.',
    forums: [
      { name: 'Annonces de l\'équipe', icon: '📣', description: 'Les messages importants de l\'équipe (lecture seule pour les membres).', locked: true },
      { name: 'Bugs et problèmes', icon: '🐞', description: 'Signale un bug : ce que tu as fait, ce que tu as vu. Pour une idée, utilise plutôt les Suggestions.' },
      { name: 'Événements et concours', icon: '🎉', description: 'Défis, concours, soirées de partage et événements de la communauté.' },
    ],
  },
];
