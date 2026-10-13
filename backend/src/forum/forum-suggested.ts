/**
 * Structure de forum recommandée : 7 catégories, des forums et quelques sous-forums, pensée pour ce que le site fait DÉJÀ ailleurs afin de ne pas faire
 * doublon : les annonces vont dans Nouvelles, les idées dans Suggestions, les bugs et problèmes de compte dans le Support, les demandes de torrents dans
 * Demandes, la discussion instantanée dans le Chat, les règles et guides dans le Wiki. Le forum sert à ce que ces sections ne font pas : discuter, s'entraider,
 * partager des conseils entre uploaders, échanger sur les médias.
 *
 * Créée à la demande (Admin > Forum > « Appliquer la structure recommandée », avec aperçu), jamais automatiquement ; ce qui existe déjà (même nom au même endroit)
 * n'est pas recréé, rien n'est modifié ni supprimé.
 */
import type { ForumAccess } from '../common/utils/forum-access';

export interface SuggestedForum {
  name: string; icon: string; description: string;
  rules?: string; qa?: boolean; locked?: boolean; access?: ForumAccess; staffOnly?: boolean;
  subforums?: SuggestedForum[];
}
export interface SuggestedCategory { name: string; icon: string; description: string; access?: ForumAccess; staffOnly?: boolean; forums: SuggestedForum[] }

export const SUGGESTED_FORUMS: SuggestedCategory[] = [
  {
    name: 'Communauté', icon: '👋', description: 'Faire connaissance et discuter librement.',
    forums: [
      { name: 'Présentations', icon: '🙋', description: 'Dis-nous qui tu es, ce que tu aimes regarder et écouter.', rules: 'Un seul sujet de présentation par membre. Raconte ce que tu aimes ; pas besoin de donner d\'informations personnelles.' },
      { name: 'Discussions générales', icon: '💬', description: 'Tout ce qui touche la vie de la communauté.' },
      {
        name: 'Hors-sujet', icon: '☕', description: 'La salle de pause : tout ce qui ne rentre nulle part ailleurs.',
        subforums: [
          { name: 'Humour et détente', icon: '😂', description: 'Blagues, mèmes, vidéos drôles.' },
          { name: 'Actualité et société', icon: '📰', description: 'Ce qui se passe dans le monde, dans le respect de chacun.', rules: 'Débats courtois : on discute des idées, pas des personnes. La politique partisane et les insultes n\'ont pas leur place ici.' },
        ],
      },
      { name: 'Défis et concours', icon: '🏆', description: 'Défis de partage, devinettes, concours organisés par les membres.' },
    ],
  },
  {
    name: 'Médias', icon: '🎬', description: 'Parler de ce que tu regardes, écoutes, lis et joues (les catégories du site).',
    forums: [
      {
        name: 'Films', icon: '🎞️', description: 'Avis, recommandations, sorties à ne pas manquer.',
        subforums: [
          { name: 'Avis et discussions', icon: '🎥', description: 'Tu as vu un film ? Raconte, sans spoiler dans le titre.', rules: 'Mets « [SPOILER] » dans le titre si tu dévoiles l\'intrigue, ou cache-la avec la mise en forme « spoiler ».' },
          { name: 'Sorties et à voir', icon: '🗓️', description: 'Ce qui arrive, ce qu\'il faut voir en priorité.' },
        ],
      },
      {
        name: 'Séries et animation', icon: '📺', description: 'Séries télé, anime, dessins animés.',
        subforums: [
          { name: 'Séries télé', icon: '📺', description: 'Saisons, épisodes, théories.', rules: 'Pas de spoiler d\'épisode récent dans les titres.' },
          { name: 'Animes', icon: '🈴', description: 'Animes, mangas adaptés, sorties de la saison.' },
        ],
      },
      { name: 'Musique', icon: '🎵', description: 'Albums, artistes, concerts, qualité audio (FLAC, vinyles...).' },
      { name: 'Livres et BD', icon: '📚', description: 'Romans, BD, mangas, livres audio.' },
      {
        name: 'Jeux vidéo', icon: '🎮', description: 'Jeux, guides, astuces.',
        subforums: [
          { name: 'Jeux PC', icon: '🖥️', description: 'Jeux sur ordinateur.' },
          { name: 'Consoles et émulation', icon: '🕹️', description: 'Consoles actuelles et rétro, émulateurs.' },
        ],
      },
      { name: 'Émulation', icon: '🕹️', description: 'Émulateurs, configurations, rétro-gaming : faire revivre les jeux d\'hier sur les machines d\'aujourd\'hui.' },
      { name: 'Applications et logiciels', icon: '💻', description: 'Outils, alternatives libres, astuces d\'installation.' },
    ],
  },
  {
    name: 'Entraide', icon: '🛠️', description: 'Un problème ? Quelqu\'un a sûrement déjà la réponse. Les forums d\'entraide permettent de marquer la réponse qui règle ton problème ✅.',
    forums: [
      {
        name: 'Aide entre membres', icon: '🆘', qa: true,
        description: 'Ratio, ports, connexion, hit & run : pose ta question à la communauté.',
        rules: 'Cherche d\'abord dans le Wiki. Pour un problème qui touche ton compte, ouvre plutôt un billet dans Support. Décris ce que tu as essayé, ton client torrent et ce que tu vois. Quand une réponse règle ton problème, marque-la comme solution ✅.',
      },
      {
        name: 'Clients, seedbox et automatisation', icon: '🔌', qa: true,
        description: 'qBittorrent, ruTorrent, Sonarr, Radarr, Prowlarr, seedbox : configurations et astuces.',
        subforums: [
          { name: 'Clients torrent', icon: '🌱', qa: true, description: 'qBittorrent, Transmission, Deluge, ruTorrent...' },
          { name: 'Automatisation (Sonarr, Radarr, Prowlarr)', icon: '🤖', qa: true, description: 'Brancher Seeduction à tes outils : voir aussi les guides du Wiki.' },
          { name: 'Seedbox et hébergement', icon: '☁️', qa: true, description: 'Choisir et configurer une seedbox, un serveur, un NAS.' },
        ],
      },
      { name: 'Lecteur Seeduction et streaming', icon: '▶️', qa: true, description: 'Le lecteur de bureau, la lecture dans le navigateur, les sous-titres et les pistes audio.' },
      { name: 'Qualité, encodage et sous-titres', icon: '📐', description: 'Codecs, résolutions, MediaInfo, synchronisation et création de sous-titres.' },
    ],
  },
  {
    name: 'Partage', icon: '⬆️', description: 'Pour celles et ceux qui publient des torrents.',
    forums: [
      { name: 'Guide de l\'uploader', icon: '📤', description: 'Nommage des releases, NFO, choix de catégorie, bonnes pratiques de partage.', rules: 'Le nommage standard et les règles d\'envoi sont dans le Wiki ; ici, on partage l\'expérience et les astuces.' },
      { name: 'Revue de releases', icon: '🔍', description: 'Demande un avis sur ta release avant ou après l\'envoi (qualité, nommage, NFO).', access: { write: { type: 'UPLOADERS' } } },
    ],
  },
  {
    name: 'La vie de Seeduction', icon: '⭐', description: 'Ce que les autres sections du site ne couvrent pas.',
    forums: [
      { name: 'Trucs et astuces', icon: '🧭', description: 'Comment tirer le meilleur du site : raccourcis, réglages, fonctions méconnues.', rules: 'Pour proposer une nouveauté, utilise plutôt Suggestions ; pour signaler un problème, Support.' },
      { name: 'Discussions sur les nouveautés', icon: '🗨️', description: 'Réagir aux annonces de la page Nouvelles et aux nouvelles fonctions.' },
      { name: 'Salon des donateurs', icon: '❤️', description: 'Un coin tranquille pour celles et ceux qui soutiennent le site.', access: { read: { type: 'DONORS' }, write: { type: 'DONORS' } } },
    ],
  },
  {
    name: 'Adulte (18+)', icon: '🔞', description: 'Réservé aux membres majeurs qui ont activé le contenu pour adultes dans leur compte.',
    access: { read: { type: 'ADULT' } },
    forums: [
      { name: 'Discussions 18+', icon: '💋', description: 'Discussions sur le contenu pour adultes, dans le respect des règles du site.', rules: 'Aucun contenu illégal. Les règles de respect et de consentement s\'appliquent comme partout.' },
    ],
  },
  {
    name: 'Équipe', icon: '🛡️', description: 'Espace privé de l\'équipe (invisible pour les membres).', staffOnly: true,
    forums: [
      { name: 'Modération et décisions', icon: '⚖️', description: 'Cas délicats, sanctions, harmonisation des décisions.' },
      { name: 'Technique et administration', icon: '⚙️', description: 'Déploiements, sauvegardes, incidents, idées techniques.' },
      { name: 'Brouillons d\'annonces', icon: '📝', description: 'Préparer les nouvelles et les événements avant de les publier.' },
    ],
  },
];

// ------------------------------------------------------------------ aperçu et application (logique pure)

export interface StructureItem { path: string; depth: number; kind: 'category' | 'forum' | 'subforum'; icon: string; name: string; status: 'create' | 'exists'; notes: string[] }

export interface ExistingForum { id: string; parentId: string | null; name: string; isCategory: boolean }

const norm = (s: string) => s.trim().toLowerCase();

/** Ce que ferait « Appliquer la structure recommandée » : pour chaque élément, créé ou déjà présent (même nom au même endroit). */
export function planStructure(existing: ExistingForum[], template: SuggestedCategory[] = SUGGESTED_FORUMS): StructureItem[] {
  const out: StructureItem[] = [];
  const find = (parentId: string | null, name: string, isCategory?: boolean) =>
    existing.find((e) => e.parentId === parentId && norm(e.name) === norm(name) && (isCategory === undefined || e.isCategory === isCategory));
  const notesOf = (f: { qa?: boolean; locked?: boolean; staffOnly?: boolean; access?: ForumAccess; rules?: string }) => [
    ...(f.qa ? ['entraide ✅ Résolu'] : []), ...(f.locked ? ['lecture seule'] : []), ...(f.staffOnly ? ['équipe seulement'] : []),
    ...(f.access?.read ? [`lecture : ${f.access.read.type}`] : []), ...(f.access?.write ? [`écriture : ${f.access.write.type}`] : []), ...(f.rules ? ['règles du forum'] : []),
  ];
  const walkForum = (f: SuggestedForum, parent: ExistingForum | null, parentCreated: boolean, path: string, depth: number) => {
    const found = parentCreated ? undefined : find(parent?.id ?? null, f.name, false);
    out.push({ path: `${path} › ${f.name}`, depth, kind: depth >= 2 ? 'subforum' : 'forum', icon: f.icon, name: f.name, status: found ? 'exists' : 'create', notes: found ? [] : notesOf(f) });
    for (const s of f.subforums ?? []) walkForum(s, found ?? null, !found, `${path} › ${f.name}`, depth + 1);
  };
  for (const c of template) {
    const found = find(null, c.name, true);
    out.push({ path: c.name, depth: 0, kind: 'category', icon: c.icon, name: c.name, status: found ? 'exists' : 'create', notes: found ? [] : notesOf({ ...c }) });
    for (const f of c.forums) walkForum(f, found ?? null, !found, c.name, 1);
  }
  return out;
}
