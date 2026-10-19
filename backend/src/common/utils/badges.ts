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
  return { code, name, icon, description, category, check: (s) => measure(s) >= target, progress: (s) => ({ value: Math.min(target, Math.max(0, measure(s))), target, unit }) };
}

export const BADGES: BadgeDefinition[] = [
  threshold('PREMIER_PAS', 'Premier pas', '🌱', 'Premier torrent approuvé', 'envoi', (s) => s.uploadsApproved, 1),
  threshold('UPLOADER_CONFIRME', 'Uploader confirmé', '📦', '10 torrents approuvés', 'envoi', (s) => s.uploadsApproved, 10),
  threshold('UPLOADER_LEGENDAIRE', 'Uploader légendaire', '👑', '50 torrents approuvés', 'envoi', (s) => s.uploadsApproved, 50),
  threshold('SEIGNEUR_DU_SEED', 'Seigneur du Seed', '🌾', '500 Go envoyés au total', 'partage', (s) => Math.floor(Number(s.uploadedBytes) / GB), 500, 'Go'),
  threshold('ROI_DU_SEED', 'Roi du Seed', '🔥', '2 To envoyés au total', 'partage', (s) => Math.floor(Number(s.uploadedBytes) / GB), Math.round((2 * TB) / GB), 'Go'),
  {
    code: 'RATIO_OR', name: "Ratio d'or", icon: '⚖️', description: 'Ratio de 5.0 ou plus', category: 'partage',
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
    code: 'IRREPROCHABLE', name: 'Irréprochable', icon: '✨', description: '50 torrents terminés, aucun hit & run en cours', category: 'partage',
    check: (s) => s.snatches >= 50 && s.hnrOpen === 0,
    progress: (s) => ({ value: s.hnrOpen > 0 ? Math.min(49, s.snatches) : Math.min(50, s.snatches), target: 50 }),
  },

  // ---- entraide
  threshold('MENTOR', 'Mentor', '🧭', '3 membres parrainés devenus de vrais membres', 'entraide', (s) => s.mentored, 3),
  threshold('SOUS_TITREUR', 'Sous-titreur', '💬', '5 sous-titres partagés', 'entraide', (s) => s.subtitles, 5),
  threshold('MAITRE_SOUS_TITRES', 'Maître des sous-titres', '🎞️', '30 sous-titres partagés', 'entraide', (s) => s.subtitles, 30),

  // ---- communauté
  threshold('COMMENTATEUR', 'Commentateur', '📝', '25 commentaires sur des torrents', 'communaute', (s) => s.comments, 25),
];

export function evaluateBadges(stats: BadgeStats): string[] {
  return BADGES.filter((b) => b.check(stats)).map((b) => b.code);
}
