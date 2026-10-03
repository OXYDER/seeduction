import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ECONOMY, INVITE_QUOTA, MEMBER_CLASSES, SHOP_ITEMS, SITE } from '../common/utils/economy';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';

interface Field {
  key: string;
  group: string;
  label: string;
  help?: string;
  min: number;
  max: number;
  step: number;
  int?: boolean;
  get: () => number;
  set: (v: number) => void;
}

const CLASS_NAMES: Record<string, string> = { NOUVEAU: 'Nouveau', MEMBRE: 'Membre', POWER_USER: 'Power User', ELITE: 'Élite', VETERAN: 'Vétéran' };
const eco = (key: keyof typeof ECONOMY, group: string, label: string, min: number, max: number, step: number, help?: string, int = false): Field => ({
  key: `eco.${key}`, group, label, help, min, max, step, int, get: () => ECONOMY[key], set: (v) => { (ECONOMY as any)[key] = v; },
});

const FIELDS: Field[] = [
  eco('welcomeUploadGb', 'Cadeau de bienvenue', 'Upload offert à l\'inscription (Go)', 0, 100000, 1, 'Ajouté à l\'upload d\'un nouveau membre pour qu\'il ne commence pas à 0.'),
  eco('welcomeFreeleechDays', 'Cadeau de bienvenue', 'Freeleech personnel à l\'inscription (jours)', 0, 365, 1, 'Pendant ce délai, ses téléchargements ne comptent pas dans son ratio.', true),
  {
    key: 'site.defaultMinRatio', group: 'Ratio', label: 'Ratio minimum des nouveaux membres', help: 'Sous ce ratio (après la période de grâce), les nouveaux téléchargements sont refusés. Chaque membre peut ensuite avoir le sien.',
    min: 0, max: 20, step: 0.05, get: () => SITE.defaultMinRatio, set: (v) => { SITE.defaultMinRatio = v; },
  },
  eco('ratioGraceGb', 'Ratio', 'Période de grâce (Go téléchargés avant que le ratio minimum s\'applique)', 0, 100000, 1),
  eco('hnrSeedHours', 'Hit & run', 'Heures de seed requises par torrent', 0, 2000, 1, 'Un torrent complété doit être seedé au moins ce temps...', true),
  eco('hnrRatio', 'Hit & run', 'Ou ratio d\'upload sur ce torrent', 0, 100, 0.05, '... ou atteindre ce ratio (1 = autant envoyé que la taille du torrent).'),
  eco('hnrGraceHours', 'Hit & run', 'Délai de grâce après la fin du téléchargement (heures)', 0, 2000, 1, 'Avant ce délai, un torrent qui ne seede plus n\'est pas encore un hit & run.', true),
  eco('hnrLimit', 'Hit & run', 'Hit & run non régularisés avant blocage', 0, 1000, 1, 'Au-delà, les nouveaux téléchargements sont bloqués.', true),
  eco('hnrClearBase', 'Hit & run', 'Effacer un hit & run avec des points : prix de base', 0, 1000000, 5, 'Prix de départ pour effacer un hit & run avec des points bonus.', true),
  eco('hnrClearPerHour', 'Hit & run', 'Effacer un hit & run : points par heure de seed manquante', 0, 10000, 1, undefined, true),
  eco('hnrClearRepeat', 'Hit & run', 'Effacer un hit & run : supplément par effacement des 30 derniers jours', 0, 100000, 5, 'Décourage de payer au lieu de seeder, fois après fois.', true),
  eco('hnrClearMax', 'Hit & run', 'Effacer un hit & run : prix maximum', 0, 10000000, 5, undefined, true),
  eco('transferMin', 'Points bonus', 'Transfert de points : montant minimum', 1, 100000, 1, undefined, true),
  eco('transferDailyMax', 'Points bonus', 'Transfert de points : maximum envoyé par 24 h', 0, 10000000, 10, '0 = transferts désactivés.', true),
  eco('bonusPerTorrentHour', 'Points bonus', 'Points par heure et par torrent seedé', 0, 1000, 0.1),
  eco('bonusMaxTorrents', 'Points bonus', 'Plafond de torrents comptés par heure', 0, 100000, 1, undefined, true),
  eco('deadAfterHours', 'Torrents morts et re-seed', 'Heures à 0 seeder avant « mort »', 1, 10000, 1, undefined, true),
  eco('reseedExclusionHours', 'Torrents morts et re-seed', 'Exclusion de la récompense : heures de seed avant la mort', 0, 1000, 1, undefined, true),
  eco('reseedRewardBase', 'Torrents morts et re-seed', 'Récompense de re-seed : base', 0, 100000, 1),
  eco('reseedRewardPerGb', 'Torrents morts et re-seed', 'Récompense de re-seed : par Go', 0, 1000, 0.1),
  eco('reseedRewardSizeCap', 'Torrents morts et re-seed', 'Récompense de re-seed : plafond en Go', 0, 100000, 1),
  eco('reseedRewardPerDay', 'Torrents morts et re-seed', 'Récompense de re-seed : par jour resté mort', 0, 1000, 0.5),
  eco('reseedRewardDaysCap', 'Torrents morts et re-seed', 'Récompense de re-seed : plafond en jours', 0, 3650, 1),
  eco('reseedRewardMax', 'Torrents morts et re-seed', 'Récompense de re-seed : maximum', 0, 1000000, 1),
  ...SHOP_ITEMS.map((item): Field => ({
    key: `shop.${item.id}`, group: 'Boutique bonus', label: `Prix : ${item.label}`, min: 0, max: 10_000_000, step: 1, int: true,
    get: () => item.cost, set: (v) => { (item as any).cost = v; },
  })),
  ...MEMBER_CLASSES.flatMap((c): Field[] => [
    { key: `rank.${c.id}.weeks`, group: 'Rangs automatiques', label: `${CLASS_NAMES[c.id]} : ancienneté (semaines)`, min: 0, max: 520, step: 1, int: true, get: () => c.weeks, set: (v) => { (c as any).weeks = v; } },
    { key: `rank.${c.id}.uploadGb`, group: 'Rangs automatiques', label: `${CLASS_NAMES[c.id]} : upload (Go)`, min: 0, max: 10_000_000, step: 1, get: () => c.uploadGb, set: (v) => { (c as any).uploadGb = v; } },
    { key: `rank.${c.id}.ratio`, group: 'Rangs automatiques', label: `${CLASS_NAMES[c.id]} : ratio`, min: 0, max: 100, step: 0.05, get: () => c.ratio, set: (v) => { (c as any).ratio = v; } },
  ]),
  ...Object.keys(INVITE_QUOTA).map((id): Field => ({
    key: `invite.${id}`, group: 'Invitations ouvertes en même temps', label: CLASS_NAMES[id] ?? id, min: 0, max: 1000, step: 1, int: true,
    get: () => INVITE_QUOTA[id], set: (v) => { INVITE_QUOTA[id] = v; },
  })),
];

const SETTING_KEY = 'siteConfig';

/**
 * Paramètres du tracker modifiables depuis Admin > Paramètres (cadeau de bienvenue, ratio minimum, hit & run, points bonus,
 * rangs, prix de la boutique...). Les valeurs de départ viennent du code / de backend/.env ; ce qui est modifié ici est
 * gardé en base et réappliqué à chaque démarrage. Les réglages s'appliquent tout de suite, sans redémarrer.
 */
@Injectable()
export class SiteConfigService implements OnModuleInit {
  private log = new Logger('SiteConfig');
  private defaults = new Map<string, number>();

  constructor(private settings: SettingsService, private prisma: PrismaService) {}

  async onModuleInit() {
    for (const f of FIELDS) this.defaults.set(f.key, f.get());
    try {
      const saved = await this.settings.get<Record<string, number>>(SETTING_KEY);
      let n = 0;
      for (const f of FIELDS) {
        const v = saved?.[f.key];
        if (typeof v === 'number' && Number.isFinite(v)) { f.set(v); n++; }
      }
      if (n) this.log.log(`${n} paramètre(s) du tracker rechargé(s) depuis la base`);
    } catch (err: any) {
      this.log.warn(`Paramètres non chargés : ${err?.message}`);
    }
  }

  list() {
    return FIELDS.map((f) => ({ key: f.key, group: f.group, label: f.label, help: f.help ?? null, min: f.min, max: f.max, step: f.step, value: f.get(), default: this.defaults.get(f.key) }));
  }

  async update(values: Record<string, unknown>) {
    const saved = { ...((await this.settings.get<Record<string, number>>(SETTING_KEY)) ?? {}) };
    const byKey = new Map(FIELDS.map((f) => [f.key, f]));
    for (const [key, raw] of Object.entries(values ?? {})) {
      const f = byKey.get(key);
      if (!f) continue;
      const v = Number(raw);
      if (!Number.isFinite(v) || v < f.min || v > f.max) throw new BadRequestException(`« ${f.label} » : valeur entre ${f.min} et ${f.max}`);
      const value = f.int ? Math.round(v) : v;
      f.set(value);
      if (value === this.defaults.get(key)) delete saved[key]; else saved[key] = value;
    }
    await this.settings.set(SETTING_KEY, saved);
    return this.list();
  }

  async reset(keys?: string[]) {
    const saved = { ...((await this.settings.get<Record<string, number>>(SETTING_KEY)) ?? {}) };
    for (const f of FIELDS) {
      if (keys && !keys.includes(f.key)) continue;
      const d = this.defaults.get(f.key);
      if (d !== undefined) f.set(d);
      delete saved[f.key];
    }
    await this.settings.set(SETTING_KEY, saved);
    return this.list();
  }

  /** Applique le ratio minimum par défaut à tous les comptes existants (les profils famille suivent leur compte principal). */
  async applyMinRatioToAll() {
    const res = await this.prisma.user.updateMany({ where: { parentId: null }, data: { minRatio: SITE.defaultMinRatio } });
    return { updated: res.count, minRatio: SITE.defaultMinRatio };
  }
}
