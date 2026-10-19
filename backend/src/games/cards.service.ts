import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CATALOG, CRAFT_COST, CardsConfig, DEFAULT_CARDS, ODDS, RARITIES, RARITY_LABEL, SETS, SHARDS, SetId, albumComplete, cardById, cardsOf, completedSets, drawPack, normalizeCards } from '../common/utils/cards';
import { torontoDay } from './wheel.service';
import { emitChallenge } from '../common/utils/challenge-bus';
import { setSource } from '../common/utils/ledger';

const KEY = 'cards';
const DAY = 86400_000;

export interface Actor { userId: string; username: string }
export type PackSource = 'quiz' | 'wheel' | 'picks' | 'challenge' | 'tournoi';
const SOURCE_TEXT: Record<PackSource, string> = { tournoi: 'un prix du tournoi de la semaine', quiz: 'un quiz sans faute', wheel: 'sept jours de suite à la roue de la fortune', picks: 'une journée parfaite aux pronostics', challenge: 'tes défis' };

/**
 * Cartes à collectionner. Les paquets se gagnent (un par jour, plus des récompenses des autres jeux) et ne s'achètent jamais avec des points. Le tirage est fait par le
 * serveur (générateur sécurisé) dans une seule transaction avec la consommation du paquet : impossible d'ouvrir un paquet deux fois ou sans l'avoir.
 */
@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);
  private busy = new Set<string>();

  constructor(private prisma: PrismaService, private settings: SettingsService, private audit: AuditService, private notifications: NotificationsService) {}

  async config(): Promise<CardsConfig> { return normalizeCards(await this.settings.get(KEY), DEFAULT_CARDS); }

  async saveConfig(actor: Actor, body: any, ip?: string | null) {
    const next = normalizeCards(body, await this.config());
    await this.settings.set(KEY, next);
    await this.audit.log(actor.userId, 'CARDS_CONFIG', next as any, ip);
    return next;
  }

  private blocked(a: { status: string; createdAt: Date; gamesOptOut: boolean }, cfg: CardsConfig): string | null {
    if (!cfg.enabled) return 'Les cartes à collectionner sont fermées pour le moment';
    if (a.status !== 'ACTIVE') return 'Ton compte ne peut pas jouer';
    if (a.gamesOptOut) return 'Tu t\'es retiré des jeux (tu peux revenir depuis la page Jeux)';
    const age = Math.floor((Date.now() - a.createdAt.getTime()) / DAY);
    if (age < cfg.minAccountDays) return `Ton compte doit avoir au moins ${cfg.minAccountDays} jour${cfg.minAccountDays > 1 ? 's' : ''} pour jouer (encore ${cfg.minAccountDays - age})`;
    return null;
  }

  private async account(accountId: string) {
    const a = await this.prisma.user.findUnique({ where: { id: accountId }, select: { status: true, createdAt: true, gamesOptOut: true, parentId: true } });
    if (!a || a.parentId) throw new ForbiddenException('Réservé au compte principal');
    return a;
  }

  private ensureWallet(userId: string) {
    return this.prisma.cardWallet.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  // ------------------------------------------------------------------ gagner des paquets

  /**
   * Offre un paquet pour un exploit dans un autre jeu (une seule fois par membre, source et clé). Ne lève jamais d'erreur : un problème de cartes ne doit pas gêner le jeu
   * qui l'appelle. Les comptes bloqués ou récents ne reçoivent rien.
   */
  async grantPack(userId: string, source: PackSource, key: string): Promise<boolean> {
    try {
      const cfg = await this.config();
      if (!cfg.enabled) return false;
      const account = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true, createdAt: true, gamesOptOut: true, parentId: true } });
      if (!account || account.parentId || this.blocked(account, cfg)) return false;
      const granted = await this.prisma.$transaction(async (tx) => {
        await setSource(tx, 'cards');
        const made = await tx.cardPackGrant.createMany({ data: [{ userId, source, key }], skipDuplicates: true });
        if (made.count !== 1) return false;
        await tx.cardWallet.upsert({ where: { userId }, create: { userId, packs: 1 }, update: { packs: { increment: 1 } } });
        return true;
      });
      if (granted) {
        await this.notifications.notify({ userId, type: 'SYSTEM', category: 'games', groupKey: 'cards-pack', title: '🎴 Un paquet de cartes t\'attend !', body: `Tu l'as gagné avec ${SOURCE_TEXT[source]}.`, link: '/jeux/cartes' }).catch(() => undefined);
      }
      return granted;
    } catch (e) { this.logger.warn(`Paquet de cartes non offert : ${(e as Error).message}`); return false; }
  }

  /** Réclame le paquet du jour (une fois par jour, heure de Montréal). */
  async claimDaily(accountId: string) {
    const cfg = await this.config();
    const why = this.blocked(await this.account(accountId), cfg);
    if (why) throw new BadRequestException(why);
    if (cfg.dailyPacks <= 0) throw new BadRequestException('Aucun paquet quotidien n\'est offert pour le moment');
    const today = torontoDay();
    await this.ensureWallet(accountId);
    const r = await this.prisma.cardWallet.updateMany({ where: { userId: accountId, OR: [{ lastDaily: null }, { lastDaily: { not: today } }] }, data: { lastDaily: today, packs: { increment: cfg.dailyPacks } } });
    if (r.count === 0) throw new BadRequestException('Tu as déjà réclamé ton paquet du jour : reviens demain');
    const w = await this.ensureWallet(accountId);
    emitChallenge({ userId: accountId, event: 'cards_daily', game: 'cards' });
    return { packs: w.packs, claimed: cfg.dailyPacks };
  }

  // ------------------------------------------------------------------ ouvrir, fabriquer

  /** Points offerts pour les séries (et l'album) qui viennent d'être complétées ; chaque récompense n'est versée qu'une fois. */
  private async rewardSets(tx: any, userId: string, cfg: CardsConfig): Promise<{ set: string; name: string; points: number }[]> {
    const owned = new Set<string>((await tx.userCard.findMany({ where: { userId }, select: { cardId: true } })).map((c: { cardId: string }) => c.cardId));
    const todo: { id: string; name: string; points: number }[] = completedSets(owned).map((id) => ({ id, name: SETS.find((s) => s.id === id)!.name, points: cfg.setRewards[id] }));
    if (albumComplete(owned)) todo.push({ id: 'album', name: 'Album complet', points: cfg.albumReward });
    const out: { set: string; name: string; points: number }[] = [];
    for (const t of todo) {
      const made = await tx.cardSetReward.createMany({ data: [{ userId, setId: t.id, points: t.points }], skipDuplicates: true });
      if (made.count !== 1) continue;
      if (t.points > 0) await tx.user.update({ where: { id: userId }, data: { bonusPoints: { increment: t.points } } });
      out.push({ set: t.id, name: t.name, points: t.points });
    }
    return out;
  }

  private async announceSets(userId: string, sets: { name: string; points: number }[]) {
    for (const s of sets) {
      await this.notifications.notify({ userId, type: 'SYSTEM', category: 'games', title: `🏅 Série complétée : ${s.name}`, body: s.points > 0 ? `Bravo ! +${s.points} points offerts.` : 'Bravo pour cette collection !', link: '/jeux/cartes' }).catch(() => undefined);
    }
  }

  /** Ouvre un paquet : il est consommé et les cartes sont ajoutées dans la même transaction. Les doublons deviennent des éclats. */
  async open(accountId: string) {
    const cfg = await this.config();
    const why = this.blocked(await this.account(accountId), cfg);
    if (why) throw new BadRequestException(why);
    if (this.busy.has(accountId)) throw new BadRequestException('Une ouverture est déjà en cours');
    this.busy.add(accountId);
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await setSource(tx, 'cards');
        const taken = await tx.cardWallet.updateMany({ where: { userId: accountId, packs: { gte: 1 } }, data: { packs: { decrement: 1 }, opened: { increment: 1 } } });
        if (taken.count === 0) throw new BadRequestException('Tu n\'as aucun paquet à ouvrir');
        const wallet = await tx.cardWallet.findUniqueOrThrow({ where: { userId: accountId } });
        const drawn = drawPack((n) => randomInt(n), cfg, wallet.pity);
        const owned = new Set<string>((await tx.userCard.findMany({ where: { userId: accountId, cardId: { in: drawn.cards.map((c) => c.id) } }, select: { cardId: true } })).map((c) => c.cardId));
        let shards = 0;
        const cards: { id: string; new: boolean; shards: number }[] = [];
        for (const c of drawn.cards) {
          const isNew = !owned.has(c.id);
          if (!isNew) shards += SHARDS[c.rarity];
          await tx.userCard.upsert({ where: { userId_cardId: { userId: accountId, cardId: c.id } }, create: { userId: accountId, cardId: c.id, count: 1 }, update: { count: { increment: 1 } } });
          owned.add(c.id);
          cards.push({ id: c.id, new: isNew, shards: isNew ? 0 : SHARDS[c.rarity] });
        }
        const after = await tx.cardWallet.update({ where: { userId: accountId }, data: { shards: { increment: shards }, pity: drawn.pity } });
        await tx.cardOpening.create({ data: { userId: accountId, cards: cards as any, shards } });
        const sets = await this.rewardSets(tx, accountId, cfg);
        return { cards, shards, packs: after.packs, totalShards: after.shards, pity: after.pity, sets };
      }, { timeout: 30_000 });
      void this.announceSets(accountId, result.sets);
      emitChallenge({ userId: accountId, event: 'cards_open', game: 'cards' });
      return result;
    } finally { this.busy.delete(accountId); }
  }

  /** Fabrique une carte manquante avec des éclats. */
  async craft(accountId: string, cardId: string) {
    const cfg = await this.config();
    const why = this.blocked(await this.account(accountId), cfg);
    if (why) throw new BadRequestException(why);
    const card = cardById(String(cardId));
    if (!card) throw new BadRequestException('Carte inconnue');
    if (this.busy.has(accountId)) throw new BadRequestException('Une action est déjà en cours');
    this.busy.add(accountId);
    try {
      const cost = CRAFT_COST[card.rarity];
      const result = await this.prisma.$transaction(async (tx) => {
        await setSource(tx, 'cards');
        if (await tx.userCard.findUnique({ where: { userId_cardId: { userId: accountId, cardId: card.id } }, select: { id: true } })) throw new BadRequestException('Tu possèdes déjà cette carte');
        const paid = await tx.cardWallet.updateMany({ where: { userId: accountId, shards: { gte: cost } }, data: { shards: { decrement: cost } } });
        if (paid.count === 0) throw new BadRequestException(`Il te faut ${cost} éclats pour fabriquer cette carte`);
        await tx.userCard.create({ data: { userId: accountId, cardId: card.id, count: 1 } });
        const w = await tx.cardWallet.findUniqueOrThrow({ where: { userId: accountId } });
        const sets = await this.rewardSets(tx, accountId, cfg);
        return { card: card.id, cost, shards: w.shards, sets };
      });
      void this.announceSets(accountId, result.sets);
      return result;
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('Tu possèdes déjà cette carte');
      throw e;
    } finally { this.busy.delete(accountId); }
  }

  // ------------------------------------------------------------------ page et résumé

  async overview(accountId: string) {
    const cfg = await this.config();
    const account = await this.account(accountId);
    const today = torontoDay();
    const wallet = await this.ensureWallet(accountId);
    const [cards, recent, rewards, top] = await Promise.all([
      this.prisma.userCard.findMany({ where: { userId: accountId }, select: { cardId: true, count: true, createdAt: true } }),
      this.prisma.cardOpening.findMany({ where: { userId: accountId }, orderBy: { createdAt: 'desc' }, take: 5, select: { cards: true, shards: true, createdAt: true } }),
      this.prisma.cardSetReward.findMany({ where: { userId: accountId }, select: { setId: true, points: true } }),
      this.prisma.userCard.groupBy({ by: ['userId'], _count: { _all: true }, orderBy: { _count: { userId: 'desc' } }, take: 5 }),
    ]);
    const owned = Object.fromEntries(cards.map((c) => [c.cardId, c.count]));
    const claimed = new Set(rewards.map((r) => r.setId));
    const names = top.length ? await this.prisma.user.findMany({ where: { id: { in: top.map((t) => t.userId) } }, select: { id: true, username: true } }) : [];
    const name = new Map(names.map((n) => [n.id, n.username]));
    return {
      enabled: cfg.enabled, blocked: this.blocked(account, cfg),
      wallet: { packs: wallet.packs, shards: wallet.shards, opened: wallet.opened, dailyAvailable: cfg.dailyPacks > 0 && wallet.lastDaily !== today, dailyPacks: cfg.dailyPacks, untilLegendary: Math.max(1, cfg.pityPacks - wallet.pity) },
      catalog: { cards: CATALOG, sets: SETS.map((s) => ({ ...s, total: cardsOf(s.id).length, reward: cfg.setRewards[s.id], claimed: claimed.has(s.id) })), album: { total: CATALOG.length, reward: cfg.albumReward, claimed: claimed.has('album') } },
      owned, distinct: cards.length,
      rules: { cardsPerPack: cfg.cardsPerPack, odds: ODDS, shards: SHARDS, craft: CRAFT_COST, pityPacks: cfg.pityPacks, labels: RARITY_LABEL },
      recent: recent.map((r) => ({ cards: r.cards, shards: r.shards, at: r.createdAt })),
      collectors: top.map((t) => ({ username: name.get(t.userId) ?? 'Membre supprimé', cards: t._count._all, mine: t.userId === accountId })),
    };
  }

  /** Résumé pour la case de la page Jeux. */
  async summary(accountId: string) {
    const cfg = await this.config();
    const [wallet, owned] = await Promise.all([this.prisma.cardWallet.findUnique({ where: { userId: accountId } }), this.prisma.userCard.count({ where: { userId: accountId } })]);
    return { enabled: cfg.enabled, packs: wallet?.packs ?? 0, shards: wallet?.shards ?? 0, owned, total: CATALOG.length, dailyAvailable: cfg.enabled && cfg.dailyPacks > 0 && wallet?.lastDaily !== torontoDay() };
  }

  // ------------------------------------------------------------------ administration

  async adminOverview() {
    const config = await this.config();
    const [wallets, opened, held, collectors, rewards, grants, completions] = await Promise.all([
      this.prisma.cardWallet.aggregate({ _sum: { packs: true, shards: true, opened: true }, _count: { _all: true } }),
      this.prisma.cardOpening.count({ where: { createdAt: { gt: new Date(Date.now() - 7 * DAY) } } }),
      this.prisma.userCard.groupBy({ by: ['cardId'], _sum: { count: true }, _count: { _all: true } }),
      this.prisma.userCard.groupBy({ by: ['userId'], _count: { _all: true } }),
      this.prisma.cardSetReward.aggregate({ _sum: { points: true }, _count: { _all: true } }),
      this.prisma.cardPackGrant.groupBy({ by: ['source'], _count: { _all: true } }),
      this.prisma.cardSetReward.groupBy({ by: ['setId'], _count: { _all: true } }),
    ]);
    const byRarity: Record<string, number> = Object.fromEntries(RARITIES.map((r) => [r, 0]));
    for (const h of held) { const c = cardById(h.cardId); if (c) byRarity[c.rarity] += h._sum.count ?? 0; }
    return {
      config,
      stats: {
        members: wallets._count._all, packsWaiting: wallets._sum.packs ?? 0, packsOpened: wallets._sum.opened ?? 0, packsOpened7d: opened, shardsHeld: wallets._sum.shards ?? 0,
        collectors: collectors.length, cardsHeld: held.reduce((s, h) => s + (h._sum.count ?? 0), 0), byRarity,
        rewardsPaid: rewards._count._all, pointsPaid: rewards._sum.points ?? 0,
        earnedPacks: Object.fromEntries(grants.map((g) => [g.source, g._count._all])), completions: Object.fromEntries(completions.map((c) => [c.setId, c._count._all])),
      },
    };
  }
}
