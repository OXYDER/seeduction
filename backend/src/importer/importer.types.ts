import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/** Réglages d'une source d'import (sans secret). */
export interface ImportConfig {
  /** Client torrent des membres (envoi de plusieurs torrents) ; l'import du staff est toujours qBittorrent. L'adresse, l'identifiant et les filtres sont dans `qbit` pour tous les clients. */
  client?: 'qbittorrent' | 'transmission' | 'rutorrent';
  qbit: {
    url: string; username?: string; category?: string; tag?: string; doneTag?: string;
    /** Étiquette posée dans CE qBittorrent sur une release qui fait interférence avec une release déjà sur Seeduction (jamais déplacée ni supprimée). */
    conflictTag?: string;
    /** Facultatif : catégorie qBittorrent où ranger aussi ces releases (attention : avec la gestion automatique des torrents de qBittorrent, changer de catégorie déplace les fichiers). */
    conflictCategory?: string;
  };
  /** Accès FTP aux fichiers de la seedbox : pour lire le .nfo ou calculer le MediaInfo (le serveur ne voit pas ces fichiers autrement). */
  ftp?: { host: string; port?: number; username: string; secure?: boolean; rejectUnauthorized?: boolean; headMB?: number; searchDepth?: number };
  mediainfo?: boolean;
  /** Facultative : sert seulement quand ni une règle ni la détection automatique ne trouvent la catégorie. */
  defaultCategory?: string;
  /** Détecter la catégorie d'après le nom (film, série, sport, musique...) puis la fiche TMDB (animation, émission, documentaire). */
  autoCategory?: boolean;
  /** Lire la catégorie de l'article RSS qui a amené la release (titre « [Catégorie] Nom » ou description) : sert à ranger au bon endroit. */
  readFeedCategory?: boolean;
  /** Relier chaque release à sa fiche (TMDB pour les films et séries : affiche, synopsis, distribution...) quand le titre correspond exactement. */
  attachMetadata?: boolean;
  /** Une release dont la fiche (TMDB) ou la catégorie n'est pas sûre est mise dans « À vérifier » : tu la complètes à la main, puis tu valides l'import. */
  reviewUnmatched?: boolean;
  categoryRules?: { match: string; category: string }[];
  include?: string[];
  exclude?: string[];
  description?: string;
  /** Approuver directement les torrents importés (par défaut). Sinon ils attendent la validation du staff. */
  autoApprove?: boolean;
  seedOnSeeduction?: boolean;
  seedCategory?: string;
  skipChecking?: boolean;
  intervalMinutes?: number;
  maxPerRun?: number;
  delaySeconds?: number;
}

export interface ImportSecrets { qbitPassword?: string; ftpPassword?: string }

const key = () => createHash('sha256').update('seeduction-importer:' + (process.env.JWT_SECRET ?? 'change-me-in-.env')).digest();

/** Chiffre les mots de passe (AES-256-GCM) avant de les ranger en base : un export de la base ne les montre pas en clair. */
export function sealSecrets(s: ImportSecrets): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(s), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

export function openSecrets(blob: string): ImportSecrets {
  if (!blob) return {};
  try {
    const raw = Buffer.from(blob, 'base64');
    const d = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
  } catch {
    return {}; // JWT_SECRET changé : les mots de passe sont à ressaisir
  }
}
