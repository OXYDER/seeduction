import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { jobMonitor } from '../common/utils/job-monitor';
import { setSource } from '../common/utils/ledger';
import { DEFAULT_DUELS, DUEL_KINDS, DURATIONS, DuelsConfig, Score, addDaysTo, isKind, kindDef, normalizeDuels, periodFor, plan } from '../common/utils/duels';
import { startOfDayToronto } from './slots.service';
import { torontoDay } from './wheel.service';
import { midnightOf } from './challenges.service';

const KEY = 'duels';
const DAY = 86400_000;
const SWEEP_MS = 600_000;
/** Les pronostics du dernier jour d'un duel sont attendus (matchs finis) ; après ce délai on règle quand même. */
const PICKS_GRACE_DAYS = 3;

export interface Actor { userId: string; username: string }
type DuelRow = { id: string; challengerId: string; opponentId: string; kind: string; days: number; status: string; startDay: string | null; endDay: string | null; scoreA: number; scoreB: number; winnerId: string | null; pointsA: number; pointsB: number; note: string; createdAt: Date; respondedAt: Date | null; settledAt: Date | null };

/**
 * Duels entre membres. Une invitation est envoyée à un autre membre sur une activité gratuite (quiz, pronostics, défis) ; si elle est acceptée, le duel commence le lendemain
 * et dure 3 ou 7 jours. Il est réglé tout seul après sa dernière journée (et, au plus tard, quand l'un des deux ouvre la page). Rien n'est misé : le site verse une petite
 * récompense, avec un plafond par jour et un délai par paire de membres pour que personne ne puisse fabriquer des points à deux.
 */
@Injectable()
export class DuelsService {
  private readonly logger = new Logger(DuelsService.name);
  constructor(private prisma: PrismaService, private settings: SettingsService, private audit: AuditService, private notifications: NotificationsService) {}

  async config(): Promise<DuelsConfig> { return normalizeDuels(await this.settings.get(KEY), DEFAULT_DUELS); }

  async saveConfig(actor: Actor, body: any, ip?: string | null) {
    const next = normalizeDuels(body, await this.config());
    await this.settings.set(KEY, next);
    await this.audit.log(actor.userId, 'DUELS_CONFIG', next as any, ip);
    return next;
  }

  // ------------------------------------------------------------------ règles d'accès

  private blocked(a: { status: string; createdAt: Date; parentId: string | null; gamesOptOut: boolean } | null, cfg: DuelsConfig, who: 'me' | 'other'): string | null {
    const you = who === 'me';
    if (!a || a.parentId) return you ? 'Réservé au compte principal' : 'Ce membre est introuvable';
    if (!cfg.enabled) return 'Les duels sont fermés pour le moment';
    if (a.status !== 'ACTIVE') return you ? 'Ton compte ne peut pas participer' : 'Ce membre ne peut pas participer';
    if (a.gamesOptOut) return you ? 'Tu t\'es retiré des jeux (tu peux revenir depuis la page Jeux)' : 'Ce membre s\'est retiré des jeux';
    const age = Math.floor((Date.now() - a.createdAt.getTime()) / DAY);
    if (age < cfg.minAccountDays) return you ? `Ton compte doit avoir au moins ${cfg.minAccountDays} jour${cfg.minAccountDays > 1 ? 's' : ''} pour participer (encore ${cfg.minAccountDays - age})` : 'Ce membre est trop récent pour participer aux duels';
    return null;
  }

  private account(id: string) { return this.prisma.user.findUnique({ where: { id }, select: { id: true, username: true, status: true, createdAt: true, parentId: true, gamesOptOut: true } }); }

  // ------------------------------------------------------------------ actions

  async create(accountId: string, body: { opponent?: string; kind?: string; days?: number }) {
    const cfg = await this.config();
    const me = await this.account(accountId);
    const mine = this.blocked(me, cfg, 'me');
    if (mine) throw new ForbiddenException(mine);
    const name = String(body?.opponent ?? '').trim().replace(/^@/, '');
    if (!name) throw new BadRequestException('Choisis un adversaire');
    if (!isKind(body?.kind)) throw new BadRequestException('Activité inconnue');
    const days = Math.floor(Number(body?.days));
    if (!(DURATIONS as readonly number[]).includes(days)) throw new BadRequestException(`Durée : ${DURATIONS.join(' ou ')} jours`);
    const other = await this.prisma.user.findFirst({ where: { username: { equals: name, mode: 'insensitive' }, parentId: null }, select: { id: true, username: true, status: true, createdAt: true, parentId: true, gamesOptOut: true } });
    if (!other) throw new NotFoundException('Aucun membre ne porte ce pseudo');
    if (other.id === accountId) throw new BadRequestException('Tu ne peux pas te défier toi-même');
    const theirs = this.blocked(other, cfg, 'other');
    if (theirs) throw new BadRequestException(theirs);

    const [existing, pendingOut] = await Promise.all([
      this.prisma.duel.findFirst({ where: { status: { in: ['PENDING', 'ACTIVE'] }, OR: [{ challengerId: accountId, opponentId: other.id }, { challengerId: other.id, opponentId: accountId }] }, select: { id: true } }),
      this.prisma.duel.count({ where: { challengerId: accountId, status: 'PENDING' } }),
    ]);
    if (existing) throw new BadRequestException(`Un duel est déjà en cours ou en attente avec ${other.username}`);
    if (pendingOut >= cfg.maxPendingOut) throw new BadRequestException(`Tu as déjà ${cfg.maxPendingOut} invitations en attente : attends une réponse ou annule-en une`);
    const d = await this.prisma.duel.create({ data: { challengerId: accountId, opponentId: other.id, kind: body.kind as string, days } });
    const def = kindDef(d.kind);
    await this.notifications.notify({
      userId: other.id, type: 'SYSTEM', category: 'games', groupKey: 'duels-invite',
      title: `⚔️ ${me!.username} te défie !`, titleMany: '⚔️ {n} invitations à un duel',
      body: `${def.icon} ${def.title} pendant ${days} jours. Accepte ou refuse dans la page Duels.`, link: '/jeux/duels',
    }).catch(() => undefined);
    return { id: d.id };
  }

  async respond(accountId: string, id: string, accept: boolean) {
    const cfg = await this.config();
    const d = await this.prisma.duel.findUnique({ where: { id } });
    if (!d || d.opponentId !== accountId) throw new NotFoundException('Invitation introuvable');
    if (d.status !== 'PENDING') throw new BadRequestException('Cette invitation n\'est plus en attente');
    if (Date.now() - d.createdAt.getTime() > cfg.expireHours * 3600_000) {
      await this.prisma.duel.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'EXPIRED', respondedAt: new Date() } });
      throw new BadRequestException('Cette invitation a expiré');
    }
    const me = await this.account(accountId);
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: [d.challengerId, accountId] } }, select: { id: true, username: true } })).map((u) => [u.id, u.username]));
    const def = kindDef(d.kind);
    if (!accept) {
      const r = await this.prisma.duel.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'DECLINED', respondedAt: new Date() } });
      if (r.count === 1) await this.notifications.notify({ userId: d.challengerId, type: 'SYSTEM', category: 'games', title: `${names.get(accountId) ?? 'Ton adversaire'} a refusé ton duel`, body: `${def.icon} ${def.title}`, link: '/jeux/duels' }).catch(() => undefined);
      return { ok: true, status: 'DECLINED' };
    }
    const mine = this.blocked(me, cfg, 'me');
    if (mine) throw new ForbiddenException(mine);
    const [a, b] = await Promise.all([
      this.prisma.duel.count({ where: { status: 'ACTIVE', OR: [{ challengerId: accountId }, { opponentId: accountId }] } }),
      this.prisma.duel.count({ where: { status: 'ACTIVE', OR: [{ challengerId: d.challengerId }, { opponentId: d.challengerId }] } }),
    ]);
    if (a >= cfg.maxActive) throw new BadRequestException(`Tu as déjà ${cfg.maxActive} duels en cours`);
    if (b >= cfg.maxActive) throw new BadRequestException('Ton adversaire a déjà trop de duels en cours : réessaie plus tard');
    const { startDay, endDay } = periodFor(torontoDay(), d.days);
    const r = await this.prisma.duel.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'ACTIVE', startDay, endDay, respondedAt: new Date() } });
    if (r.count === 0) throw new BadRequestException('Cette invitation n\'est plus en attente');
    await this.notifications.notify({ userId: d.challengerId, type: 'SYSTEM', category: 'games', title: `⚔️ ${names.get(accountId) ?? 'Ton adversaire'} a accepté ton duel`, body: `${def.icon} ${def.title} : c'est parti demain, pendant ${d.days} jours !`, link: '/jeux/duels' }).catch(() => undefined);
    return { ok: true, status: 'ACTIVE', startDay, endDay };
  }

  async cancel(accountId: string, id: string) {
    const r = await this.prisma.duel.updateMany({ where: { id, challengerId: accountId, status: 'PENDING' }, data: { status: 'CANCELED', respondedAt: new Date() } });
    if (r.count === 0) throw new NotFoundException('Invitation introuvable ou déjà traitée');
    return { ok: true };
  }

  // ------------------------------------------------------------------ scores et règlement

  async score(kind: string, userId: string, startDay: string, endDay: string): Promise<Score> {
    if (kind === 'quiz') {
      const r = await this.prisma.quizPlay.aggregate({ where: { userId, day: { gte: startDay, lte: endDay }, status: 'DONE' }, _sum: { correct: true, points: true, bonus: true } });
      return { main: r._sum.correct ?? 0, tie: (r._sum.points ?? 0) + (r._sum.bonus ?? 0) };
    }
    if (kind === 'picks') {
      const r = await this.prisma.nhlPick.aggregate({ where: { userId, day: { gte: startDay, lte: endDay }, status: 'WON' }, _count: { _all: true }, _sum: { points: true } });
      return { main: r._count._all, tie: r._sum.points ?? 0 };
    }
    const r = await this.prisma.challengeProgress.aggregate({ where: { userId, done: true, doneAt: { gte: midnightOf(startDay), lt: midnightOf(addDaysTo(endDay, 1)) } }, _count: { _all: true }, _sum: { points: true } });
    return { main: r._count._all, tie: r._sum.points ?? 0 };
  }

  /** Règle les duels terminés (d'un membre, ou de tous) et fait expirer les invitations restées sans réponse. */
  async settleDue(userId?: string): Promise<number> {
    const cfg = await this.config();
    const who = userId ? { OR: [{ challengerId: userId }, { opponentId: userId }] } : {};
    await this.prisma.duel.updateMany({ where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - cfg.expireHours * 3600_000) }, ...who }, data: { status: 'EXPIRED', respondedAt: new Date() } });
    const today = torontoDay();
    const due = (await this.prisma.duel.findMany({ where: { status: 'ACTIVE', endDay: { lt: today }, ...who }, orderBy: { endDay: 'asc' }, take: 50 })) as DuelRow[];
    let n = 0;
    for (const d of due) {
      try { if (await this.settle(d, cfg, today)) n++; } catch (e) { this.logger.warn(`Duel ${d.id} non réglé : ${(e as Error).message}`); }
    }
    return n;
  }

  private async settle(d: DuelRow, cfg: DuelsConfig, today: string): Promise<boolean> {
    const start = d.startDay!, end = d.endDay!;
    if (d.kind === 'picks' && end >= addDaysTo(today, -PICKS_GRACE_DAYS)) {
      const waiting = await this.prisma.nhlPick.count({ where: { userId: { in: [d.challengerId, d.opponentId] }, day: { gte: start, lte: end }, status: 'PENDING' } });
      if (waiting > 0) return false;
    }
    const [a, b] = await Promise.all([this.score(d.kind, d.challengerId, start, end), this.score(d.kind, d.opponentId, start, end)]);
    const since = startOfDayToronto();
    const rewardedToday = (uid: string) => this.prisma.duel.count({ where: { status: 'DONE', settledAt: { gte: since }, OR: [{ challengerId: uid, pointsA: { gt: 0 } }, { opponentId: uid, pointsB: { gt: 0 } }] } });
    const [ra, rb, recent] = await Promise.all([
      rewardedToday(d.challengerId), rewardedToday(d.opponentId),
      cfg.pairCooldownDays > 0
        ? this.prisma.duel.findFirst({ where: { status: 'DONE', settledAt: { gt: new Date(Date.now() - cfg.pairCooldownDays * DAY) }, OR: [{ pointsA: { gt: 0 } }, { pointsB: { gt: 0 } }], AND: [{ OR: [{ challengerId: d.challengerId, opponentId: d.opponentId }, { challengerId: d.opponentId, opponentId: d.challengerId }] }] }, select: { id: true } })
        : Promise.resolve(null),
    ]);
    const p = plan(a, b, cfg, ra < cfg.maxRewardedPerDay, rb < cfg.maxRewardedPerDay, !recent);
    const winnerId = p.winner === 'A' ? d.challengerId : p.winner === 'B' ? d.opponentId : null;
    const claimed = await this.prisma.$transaction(async (tx) => {
      await setSource(tx, 'duels');
      const r = await tx.duel.updateMany({ where: { id: d.id, status: 'ACTIVE' }, data: { status: 'DONE', scoreA: a.main, scoreB: b.main, winnerId, pointsA: p.pointsA, pointsB: p.pointsB, note: p.note, settledAt: new Date() } });
      if (r.count === 0) return false;
      if (p.pointsA > 0) await tx.user.update({ where: { id: d.challengerId }, data: { bonusPoints: { increment: p.pointsA } } });
      if (p.pointsB > 0) await tx.user.update({ where: { id: d.opponentId }, data: { bonusPoints: { increment: p.pointsB } } });
      return true;
    });
    if (!claimed) return false;

    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: [d.challengerId, d.opponentId] } }, select: { id: true, username: true } })).map((u) => [u.id, u.username]));
    const def = kindDef(d.kind);
    const tell = (me: string, other: string, mine: number, theirs: number, pts: number) => {
      const won = winnerId === me, tie = winnerId === null && (mine > 0 || theirs > 0);
      const title = won ? `🏆 Duel gagné contre ${names.get(other) ?? 'ton adversaire'} !` : tie ? `🤝 Égalité contre ${names.get(other) ?? 'ton adversaire'}` : mine === 0 && theirs === 0 ? `Duel terminé contre ${names.get(other) ?? 'ton adversaire'}` : `⚔️ Beau duel contre ${names.get(other) ?? 'ton adversaire'}`;
      const body = `${def.icon} ${mine} contre ${theirs} (${def.unit}).${pts > 0 ? ` +${pts} points${won ? '' : tie ? '' : ' de consolation'}.` : ''}`;
      return this.notifications.notify({ userId: me, type: 'SYSTEM', category: 'games', title, body, link: '/jeux/duels' }).catch(() => undefined);
    };
    await Promise.all([tell(d.challengerId, d.opponentId, a.main, b.main, p.pointsA), tell(d.opponentId, d.challengerId, b.main, a.main, p.pointsB)]);
    return true;
  }

  @Interval(SWEEP_MS)
  async sweep() {
    jobMonitor.run('duels.sweep', SWEEP_MS);
    try { await this.settleDue(); } catch (e) { jobMonitor.fail('duels.sweep', e); this.logger.warn(`Duels : ${(e as Error).message}`); }
  }

  // ------------------------------------------------------------------ pages

  async overview(accountId: string) {
    const cfg = await this.config();
    const me = await this.account(accountId);
    if (!me || me.parentId) throw new ForbiddenException('Réservé au compte principal');
    await this.settleDue(accountId).catch((e) => this.logger.warn(`Duels : ${(e as Error).message}`));
    const mine = { OR: [{ challengerId: accountId }, { opponentId: accountId }] };
    const [open, recent, finished] = await Promise.all([
      this.prisma.duel.findMany({ where: { status: { in: ['PENDING', 'ACTIVE'] }, ...mine }, orderBy: { createdAt: 'desc' }, take: 60 }),
      this.prisma.duel.findMany({ where: { status: 'DONE', ...mine }, orderBy: { settledAt: 'desc' }, take: 10 }),
      this.prisma.duel.findMany({ where: { status: 'DONE', ...mine }, select: { challengerId: true, winnerId: true, scoreA: true, scoreB: true, pointsA: true, pointsB: true } }),
    ]);
    const today = torontoDay();
    const ids = [...new Set([...open, ...recent].flatMap((d) => [d.challengerId, d.opponentId]))];
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } })).map((u) => [u.id, u.username]));
    const view = async (d: DuelRow, live: boolean) => {
      const def = kindDef(d.kind);
      const iAmA = d.challengerId === accountId;
      const otherId = iAmA ? d.opponentId : d.challengerId;
      let mineScore = iAmA ? d.scoreA : d.scoreB, theirScore = iAmA ? d.scoreB : d.scoreA;
      if (live && d.status === 'ACTIVE' && d.startDay && d.endDay && today >= d.startDay) {
        const [x, y] = await Promise.all([this.score(d.kind, accountId, d.startDay, d.endDay), this.score(d.kind, otherId, d.startDay, d.endDay)]);
        mineScore = x.main; theirScore = y.main;
      }
      return {
        id: d.id, kind: d.kind, icon: def.icon, title: def.title, unit: def.unit, days: d.days, status: d.status, startDay: d.startDay, endDay: d.endDay, iAmChallenger: iAmA,
        started: !!d.startDay && today >= d.startDay, other: names.get(otherId) ?? 'Membre supprimé', mine: mineScore, theirs: theirScore,
        result: d.status !== 'DONE' ? null : d.winnerId === null ? 'tie' : d.winnerId === accountId ? 'won' : 'lost',
        points: iAmA ? d.pointsA : d.pointsB, note: d.note, createdAt: d.createdAt, settledAt: d.settledAt,
      };
    };
    const openViews = await Promise.all((open as DuelRow[]).map((d) => view(d, true)));
    const recentViews = await Promise.all((recent as DuelRow[]).map((d) => view(d, false)));
    let won = 0, lost = 0, tied = 0, points = 0;
    for (const d of finished) {
      const iAmA = d.challengerId === accountId;
      points += iAmA ? d.pointsA : d.pointsB;
      if (d.scoreA === 0 && d.scoreB === 0) continue;
      if (d.winnerId === null) tied++; else if (d.winnerId === accountId) won++; else lost++;
    }
    return {
      enabled: cfg.enabled, blocked: this.blocked(me, cfg, 'me'),
      rules: { winPoints: cfg.winPoints, consolationPoints: cfg.consolationPoints, tiePoints: cfg.tiePoints, maxActive: cfg.maxActive, maxPendingOut: cfg.maxPendingOut, maxRewardedPerDay: cfg.maxRewardedPerDay, pairCooldownDays: cfg.pairCooldownDays, expireHours: cfg.expireHours },
      kinds: DUEL_KINDS, durations: DURATIONS,
      incoming: openViews.filter((d) => d.status === 'PENDING' && !d.iAmChallenger), outgoing: openViews.filter((d) => d.status === 'PENDING' && d.iAmChallenger), active: openViews.filter((d) => d.status === 'ACTIVE'),
      recent: recentViews, stats: { won, lost, tied, points },
    };
  }

  /** Résumé pour la case de la page Jeux. */
  async summary(accountId: string) {
    const cfg = await this.config();
    const [incoming, active, won] = await Promise.all([
      this.prisma.duel.count({ where: { opponentId: accountId, status: 'PENDING' } }),
      this.prisma.duel.count({ where: { status: 'ACTIVE', OR: [{ challengerId: accountId }, { opponentId: accountId }] } }),
      this.prisma.duel.count({ where: { status: 'DONE', winnerId: accountId } }),
    ]);
    return { enabled: cfg.enabled, incoming, active, won };
  }

  // ------------------------------------------------------------------ administration

  async adminOverview() {
    const config = await this.config();
    const since = new Date(Date.now() - 7 * DAY);
    const [created, accepted, done, declined, paid, active, pending] = await Promise.all([
      this.prisma.duel.count({ where: { createdAt: { gt: since } } }),
      this.prisma.duel.count({ where: { respondedAt: { gt: since }, status: { in: ['ACTIVE', 'DONE'] } } }),
      this.prisma.duel.findMany({ where: { status: 'DONE', settledAt: { gt: since } }, select: { pointsA: true, pointsB: true, note: true } }),
      this.prisma.duel.count({ where: { status: 'DECLINED', respondedAt: { gt: since } } }),
      this.prisma.duel.count({ where: { status: 'DONE', settledAt: { gt: since }, OR: [{ pointsA: { gt: 0 } }, { pointsB: { gt: 0 } }] } }),
      this.prisma.duel.count({ where: { status: 'ACTIVE' } }),
      this.prisma.duel.count({ where: { status: 'PENDING' } }),
    ]);
    return {
      config,
      stats: { created7d: created, accepted7d: accepted, declined7d: declined, settled7d: done.length, rewarded7d: paid, capped7d: done.filter((d) => d.note).length, pointsPaid7d: done.reduce((s, d) => s + d.pointsA + d.pointsB, 0), active, pending },
    };
  }
}
