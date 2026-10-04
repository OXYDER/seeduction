import { BadRequestException } from '@nestjs/common';

/** Réglages du support, modifiables par les administrateurs (Staff > Support > Réglages), stockés dans SiteSetting « support ». */
export interface SupportConfig {
  /** Le centre de support est ouvert (billets et assistant). */
  enabled: boolean;
  /** Canal de chat « Support » ; vide = le canal dont l'adresse est « support ». */
  channelId: string | null;
  /** L'assistant IA répond dans le canal Support. */
  aiEnabled: boolean;
  /** ALWAYS : l'assistant répond toujours (l'équipe peut reprendre la main) ; NO_STAFF : seulement quand aucun membre de l'équipe n'est en ligne. */
  aiMode: 'ALWAYS' | 'NO_STAFF';
  aiProvider: 'auto' | 'anthropic' | 'gemini';
  /** Modèle (vide = celui par défaut du fournisseur). */
  aiModel: string;
  /** Consignes supplémentaires ajoutées à celles de l'assistant (ton, règles propres au site...). */
  aiExtra: string;
  botName: string;
  /** Après autant de réponses de l'assistant sans que le problème soit réglé, un billet est proposé. */
  maxAnswersBeforeOffer: number;
  /** Réponses de l'assistant par heure et par membre. */
  aiHourlyLimit: number;
  /** Quand l'équipe répond à un membre, l'assistant se tait pour lui pendant ce nombre de minutes. */
  takeoverMinutes: number;
  maxOpenPerMember: number;
  /** Un billet « répondu » sans nouvelle du membre devient « résolu » après ce nombre de jours (0 = jamais). */
  autoResolveDays: number;
  /** Un billet « résolu » est clos après ce nombre de jours (0 = jamais). */
  autoCloseDays: number;
  notifyStaff: boolean;
  emailOnReply: boolean;
  /** Texte libre affiché sur la page Support (horaires de l'équipe, délai de réponse habituel...). */
  hoursText: string;
  /** Message d'accueil de l'assistant au bas de la page Support / dans le canal. */
  welcome: string;
}

export const DEFAULT_SUPPORT: SupportConfig = {
  enabled: true,
  channelId: null,
  aiEnabled: true,
  aiMode: 'ALWAYS',
  aiProvider: 'auto',
  aiModel: '',
  aiExtra: '',
  botName: 'Assistant SDT',
  maxAnswersBeforeOffer: 3,
  aiHourlyLimit: 20,
  takeoverMinutes: 15,
  maxOpenPerMember: 5,
  autoResolveDays: 5,
  autoCloseDays: 7,
  notifyStaff: true,
  emailOnReply: true,
  hoursText: '',
  welcome: 'Bonjour ! Je suis l’assistant de Seeduction. Pose ta question ici : je cherche la réponse dans le wiki, et si je n’y arrive pas, l’équipe SDT ou un billet de support prendra le relais.',
};

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
};
const text = (v: unknown, max: number, fallback: string) => (typeof v === 'string' ? v.trim().slice(0, max) : fallback);

/** Valide un réglage venant du staff et le complète avec les valeurs par défaut. */
export function sanitizeSupportConfig(input: any, base: SupportConfig = DEFAULT_SUPPORT): SupportConfig {
  if (!input || typeof input !== 'object') throw new BadRequestException('Réglages invalides');
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const botName = text(input.botName, 40, base.botName);
  if (botName.length < 2) throw new BadRequestException('Le nom de l’assistant doit faire au moins 2 caractères');
  return {
    enabled: bool(input.enabled, base.enabled),
    channelId: input.channelId === null || input.channelId === '' ? null : typeof input.channelId === 'string' ? input.channelId : base.channelId,
    aiEnabled: bool(input.aiEnabled, base.aiEnabled),
    aiMode: pick(input.aiMode, ['ALWAYS', 'NO_STAFF'] as const, base.aiMode),
    aiProvider: pick(input.aiProvider, ['auto', 'anthropic', 'gemini'] as const, base.aiProvider),
    aiModel: text(input.aiModel, 80, base.aiModel),
    aiExtra: text(input.aiExtra, 2000, base.aiExtra),
    botName,
    maxAnswersBeforeOffer: clampInt(input.maxAnswersBeforeOffer, 1, 10, base.maxAnswersBeforeOffer),
    aiHourlyLimit: clampInt(input.aiHourlyLimit, 1, 200, base.aiHourlyLimit),
    takeoverMinutes: clampInt(input.takeoverMinutes, 0, 240, base.takeoverMinutes),
    maxOpenPerMember: clampInt(input.maxOpenPerMember, 1, 50, base.maxOpenPerMember),
    autoResolveDays: clampInt(input.autoResolveDays, 0, 90, base.autoResolveDays),
    autoCloseDays: clampInt(input.autoCloseDays, 0, 365, base.autoCloseDays),
    notifyStaff: bool(input.notifyStaff, base.notifyStaff),
    emailOnReply: bool(input.emailOnReply, base.emailOnReply),
    hoursText: text(input.hoursText, 300, base.hoursText),
    welcome: text(input.welcome, 600, base.welcome),
  };
}

export const TICKET_STATUS_LABEL: Record<string, string> = { OPEN: 'Ouvert', ANSWERED: 'Répondu', RESOLVED: 'Résolu', CLOSED: 'Fermé' };
export const TICKET_PRIORITY_LABEL: Record<string, string> = { LOW: 'Basse', NORMAL: 'Normale', HIGH: 'Haute', URGENT: 'Urgente' };

/** Catégories créées au premier démarrage (le staff peut les modifier). */
export const DEFAULT_CATEGORIES = [
  { name: 'Compte et connexion', icon: '🔐', description: 'Mot de passe, 2FA, accès, invitation' },
  { name: 'Ratio, points et hit & run', icon: '📊', description: 'Ratio, points bonus, hit & run, freeleech' },
  { name: 'Torrents et téléchargements', icon: '⬇️', description: 'Client BitTorrent, erreur de tracker, torrent mort' },
  { name: 'Envoi de torrents', icon: '⬆️', description: 'Règles d’upload, torrent refusé, fiche, NFO' },
  { name: 'Lecteur Seeduction', icon: '🖥️', description: 'Application de bureau et lecture en ligne' },
  { name: 'Signaler un problème', icon: '🐞', description: 'Bug du site, contenu à retirer' },
  { name: 'Autre', icon: '💬', description: 'Tout le reste' },
];

export const DEFAULT_CANNED = [
  { title: 'Bienvenue au support', content: 'Bonjour,\n\nMerci d’avoir contacté le support de Seeduction. Je prends ton billet en charge.\n\n' },
  { title: 'Plus de précisions', content: 'Pour avancer, peux-tu nous donner plus de détails : ce que tu fais exactement, le message d’erreur affiché (une capture d’écran aide beaucoup) et ton client BitTorrent avec sa version ?' },
  { title: 'Réglé : résolution', content: 'Bonne nouvelle, ton problème devrait être réglé de notre côté. Si ce n’est pas le cas, réponds simplement à ce billet : il se rouvrira tout seul.' },
];
