const num = (name: string, fallback: number) => {
  const raw = process.env[name];
  const n = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

/** Réglages de l'économie de ratio (surchargeables dans backend/.env). */
export const ECONOMY = {
  /** Un torrent complété doit être seedé au moins ce nombre d'heures... */
  hnrSeedHours: num('HNR_SEED_HOURS', 72),
  /** ... ou atteindre ce ratio d'upload sur ce torrent (1 = autant envoyé que la taille du torrent). */
  hnrRatio: num('HNR_RATIO', 1),
  /** Délai laissé après la fin du téléchargement avant de considérer un « hit & run ». */
  hnrGraceHours: num('HNR_GRACE_HOURS', 48),
  /** Nombre de hit & run non régularisés au-delà duquel les nouveaux téléchargements sont bloqués. */
  hnrLimit: num('HNR_LIMIT', 5),
  /** Le ratio minimum ne s'applique qu'après avoir téléchargé ce volume (en Go) : période de grâce des nouveaux. */
  ratioGraceGb: num('RATIO_GRACE_GB', 5),
  /** Points bonus gagnés par heure et par torrent seedé. */
  bonusPerTorrentHour: num('BONUS_PER_TORRENT_HOUR', 1),
  /** Plafond de torrents comptés par heure (évite l'abus par milliers de petits torrents). */
  bonusMaxTorrents: num('BONUS_MAX_TORRENTS', 200),
};

export const ANNOUNCE_INTERVAL_SECONDS = 1800;

/** Rangs automatiques, du plus élevé au plus bas ; le premier dont toutes les conditions sont remplies s'applique. */
export const MEMBER_CLASSES = [
  { id: 'VETERAN', weeks: 26, uploadGb: 2000, ratio: 2 },
  { id: 'ELITE', weeks: 12, uploadGb: 500, ratio: 1.5 },
  { id: 'POWER_USER', weeks: 4, uploadGb: 50, ratio: 1.05 },
  { id: 'MEMBRE', weeks: 1, uploadGb: 0, ratio: 0.5 },
] as const;

export const CLASS_LABELS: Record<string, string> = {
  NOUVEAU: 'Nouveau', MEMBRE: 'Membre', POWER_USER: 'Power User', ELITE: 'Élite', VETERAN: 'Vétéran',
};

/** Invitations ouvertes en même temps, selon le rang (le staff n'a pas de limite). */
export const INVITE_QUOTA: Record<string, number> = { NOUVEAU: 0, MEMBRE: 0, POWER_USER: 2, ELITE: 5, VETERAN: 10 };

/** Boutique bonus : coût en points et effet. */
export const SHOP_ITEMS = [
  { id: 'upload_5gb', label: '5 Go d\'upload', cost: 500, description: 'Ajoute 5 Go à ton upload.' },
  { id: 'upload_20gb', label: '20 Go d\'upload', cost: 1800, description: 'Ajoute 20 Go à ton upload (10 % moins cher).' },
  { id: 'freeleech_token', label: 'Jeton freeleech', cost: 300, description: 'À dépenser sur un torrent : son téléchargement ne compte pas dans ton ratio pendant 7 jours.' },
  { id: 'invite', label: 'Invitation', cost: 2000, description: 'Un code d\'invitation valable 7 jours.' },
] as const;
