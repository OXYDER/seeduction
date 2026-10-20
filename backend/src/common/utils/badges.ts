export interface BadgeStats {
  uploadsApproved: number;
  uploadedBytes: bigint;
  ratio: number | null;
  bonusPoints: number;
  invitees: number;
  forumPosts: number;
  accountAgeDays: number;
  requestFills: number;
  /** Heures de seed cumulées sur tous les torrents terminés. */
  seedHours: number;
  /** Torrents terminés dont l'obligation de partage a été remplie. */
  seedOk: number;
  /** Torrents terminés (au total). */
  snatches: number;
  /** Hit & run en cours (arrêté trop tôt, pas encore régularisé). */
  hnrOpen: number;
  /** Fichiers de sous-titres partagés. */
  subtitles: number;
  /** Commentaires sur des torrents. */
  comments: number;
  /** Membres parrainés qui sont devenus de vrais membres (au-delà du rang « Nouveau »). */
  mentored: number;
  /** Notes données à des torrents. */
  ratings: number;
  /** Fichiers regardés au moins en partie dans le lecteur Seeduction. */
  watched: number;
  /** Quiz quotidiens terminés. */
  quizzes: number;
  /** Tours de roue de la fortune. */
  wheelSpins: number;
  /** Pronostics LNH gagnés. */
  picksWon: number;
  /** Badges déjà obtenus (pour les badges de collection). */
  badgesEarned: number;
}

export type BadgeCategory = 'envoi' | 'partage' | 'communaute' | 'entraide' | 'anciennete';
export const BADGE_CATEGORIES: Record<BadgeCategory, { label: string; icon: string }> = {
  envoi: { label: 'Envoi', icon: '📦' },
  partage: { label: 'Partage et seed', icon: '🌾' },
  communaute: { label: 'Communauté', icon: '💬' },
  entraide: { label: 'Entraide', icon: '🤝' },
  anciennete: { label: 'Ancienneté', icon: '⏳' },
};

export interface BadgeProgress { value: number; target: number; unit?: string }

export interface BadgeDefinition {
  code: string;
  /** Points bonus versés une seule fois, à l'obtention du badge. */
  points: number;
  name: string;
  description: string;
  icon: string;
  category: BadgeCategory;
  check: (s: BadgeStats) => boolean;
  /** Où en est le membre (pour la barre de progression de la page « Réalisations »). */
  progress: (s: BadgeStats) => BadgeProgress;
}

const GB = 1000 ** 3;
const TB = 1000 ** 4;

/** Badge qui s'obtient en atteignant un seuil sur une mesure : le test et la progression en découlent. */
function threshold(code: string, name: string, icon: string, description: string, category: BadgeCategory, measure: (s: BadgeStats) => number, target: number, unit?: string): BadgeDefinition {
  return { code, points: 0, name, icon, description, category, check: (s) => measure(s) >= target, progress: (s) => ({ value: Math.min(target, Math.max(0, measure(s))), target, unit }) };
}

const DEFINITIONS: BadgeDefinition[] = [
  threshold('PREMIER_PAS', 'Premier pas', '🌱', 'Premier torrent approuvé', 'envoi', (s) => s.uploadsApproved, 1),
  threshold('UPLOADER_CONFIRME', 'Uploader confirmé', '📦', '10 torrents approuvés', 'envoi', (s) => s.uploadsApproved, 10),
  threshold('UPLOADER_LEGENDAIRE', 'Uploader légendaire', '👑', '50 torrents approuvés', 'envoi', (s) => s.uploadsApproved, 50),
  threshold('SEIGNEUR_DU_SEED', 'Seigneur du Seed', '🌾', '500 Go envoyés au total', 'partage', (s) => Math.floor(Number(s.uploadedBytes) / GB), 500, 'Go'),
  threshold('ROI_DU_SEED', 'Roi du Seed', '🔥', '2 To envoyés au total', 'partage', (s) => Math.floor(Number(s.uploadedBytes) / GB), Math.round((2 * TB) / GB), 'Go'),
  {
    code: 'RATIO_OR', points: 0, name: "Ratio d'or", icon: '⚖️', description: 'Ratio de 5.0 ou plus', category: 'partage',
    check: (s) => s.ratio !== null && s.ratio >= 5,
    progress: (s) => ({ value: Math.min(5, Math.max(0, Math.round((s.ratio ?? 0) * 10) / 10)), target: 5 }),
  },
  threshold('BOURSE_GARNIE', 'Bourse bien garnie', '💰', '5000 points bonus accumulés', 'communaute', (s) => s.bonusPoints, 5000, 'points'),
  threshold('RECRUTEUR', 'Recruteur', '🤝', '3 membres parrainés', 'entraide', (s) => s.invitees, 3),
  threshold('PATRIARCHE', 'Patriarche du clan', '🏰', '10 membres parrainés', 'entraide', (s) => s.invitees, 10),
  threshold('ORATEUR', 'Orateur', '🗣️', '20 messages postés sur le forum', 'communaute', (s) => s.forumPosts, 20),
  threshold('SAUVEUR', 'Sauveur', '🎯', '5 demandes de la communauté comblées', 'entraide', (s) => s.requestFills, 5),

  // ---- ancienneté
  threshold('FIDELE', 'Fidèle', '🕯️', 'Membre depuis 3 mois', 'anciennete', (s) => s.accountAgeDays, 90, 'jours'),
  threshold('VETERAN', 'Vétéran', '⏳', "Membre depuis plus d'un an", 'anciennete', (s) => s.accountAgeDays, 365, 'jours'),
  threshold('ANCIEN', 'Ancien', '🏛️', 'Membre depuis 2 ans', 'anciennete', (s) => s.accountAgeDays, 730, 'jours'),
  threshold('PILIER', 'Pilier de Seeduction', '🗿', 'Membre depuis 3 ans', 'anciennete', (s) => s.accountAgeDays, 1095, 'jours'),

  // ---- partage : durée de seed et fiabilité
  threshold('GARDIEN', 'Gardien du seed', '🛡️', '500 heures de seed cumulées', 'partage', (s) => Math.floor(s.seedHours), 500, 'h'),
  threshold('SENTINELLE', 'Sentinelle', '🗼', '5000 heures de seed cumulées', 'partage', (s) => Math.floor(s.seedHours), 5000, 'h'),
  threshold('BON_ELEVE', 'Bon élève', '📗', "25 torrents dont le partage obligatoire est rempli", 'partage', (s) => s.seedOk, 25),
  threshold('EXEMPLAIRE', 'Exemplaire', '🏅', "100 torrents dont le partage obligatoire est rempli", 'partage', (s) => s.seedOk, 100),
  {
    code: 'IRREPROCHABLE', points: 0, name: 'Irréprochable', icon: '✨', description: '50 torrents terminés, aucun hit & run en cours', category: 'partage',
    check: (s) => s.snatches >= 50 && s.hnrOpen === 0,
    progress: (s) => ({ value: s.hnrOpen > 0 ? Math.min(49, s.snatches) : Math.min(50, s.snatches), target: 50 }),
  },

  // ---- entraide
  threshold('MENTOR', 'Mentor', '🧭', '3 membres parrainés devenus de vrais membres', 'entraide', (s) => s.mentored, 3),
  threshold('SOUS_TITREUR', 'Sous-titreur', '💬', '5 sous-titres partagés', 'entraide', (s) => s.subtitles, 5),
  threshold('MAITRE_SOUS_TITRES', 'Maître des sous-titres', '🎞️', '30 sous-titres partagés', 'entraide', (s) => s.subtitles, 30),

  // ---- communauté
  threshold('COMMENTATEUR', 'Commentateur', '📝', '25 commentaires sur des torrents', 'communaute', (s) => s.comments, 25),

  // ---- envoi
  threshold('CONTRIBUTEUR', 'Contributeur', '🧩', '5 torrents approuvés', 'envoi', (s) => s.uploadsApproved, 5),
  threshold('BIBLIOTHECAIRE', 'Bibliothécaire', '📚', '25 torrents approuvés', 'envoi', (s) => s.uploadsApproved, 25),
  threshold('ARCHIVISTE', 'Archiviste', '🗃️', '100 torrents approuvés', 'envoi', (s) => s.uploadsApproved, 100),
  threshold('GRAND_ARCHIVISTE', 'Grand archiviste', '🏛️', '250 torrents approuvés', 'envoi', (s) => s.uploadsApproved, 250),

  // ---- partage : volume, ratio, durée
  threshold('PREMIERS_GO', 'Premiers Go', '💧', '100 Go envoyés au total', 'partage', (s) => Math.floor(Number(s.uploadedBytes) / GB), 100, 'Go'),
  threshold('DIX_TERAS', 'Dix téra', '🌊', '10 To envoyés au total', 'partage', (s) => Math.floor(Number(s.uploadedBytes) / GB), Math.round((10 * TB) / GB), 'Go'),
  threshold('CINQUANTE_TERAS', 'Océan de données', '🌌', '50 To envoyés au total', 'partage', (s) => Math.floor(Number(s.uploadedBytes) / GB), Math.round((50 * TB) / GB), 'Go'),
  {
    code: 'BON_PARTAGEUR', points: 0, name: 'Bon partageur', icon: '⚖️', description: 'Ratio de 2.0 ou plus', category: 'partage',
    check: (s) => s.ratio !== null && s.ratio >= 2,
    progress: (s) => ({ value: Math.min(2, Math.max(0, Math.round((s.ratio ?? 0) * 10) / 10)), target: 2 }),
  },
  {
    code: 'RATIO_LEGENDE', points: 0, name: 'Ratio de légende', icon: '🌠', description: 'Ratio de 10.0 ou plus', category: 'partage',
    check: (s) => s.ratio !== null && s.ratio >= 10,
    progress: (s) => ({ value: Math.min(10, Math.max(0, Math.round((s.ratio ?? 0) * 10) / 10)), target: 10 }),
  },
  threshold('PHARE', 'Phare', '🔦', '2000 heures de seed cumulées', 'partage', (s) => Math.floor(s.seedHours), 2000, 'h'),
  threshold('ETERNEL', 'Éternel', '♾️', '20 000 heures de seed cumulées', 'partage', (s) => Math.floor(s.seedHours), 20000, 'h'),
  threshold('PAROLE_TENUE', 'Parole tenue', '🤝', '250 torrents dont le partage obligatoire est rempli', 'partage', (s) => s.seedOk, 250),
  threshold('CURIEUX', 'Curieux', '🔎', '100 torrents terminés', 'partage', (s) => s.snatches, 100),
  threshold('INSATIABLE', 'Insatiable', '🍿', '500 torrents terminés', 'partage', (s) => s.snatches, 500),

  // ---- communauté
  threshold('CRITIQUE', 'Critique', '🎭', '100 commentaires sur des torrents', 'communaute', (s) => s.comments, 100),
  threshold('CHRONIQUEUR', 'Chroniqueur', '🖋️', '500 commentaires sur des torrents', 'communaute', (s) => s.comments, 500),
  threshold('HABITUE_DU_FORUM', 'Habitué du forum', '💭', '100 messages postés sur le forum', 'communaute', (s) => s.forumPosts, 100),
  threshold('VOIX_DU_FORUM', 'Voix du forum', '📣', '500 messages postés sur le forum', 'communaute', (s) => s.forumPosts, 500),
  threshold('GROSSE_FORTUNE', 'Grosse fortune', '🏦', '25 000 points bonus accumulés', 'communaute', (s) => s.bonusPoints, 25000, 'points'),
  threshold('NOTEUR', 'Noteur', '⭐', '25 torrents notés', 'communaute', (s) => s.ratings, 25),
  threshold('NOTEUR_PRO', 'Noteur professionnel', '🌟', '200 torrents notés', 'communaute', (s) => s.ratings, 200),
  threshold('CINEPHILE', 'Cinéphile', '🎬', '10 fichiers regardés dans le lecteur Seeduction', 'communaute', (s) => s.watched, 10),
  threshold('GRAND_CINEPHILE', 'Grand cinéphile', '🎞️', '50 fichiers regardés dans le lecteur Seeduction', 'communaute', (s) => s.watched, 50),
  threshold('CERVEAU', 'Cerveau', '🧠', '10 quiz quotidiens terminés', 'communaute', (s) => s.quizzes, 10),
  threshold('ENCYCLOPEDIE', 'Encyclopédie vivante', '📖', '50 quiz quotidiens terminés', 'communaute', (s) => s.quizzes, 50),
  threshold('CHANCEUX', 'Chanceux', '🍀', '25 tours de roue de la fortune', 'communaute', (s) => s.wheelSpins, 25),
  threshold('FAVORI_DE_LA_FORTUNE', 'Favori de la fortune', '🎡', '150 tours de roue de la fortune', 'communaute', (s) => s.wheelSpins, 150),
  threshold('DEVIN', 'Devin', '🔮', '10 pronostics LNH gagnés', 'communaute', (s) => s.picksWon, 10),
  threshold('ORACLE', 'Oracle', '🏒', '50 pronostics LNH gagnés', 'communaute', (s) => s.picksWon, 50),
  threshold('COLLECTIONNEUR', 'Collectionneur', '🏆', '10 badges obtenus', 'communaute', (s) => s.badgesEarned, 10),
  threshold('GRAND_COLLECTIONNEUR', 'Grand collectionneur', '👑', '30 badges obtenus', 'communaute', (s) => s.badgesEarned, 30),

  // ---- entraide
  threshold('CHEF_DE_TRIBU', 'Chef de tribu', '⛺', '25 membres parrainés', 'entraide', (s) => s.invitees, 25),
  threshold('HEROS_DES_DEMANDES', 'Héros des demandes', '🦸', '25 demandes de la communauté comblées', 'entraide', (s) => s.requestFills, 25),
  threshold('GRAND_MENTOR', 'Grand mentor', '🎓', '10 membres parrainés devenus de vrais membres', 'entraide', (s) => s.mentored, 10),
  threshold('LEGENDE_DES_SOUS_TITRES', 'Légende des sous-titres', '📜', '100 sous-titres partagés', 'entraide', (s) => s.subtitles, 100),

  // ---- ancienneté
  threshold('GARDIEN_DU_TEMPLE', 'Gardien du temple', '🏯', 'Membre depuis 4 ans', 'anciennete', (s) => s.accountAgeDays, 1460, 'jours'),
  threshold('MONUMENT', 'Monument', '🗽', 'Membre depuis 5 ans', 'anciennete', (s) => s.accountAgeDays, 1825, 'jours'),
];

/**
 * Points bonus versés une seule fois à l'obtention de chaque badge (plus un badge est difficile, plus il rapporte). Les badges déjà obtenus avant l'arrivée de ces points ne sont pas payés après coup.
 */
export const BADGE_POINTS: Record<string, number> = {
  PREMIER_PAS: 25, CONTRIBUTEUR: 50, UPLOADER_CONFIRME: 100, BIBLIOTHECAIRE: 200, UPLOADER_LEGENDAIRE: 400, ARCHIVISTE: 750, GRAND_ARCHIVISTE: 1500,
  PREMIERS_GO: 50, SEIGNEUR_DU_SEED: 150, ROI_DU_SEED: 400, DIX_TERAS: 600, CINQUANTE_TERAS: 1500,
  BON_PARTAGEUR: 75, RATIO_OR: 300, RATIO_LEGENDE: 500,
  GARDIEN: 100, PHARE: 250, SENTINELLE: 400, ETERNEL: 800,
  BON_ELEVE: 100, EXEMPLAIRE: 300, PAROLE_TENUE: 600, IRREPROCHABLE: 150, CURIEUX: 75, INSATIABLE: 250,
  ORATEUR: 50, HABITUE_DU_FORUM: 200, VOIX_DU_FORUM: 600, COMMENTATEUR: 50, CRITIQUE: 150, CHRONIQUEUR: 500,
  BOURSE_GARNIE: 100, GROSSE_FORTUNE: 300, NOTEUR: 75, NOTEUR_PRO: 300, CINEPHILE: 100, GRAND_CINEPHILE: 400,
  CERVEAU: 100, ENCYCLOPEDIE: 400, CHANCEUX: 75, FAVORI_DE_LA_FORTUNE: 300, DEVIN: 100, ORACLE: 400, COLLECTIONNEUR: 150, GRAND_COLLECTIONNEUR: 600,
  RECRUTEUR: 100, PATRIARCHE: 400, CHEF_DE_TRIBU: 800, MENTOR: 200, GRAND_MENTOR: 600, SAUVEUR: 150, HEROS_DES_DEMANDES: 500, SOUS_TITREUR: 75, MAITRE_SOUS_TITRES: 300, LEGENDE_DES_SOUS_TITRES: 800,
  FIDELE: 50, VETERAN: 150, ANCIEN: 300, PILIER: 500, GARDIEN_DU_TEMPLE: 800, MONUMENT: 1200,
};

export const BADGES: BadgeDefinition[] = DEFINITIONS.map((b) => ({ ...b, points: BADGE_POINTS[b.code] ?? 0 }));

export function evaluateBadges(stats: BadgeStats): string[] {
  return BADGES.filter((b) => b.check(stats)).map((b) => b.code);
}
