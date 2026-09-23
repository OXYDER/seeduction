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

/** Boutique bonus : coût en points et effet. */
export const SHOP_ITEMS = [
  { id: 'upload_5gb', label: '5 Go d\'upload', cost: 500, description: 'Ajoute 5 Go à ton upload.' },
  { id: 'upload_20gb', label: '20 Go d\'upload', cost: 1800, description: 'Ajoute 20 Go à ton upload (10 % moins cher).' },
  { id: 'freeleech_token', label: 'Jeton freeleech', cost: 300, description: 'À dépenser sur un torrent : son téléchargement ne compte pas dans ton ratio pendant 7 jours.' },
  { id: 'invite', label: 'Invitation', cost: 2000, description: 'Un code d\'invitation valable 7 jours.' },
] as const;
