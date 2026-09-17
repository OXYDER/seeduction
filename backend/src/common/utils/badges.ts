export interface BadgeStats {
  uploadsApproved: number;
  uploadedBytes: bigint;
  ratio: number | null;
  bonusPoints: number;
  invitees: number;
  forumPosts: number;
  accountAgeDays: number;
  requestFills: number;
}

export interface BadgeDefinition {
  code: string;
  name: string;
  description: string;
  icon: string;
  check: (s: BadgeStats) => boolean;
}

const GB = 1024 ** 3;
const TB = 1024 ** 4;

export const BADGES: BadgeDefinition[] = [
  {
    code: 'PREMIER_PAS',
    name: 'Premier pas',
    icon: '🌱',
    description: 'Premier torrent approuvé',
    check: (s) => s.uploadsApproved >= 1,
  },
  {
    code: 'UPLOADER_CONFIRME',
    name: 'Uploader confirmé',
    icon: '📦',
    description: '10 torrents approuvés',
    check: (s) => s.uploadsApproved >= 10,
  },
  {
    code: 'UPLOADER_LEGENDAIRE',
    name: 'Uploader légendaire',
    icon: '👑',
    description: '50 torrents approuvés',
    check: (s) => s.uploadsApproved >= 50,
  },
  {
    code: 'SEIGNEUR_DU_SEED',
    name: 'Seigneur du Seed',
    icon: '🌾',
    description: '500 Go envoyés au total',
    check: (s) => Number(s.uploadedBytes) >= 500 * GB,
  },
  {
    code: 'ROI_DU_SEED',
    name: 'Roi du Seed',
    icon: '🔥',
    description: '2 To envoyés au total',
    check: (s) => Number(s.uploadedBytes) >= 2 * TB,
  },
  {
    code: 'RATIO_OR',
    name: "Ratio d'or",
    icon: '⚖️',
    description: 'Ratio de 5.0 ou plus',
    check: (s) => s.ratio !== null && s.ratio >= 5,
  },
  {
    code: 'BOURSE_GARNIE',
    name: 'Bourse bien garnie',
    icon: '💰',
    description: '5000 points bonus accumulés',
    check: (s) => s.bonusPoints >= 5000,
  },
  {
    code: 'RECRUTEUR',
    name: 'Recruteur',
    icon: '🤝',
    description: '3 membres parrainés',
    check: (s) => s.invitees >= 3,
  },
  {
    code: 'PATRIARCHE',
    name: 'Patriarche du clan',
    icon: '🏰',
    description: '10 membres parrainés',
    check: (s) => s.invitees >= 10,
  },
  {
    code: 'ORATEUR',
    name: 'Orateur',
    icon: '🗣️',
    description: '20 messages postés sur le forum',
    check: (s) => s.forumPosts >= 20,
  },
  {
    code: 'VETERAN',
    name: 'Vétéran',
    icon: '⏳',
    description: 'Membre depuis plus d\'un an',
    check: (s) => s.accountAgeDays >= 365,
  },
  {
    code: 'SAUVEUR',
    name: 'Sauveur',
    icon: '🎯',
    description: '5 demandes de la communauté comblées',
    check: (s) => s.requestFills >= 5,
  },
];

export function evaluateBadges(stats: BadgeStats): string[] {
  return BADGES.filter((b) => b.check(stats)).map((b) => b.code);
}
