import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QuizPlay, QuizQuestion } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { jobMonitor } from '../common/utils/job-monitor';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { secureRng } from '../common/utils/slots';
import { dayBefore } from '../common/utils/wheel';
import { AnswerRec, DEFAULT_QUIZ, QuizConfig, choicesFor, nextQuizStreak, normalizeQuiz, pickDailyIds, pointsFor, rewardFor, streakMultiplier, validateQuestion } from '../common/utils/quiz';
import { QUIZ_SEED } from '../common/utils/quiz-seed';
import { parseImport, questionKey } from '../common/utils/quiz-import';
import { nextMidnightToronto, torontoDay } from './wheel.service';
import { CardsService } from './cards.service';
import { emitChallenge } from '../common/utils/challenge-bus';
import { setSource } from '../common/utils/ledger';

const KEY = 'quiz';
const SEEDED_KEY = 'quizSeeded';
const TZ = 'America/Toronto';
/** Pause entre une réponse et la question suivante (le temps de voir la bonne réponse) ; le chrono de la question suivante ne part qu'ensuite. */
export const REVEAL_MS = 2800;
/** Compte à rebours avant la première question. */
export const START_DELAY_MS = 3500;
/** Marge accordée au réseau avant de considérer qu'une question est restée sans réponse. */
export const GRACE_MS = 1500;

export interface Actor { userId: string; username: string }

/**
 * Quiz quotidien. Les mêmes questions pour tous les membres chaque jour ; le serveur garde la bonne réponse, chronomètre chaque question et calcule les points.
 * Une seule partie par jour (contrainte d'unicité). Les points sont versés dans la même transaction que la fin de la partie.
 */
@Injectable()
export class QuizService implements OnModuleInit {
  private readonly logger = new Logger(QuizService.name);

  constructor(private prisma: PrismaService, private settings: SettingsService, private audit: AuditService, private notifications: NotificationsService, private cards: CardsService) {}

  /** Ajoute la banque de questions fournie, une seule fois : si l'administration vide la banque, elle ne revient pas toute seule. */
  async onModuleInit() {
    try {
      if (await this.settings.get(SEEDED_KEY)) return;
      if ((await this.prisma.quizQuestion.count()) === 0) await this.prisma.quizQuestion.createMany({ data: QUIZ_SEED.map((q) => ({ category: q.category, text: q.text, choices: q.choices, answer: q.answer, explain: q.explain })) });
      await this.settings.set(SEEDED_KEY, true);
    } catch (e) { this.logger.warn(`Banque de questions du quiz : ${(e as Error).message}`); }
  }

  async config(): Promise<QuizConfig> { return normalizeQuiz(await this.settings.get(KEY), DEFAULT_QUIZ); }

  async saveConfig(actor: Actor, body: any, ip?: string | null) {
    const next = normalizeQuiz(body, await this.config());
    await this.settings.set(KEY, next);
    await this.audit.log(actor.userId, 'QUIZ_CONFIG', next as any, ip);
    return next;
  }

  private blocked(a: { status: string; createdAt: Date; gamesOptOut: boolean }, cfg: QuizConfig): string | null {
    if (!cfg.enabled) return 'Le quiz est fermé pour le moment';
    if (a.status !== 'ACTIVE') return 'Ton compte ne peut pas jouer';
    if (a.gamesOptOut) return 'Tu t\'es retiré des jeux (tu peux revenir depuis la page Jeux)';
    const age = Math.floor((Date.now() - a.createdAt.getTime()) / 86400_000);
    if (age < cfg.minAccountDays) return `Ton compte doit avoir au moins ${cfg.minAccountDays} jour${cfg.minAccountDays > 1 ? 's' : ''} pour jouer (encore ${cfg.minAccountDays - age})`;
    return null;
  }

  // ------------------------------------------------------------------ questions du jour

  /** Les questions du jour, tirées à la première demande : on évite celles des derniers jours tant que la banque est assez grande. */
  private async dailyIds(day: string, cfg: QuizConfig): Promise<string[]> {
    const existing = await this.prisma.quizDay.findUnique({ where: { day } });
    if (existing) return existing.questionIds;
    const pool = await this.prisma.quizQuestion.findMany({ where: { active: true }, select: { id: true } });
    if (pool.length < 3) throw new BadRequestException('Le quiz n\'est pas encore prêt : il manque des questions');
    const keep = Math.min(14, Math.floor(pool.length / cfg.questionsPerDay));
    const recent = keep > 0 ? await this.prisma.quizDay.findMany({ orderBy: { day: 'desc' }, take: keep, select: { questionIds: true } }) : [];
    const ids = pickDailyIds(pool.map((p) => p.id), new Set(recent.flatMap((r) => r.questionIds)), Math.min(cfg.questionsPerDay, pool.length), (() => secureRng(1_000_000_000) / 1_000_000_000));
    try { await this.prisma.quizDay.create({ data: { day, questionIds: ids } }); return ids; }
    catch (e: any) {
      if (e?.code !== 'P2002') throw e;
      return (await this.prisma.quizDay.findUniqueOrThrow({ where: { day } })).questionIds; // une autre requête l'a créé juste avant
    }
  }

  private async questionMap(ids: string[]): Promise<Map<string, QuizQuestion>> {
    const rows = ids.length ? await this.prisma.quizQuestion.findMany({ where: { id: { in: ids } } }) : [];
    return new Map(rows.map((q) => [q.id, q]));
  }

  // ------------------------------------------------------------------ déroulement d'une partie

  /**
   * Enregistre la réponse à la question en cours et passe à la suivante (ou termine la partie et verse la récompense). Les écritures sont conditionnées à la question
   * en cours : deux réponses simultanées à la même question ne comptent qu'une fois.
   */
  private async record(play: QuizPlay, ans: AnswerRec, cfg: QuizConfig): Promise<QuizPlay> {
    const answers = [...((play.answers as unknown as AnswerRec[]) ?? []), ans];
    const idx = play.current;
    const data = { answers: answers as any, correct: play.correct + (ans.correct ? 1 : 0), points: play.points + ans.points, totalMs: play.totalMs + ans.ms };
    const conflict = () => new BadRequestException('Cette question a déjà reçu une réponse');
    if (answers.length < play.questionIds.length) {
      const r = await this.prisma.quizPlay.updateMany({ where: { id: play.id, current: idx, status: 'ACTIVE' }, data: { ...data, current: idx + 1, startsAt: new Date(Date.now() + REVEAL_MS) } });
      if (r.count !== 1) throw conflict();
    } else {
      const reward = rewardFor(answers, play.questionIds.length, play.streak, cfg);
      await this.prisma.$transaction(async (tx) => {
        await setSource(tx, 'quiz');
        const r = await tx.quizPlay.updateMany({ where: { id: play.id, current: idx, status: 'ACTIVE' }, data: { ...data, current: idx + 1, status: 'DONE', bonus: reward.bonus, finishedAt: new Date() } });
        if (r.count !== 1) throw conflict();
        await tx.user.update({ where: { id: play.userId }, data: { bonusPoints: { increment: reward.total } } });
      });
      // un sans-faute rapporte aussi un paquet de cartes (une seule fois par jour)
      const perfect = reward.correct === play.questionIds.length;
      if (perfect) void this.cards.grantPack(play.userId, 'quiz', play.day);
      emitChallenge({ userId: play.userId, event: 'quiz', game: 'quiz' });
      if (reward.correct > 0) emitChallenge({ userId: play.userId, event: 'quiz_correct', amount: reward.correct });
      if (perfect) emitChallenge({ userId: play.userId, event: 'quiz_perfect' });
    }
    return this.prisma.quizPlay.findUniqueOrThrow({ where: { id: play.id } });
  }

  /** Les questions restées sans réponse après leur temps comptent comme ratées ; la partie avance (et se termine) toute seule. */
  private async settle(play: QuizPlay, cfg: QuizConfig): Promise<QuizPlay> {
    const limit = cfg.secondsPerQuestion * 1000;
    try {
      while (play.status === 'ACTIVE' && Date.now() > play.startsAt.getTime() + limit + GRACE_MS) {
        play = await this.record(play, { q: play.questionIds[play.current], choice: null, ms: limit, correct: false, points: 0 }, cfg);
      }
    } catch { play = await this.prisma.quizPlay.findUniqueOrThrow({ where: { id: play.id } }); } // une réponse est arrivée en même temps
    return play;
  }

  private shuffledChoices(play: QuizPlay, q: QuizQuestion) { return choicesFor(q.choices, `${play.id}:${q.id}`); }

  /** Ce que le navigateur reçoit : jamais la bonne réponse d'une question en cours. */
  private async playView(play: QuizPlay, cfg: QuizConfig) {
    const qmap = await this.questionMap(play.questionIds);
    const answers = (play.answers as unknown as AnswerRec[]) ?? [];
    const total = play.questionIds.length;
    const base = { status: play.status, total, answered: answers.length, correct: play.correct, seconds: cfg.secondsPerQuestion, serverNow: Date.now() };
    if (play.status === 'ACTIVE') {
      const q = qmap.get(play.questionIds[play.current]);
      return {
        ...base, index: play.current, startsAt: play.startsAt.getTime(),
        question: q ? { id: q.id, category: q.category, text: q.text, choices: this.shuffledChoices(play, q) } : null,
      };
    }
    const review = answers.map((a) => {
      const q = qmap.get(a.q);
      return { text: q?.text ?? 'Question retirée', category: q?.category ?? '', correctText: q ? q.choices[q.answer] : '', myText: a.choice !== null && q ? q.choices[a.choice] ?? null : null, correct: a.correct, points: a.points, explain: q?.explain ?? null };
    });
    return {
      ...base, result: { correct: play.correct, questions: total, points: play.points, bonus: play.bonus, reward: play.points + play.bonus, streak: play.streak, perfect: play.correct === total && total > 0, consolation: play.correct === 0, totalMs: play.totalMs, review },
    };
  }

  private async account(accountId: string) {
    const account = await this.prisma.user.findUnique({ where: { id: accountId }, select: { status: true, createdAt: true, gamesOptOut: true, parentId: true } });
    if (!account || account.parentId) throw new ForbiddenException('Réservé au compte principal');
    return account;
  }

  /** Commence (ou reprend) le quiz du jour. */
  async start(accountId: string) {
    const cfg = await this.config();
    const account = await this.account(accountId);
    const why = this.blocked(account, cfg);
    if (why) throw new BadRequestException(why);
    const today = torontoDay();

    // une partie abandonnée un jour précédent est réglée d'office (questions restées sans réponse)
    for (const old of await this.prisma.quizPlay.findMany({ where: { userId: accountId, status: 'ACTIVE', day: { not: today } } })) await this.settleAll(old, cfg);

    let play = await this.prisma.quizPlay.findUnique({ where: { userId_day: { userId: accountId, day: today } } });
    if (!play) {
      const ids = await this.dailyIds(today, cfg);
      const last = await this.prisma.quizPlay.findFirst({ where: { userId: accountId, status: 'DONE' }, orderBy: { day: 'desc' }, select: { day: true, streak: true } });
      try {
        play = await this.prisma.quizPlay.create({ data: { userId: accountId, day: today, questionIds: ids, startsAt: new Date(Date.now() + START_DELAY_MS), streak: nextQuizStreak(last?.day ?? null, last?.streak ?? 0, today) } });
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e;
        play = await this.prisma.quizPlay.findUniqueOrThrow({ where: { userId_day: { userId: accountId, day: today } } });
      }
    }
    return { play: await this.playView(await this.settle(play, cfg), cfg) };
  }

  private async settleAll(play: QuizPlay, cfg: QuizConfig) {
    for (let i = 0; i < play.questionIds.length + 1 && play.status === 'ACTIVE'; i++) {
      try { play = await this.record(play, { q: play.questionIds[play.current], choice: null, ms: cfg.secondsPerQuestion * 1000, correct: false, points: 0 }, cfg); } catch { return; }
    }
  }

  /** Répond à la question en cours : `choice` est l'indice de la réponse dans la liste d'origine (absent si le temps est écoulé). */
  async answer(accountId: string, body: { index?: number; choice?: number | null }) {
    const cfg = await this.config();
    await this.account(accountId);
    const today = torontoDay();
    let play = await this.prisma.quizPlay.findUnique({ where: { userId_day: { userId: accountId, day: today } } });
    if (!play) throw new BadRequestException('Commence d\'abord le quiz du jour');
    play = await this.settle(play, cfg);
    if (play.status === 'DONE') return { done: true, play: await this.playView(play, cfg) };
    const index = Number(body?.index);
    if (!Number.isInteger(index) || index !== play.current) throw new BadRequestException('Cette question a déjà reçu une réponse');
    const now = Date.now();
    if (now < play.startsAt.getTime() - 600) throw new BadRequestException('La question n\'a pas encore commencé');
    const q = (await this.questionMap([play.questionIds[play.current]])).get(play.questionIds[play.current]);
    const choice = Number.isInteger(body?.choice) && Number(body.choice) >= 0 && Number(body.choice) <= 3 ? Number(body.choice) : null;
    const limit = cfg.secondsPerQuestion * 1000;
    const ms = Math.min(limit, Math.max(0, now - play.startsAt.getTime()));
    const correct = !!q && choice !== null && choice === q.answer;
    const ans: AnswerRec = { q: play.questionIds[play.current], choice, ms, correct, points: pointsFor(correct, ms, cfg) };
    const updated = await this.record(play, ans, cfg);
    if (q) void this.prisma.quizQuestion.update({ where: { id: q.id }, data: { asked: { increment: 1 }, ...(correct ? { right: { increment: 1 } } : {}) } }).catch(() => undefined);
    const view = await this.playView(updated, cfg);
    const bal = updated.status === 'DONE' ? await this.prisma.user.findUnique({ where: { id: accountId }, select: { bonusPoints: true } }) : null;
    return { done: updated.status === 'DONE', correct, answer: q?.answer ?? null, explain: q?.explain ?? null, points: ans.points, balance: bal ? Math.floor(bal.bonusPoints) : undefined, play: view };
  }

  // ------------------------------------------------------------------ page et résumé

  private currentStreak(last: { day: string; streak: number } | null, today: string): number {
    if (!last) return 0;
    return last.day === today || last.day === dayBefore(today) ? last.streak : 0;
  }

  async overview(accountId: string) {
    const cfg = await this.config();
    const account = await this.account(accountId);
    const today = torontoDay();
    let play = await this.prisma.quizPlay.findUnique({ where: { userId_day: { userId: accountId, day: today } } });
    if (play) play = await this.settle(play, cfg);
    const weekFrom = dayBefore(dayBefore(dayBefore(dayBefore(dayBefore(dayBefore(today))))));
    const [last, mine, perfects, top, weekly, poolSize] = await Promise.all([
      this.prisma.quizPlay.findFirst({ where: { userId: accountId, status: 'DONE' }, orderBy: { day: 'desc' }, select: { day: true, streak: true } }),
      this.prisma.quizPlay.aggregate({ where: { userId: accountId, status: 'DONE' }, _sum: { points: true, bonus: true }, _count: { _all: true }, _max: { correct: true } }),
      this.prisma.quizPlay.count({ where: { userId: accountId, status: 'DONE', correct: cfg.questionsPerDay } }),
      this.prisma.quizPlay.findMany({ where: { day: today, status: 'DONE' }, orderBy: [{ correct: 'desc' }, { totalMs: 'asc' }], take: 10, select: { userId: true, correct: true, totalMs: true, points: true, bonus: true } }),
      this.prisma.quizPlay.groupBy({ by: ['userId'], where: { day: { gte: weekFrom }, status: 'DONE' }, _sum: { correct: true, points: true, bonus: true }, _count: { _all: true }, orderBy: [{ _sum: { points: 'desc' } }], take: 5 }),
      this.prisma.quizQuestion.count({ where: { active: true } }),
    ]);
    const ids = [...new Set([...top.map((t) => t.userId), ...weekly.map((w) => w.userId)])];
    const names = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } }) : [];
    const name = new Map(names.map((n) => [n.id, n.username]));
    let myRank: number | null = null;
    if (play?.status === 'DONE') {
      myRank = 1 + await this.prisma.quizPlay.count({ where: { day: today, status: 'DONE', OR: [{ correct: { gt: play.correct } }, { correct: play.correct, totalMs: { lt: play.totalMs } }] } });
    }
    const streak = this.currentStreak(last, today);
    const playedToday = play?.status === 'DONE';
    return {
      enabled: cfg.enabled, blocked: this.blocked(account, cfg), ready: poolSize >= 3, day: today, nextAt: nextMidnightToronto().toISOString(),
      rules: { questions: cfg.questionsPerDay, seconds: cfg.secondsPerQuestion, perCorrect: cfg.pointsPerCorrect, speedBonus: cfg.speedBonusMax, perfect: cfg.perfectBonus, consolation: cfg.consolation, podium: cfg.podium },
      streak: { current: streak, next: streak + 1, multiplier: Math.round(streakMultiplier(streak + 1, cfg) * 100) / 100 },
      playedToday, play: play ? await this.playView(play, cfg) : null, myRank,
      me: { plays: mine._count._all, won: (mine._sum.points ?? 0) + (mine._sum.bonus ?? 0), best: mine._max.correct ?? 0, perfects },
      today: top.map((t) => ({ username: name.get(t.userId) ?? 'Membre supprimé', correct: t.correct, seconds: Math.round(t.totalMs / 100) / 10, mine: t.userId === accountId })),
      weekly: weekly.map((w) => ({ username: name.get(w.userId) ?? 'Membre supprimé', points: (w._sum.points ?? 0) + (w._sum.bonus ?? 0), plays: w._count._all, mine: w.userId === accountId })),
    };
  }

  /** Résumé pour la case de la page Jeux. */
  async summary(accountId: string) {
    const cfg = await this.config();
    const today = torontoDay();
    const [last, mine, play] = await Promise.all([
      this.prisma.quizPlay.findFirst({ where: { userId: accountId, status: 'DONE' }, orderBy: { day: 'desc' }, select: { day: true, streak: true } }),
      this.prisma.quizPlay.aggregate({ where: { userId: accountId, status: 'DONE' }, _sum: { points: true, bonus: true }, _max: { correct: true } }),
      this.prisma.quizPlay.findUnique({ where: { userId_day: { userId: accountId, day: today } }, select: { status: true, correct: true, questionIds: true } }),
    ]);
    return {
      enabled: cfg.enabled, playedToday: play?.status === 'DONE', inProgress: play?.status === 'ACTIVE', todayCorrect: play?.status === 'DONE' ? play.correct : null,
      questions: cfg.questionsPerDay, streak: this.currentStreak(last, today), won: (mine._sum.points ?? 0) + (mine._sum.bonus ?? 0), best: mine._max.correct ?? 0,
    };
  }

  // ------------------------------------------------------------------ podium de la veille

  /** Chaque matin, les trois meilleurs du quiz de la veille reçoivent un prix (le score le plus élevé, puis le temps le plus court). */
  @Cron('20 5 * * *', { timeZone: TZ })
  async payPodium() {
    jobMonitor.run('quiz.podium');
    try {
      const cfg = await this.config();
      if (!cfg.enabled) return;
      const yesterday = dayBefore(torontoDay());
      const winners = await this.prisma.quizPlay.findMany({ where: { day: yesterday, status: 'DONE', correct: { gte: 1 }, podium: 0 }, orderBy: [{ correct: 'desc' }, { totalMs: 'asc' }], take: 3 });
      let rank = 0;
      for (const w of winners) {
        rank++;
        const prize = cfg.podium[rank - 1];
        if (!prize) continue;
        try {
          await this.prisma.$transaction(async (tx) => {
            await setSource(tx, 'quiz');
            const r = await tx.quizPlay.updateMany({ where: { id: w.id, podium: 0 }, data: { podium: rank } });
            if (r.count !== 1) throw new Error('déjà payé');
            await tx.user.update({ where: { id: w.userId }, data: { bonusPoints: { increment: prize } } });
          });
          await this.notifications.notify({ userId: w.userId, type: 'SYSTEM', category: 'games', title: `${['🥇', '🥈', '🥉'][rank - 1]} Podium du quiz : +${prize} points`, body: `Tu as terminé ${rank === 1 ? 'premier' : rank === 2 ? 'deuxième' : 'troisième'} au quiz d'hier avec ${w.correct} bonne${w.correct > 1 ? 's' : ''} réponse${w.correct > 1 ? 's' : ''}. Bravo !`, link: '/jeux/quiz' }).catch(() => undefined);
        } catch { /* déjà payé */ }
      }
    } catch (e) { jobMonitor.fail('quiz.podium', e); this.logger.warn(`Podium du quiz : ${(e as Error).message}`); }
  }

  // ------------------------------------------------------------------ questions proposées par les membres

  /** Un membre propose une question : elle attend la validation du staff. Limites : 3 en attente, 5 par 24 heures, pas de doublon avec la banque ni avec une autre proposition. */
  async suggest(accountId: string, body: any) {
    const cfg = await this.config();
    const account = await this.account(accountId);
    const why = this.blocked(account, cfg);
    if (why) throw new BadRequestException(why);
    const v = validateQuestion(body);
    if (!v.ok) throw new BadRequestException(v.error);
    const [pending, today, bank, others] = await Promise.all([
      this.prisma.quizSuggestion.count({ where: { userId: accountId, status: 'PENDING' } }),
      this.prisma.quizSuggestion.count({ where: { userId: accountId, createdAt: { gt: new Date(Date.now() - 86400_000) } } }),
      this.prisma.quizQuestion.findMany({ select: { text: true } }),
      this.prisma.quizSuggestion.findMany({ where: { status: 'PENDING' }, select: { text: true } }),
    ]);
    if (pending >= 3) throw new BadRequestException('Tu as déjà 3 questions en attente de validation : attends qu\'elles soient examinées');
    if (today >= 5) throw new BadRequestException('Tu as déjà proposé 5 questions aujourd\'hui : reviens demain');
    const key = questionKey(v.value.text);
    if (bank.some((q) => questionKey(q.text) === key) || others.some((q) => questionKey(q.text) === key)) throw new BadRequestException('Cette question existe déjà (ou a déjà été proposée)');
    const row = await this.prisma.quizSuggestion.create({ data: { userId: accountId, ...v.value } });
    return { id: row.id, status: row.status };
  }

  async mySuggestions(accountId: string) {
    const rows = await this.prisma.quizSuggestion.findMany({ where: { userId: accountId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, text: true, category: true, status: true, note: true, reward: true, createdAt: true } });
    const cfg = await this.config();
    return { reward: cfg.suggestionReward, items: rows };
  }

  async adminSuggestions() {
    const rows = await this.prisma.quizSuggestion.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 100 });
    const names = rows.length ? await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, username: true } }) : [];
    const name = new Map(names.map((n) => [n.id, n.username]));
    return rows.map((r) => ({ id: r.id, username: name.get(r.userId) ?? 'Membre supprimé', category: r.category, text: r.text, choices: r.choices, answer: r.answer, explain: r.explain, createdAt: r.createdAt }));
  }

  /** Accepte une proposition (en la corrigeant au besoin) : la question entre dans la banque et le membre reçoit sa récompense, une seule fois. */
  async approveSuggestion(actor: Actor, id: string, body: any, ip?: string | null) {
    const cfg = await this.config();
    const sug = await this.prisma.quizSuggestion.findUnique({ where: { id } });
    if (!sug) throw new NotFoundException('Proposition introuvable');
    const v = validateQuestion({ category: sug.category, text: sug.text, choices: sug.choices, answer: sug.answer, explain: sug.explain, ...(body && typeof body === 'object' ? body : {}) });
    if (!v.ok) throw new BadRequestException(v.error);
    const reward = cfg.suggestionReward;
    const question = await this.prisma.$transaction(async (tx) => {
      await setSource(tx, 'quiz');
      const claimed = await tx.quizSuggestion.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'APPROVED', reviewedBy: actor.userId, reviewedAt: new Date(), reward } });
      if (claimed.count === 0) throw new BadRequestException('Cette proposition a déjà été examinée');
      const q = await tx.quizQuestion.create({ data: { ...v.value, active: true } });
      await tx.quizSuggestion.update({ where: { id }, data: { questionId: q.id } });
      if (reward > 0) await tx.user.update({ where: { id: sug.userId }, data: { bonusPoints: { increment: reward } } });
      return q;
    });
    await this.audit.log(actor.userId, 'QUIZ_QUESTION', { action: 'suggestion-approved', id: question.id, text: question.text } as any, ip);
    await this.notifications.notify({ userId: sug.userId, type: 'SYSTEM', category: 'games', title: '🧠 Ta question de quiz a été acceptée !', body: `Elle entre dans la banque du quiz${reward > 0 ? ` et tu reçois +${reward} points` : ''}. Merci !`, link: '/jeux/quiz' }).catch(() => undefined);
    return { ok: true, questionId: question.id };
  }

  async rejectSuggestion(actor: Actor, id: string, note: string | undefined, ip?: string | null) {
    const clean = typeof note === 'string' && note.trim() ? note.trim().slice(0, 200) : null;
    const r = await this.prisma.quizSuggestion.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'REJECTED', note: clean, reviewedBy: actor.userId, reviewedAt: new Date() } });
    if (r.count === 0) throw new BadRequestException('Cette proposition a déjà été examinée ou n\'existe pas');
    const sug = await this.prisma.quizSuggestion.findUnique({ where: { id }, select: { userId: true } });
    await this.audit.log(actor.userId, 'QUIZ_QUESTION', { action: 'suggestion-rejected', id } as any, ip);
    if (sug) await this.notifications.notify({ userId: sug.userId, type: 'SYSTEM', category: 'games', title: '🧠 Ta question de quiz n\'a pas été retenue', body: clean ? `Raison : ${clean}` : 'Merci quand même : tu peux en proposer d\'autres !', link: '/jeux/quiz' }).catch(() => undefined);
    return { ok: true };
  }

  /** Import en lot : `dryRun` montre ce qui serait ajouté sans rien écrire. */
  async importQuestions(actor: Actor, text: string, dryRun: boolean, ip?: string | null) {
    if (typeof text !== 'string' || !text.trim()) throw new BadRequestException('Colle les questions à importer');
    if (text.length > 400_000) throw new BadRequestException('Texte trop long');
    const known = new Set((await this.prisma.quizQuestion.findMany({ select: { text: true } })).map((q) => questionKey(q.text)));
    const r = parseImport(text, known);
    if (!dryRun && r.items.length > 0) {
      await this.prisma.quizQuestion.createMany({ data: r.items.map((q) => ({ category: q.category, text: q.text, choices: q.choices, answer: q.answer, explain: q.explain, active: true })) });
      await this.audit.log(actor.userId, 'QUIZ_QUESTION', { action: 'import', added: r.items.length, rejected: r.errors.length } as any, ip);
    }
    return { dryRun, added: dryRun ? 0 : r.items.length, valid: r.items.length, errors: r.errors.slice(0, 100), errorCount: r.errors.length, preview: r.items.slice(0, 5).map((q) => ({ category: q.category, text: q.text, good: q.choices[q.answer] })) };
  }

  // ------------------------------------------------------------------ administration

  async adminOverview() {
    const config = await this.config();
    const today = torontoDay();
    const weekFrom = dayBefore(dayBefore(dayBefore(dayBefore(dayBefore(dayBefore(today))))));
    const [questions, playsToday, week, all] = await Promise.all([
      this.prisma.quizQuestion.findMany({ orderBy: [{ category: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.quizPlay.count({ where: { day: today } }),
      this.prisma.quizPlay.aggregate({ where: { day: { gte: weekFrom }, status: 'DONE' }, _count: { _all: true }, _sum: { points: true, bonus: true, correct: true } }),
      this.prisma.quizPlay.aggregate({ where: { status: 'DONE' }, _count: { _all: true }, _sum: { points: true, bonus: true } }),
    ]);
    return {
      config, questions: questions.map((q) => ({ id: q.id, category: q.category, text: q.text, choices: q.choices, answer: q.answer, explain: q.explain, active: q.active, asked: q.asked, right: q.right })),
      stats: { playsToday, playsWeek: week._count._all, pointsWeek: (week._sum.points ?? 0) + (week._sum.bonus ?? 0), avgCorrectWeek: week._count._all > 0 ? Math.round(((week._sum.correct ?? 0) / week._count._all) * 10) / 10 : null, playsAll: all._count._all, pointsAll: (all._sum.points ?? 0) + (all._sum.bonus ?? 0) },
    };
  }

  async createQuestion(actor: Actor, body: any, ip?: string | null) {
    const v = validateQuestion(body);
    if (!v.ok) throw new BadRequestException(v.error);
    const q = await this.prisma.quizQuestion.create({ data: { ...v.value, active: body?.active !== false } });
    await this.audit.log(actor.userId, 'QUIZ_QUESTION', { action: 'create', id: q.id, text: q.text } as any, ip);
    return q;
  }

  async updateQuestion(actor: Actor, id: string, body: any, ip?: string | null) {
    const cur = await this.prisma.quizQuestion.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Question introuvable');
    const v = validateQuestion({ category: cur.category, text: cur.text, choices: cur.choices, answer: cur.answer, explain: cur.explain, ...body });
    if (!v.ok) throw new BadRequestException(v.error);
    const q = await this.prisma.quizQuestion.update({ where: { id }, data: { ...v.value, ...(typeof body?.active === 'boolean' ? { active: body.active } : {}) } });
    await this.audit.log(actor.userId, 'QUIZ_QUESTION', { action: 'update', id, text: q.text, active: q.active } as any, ip);
    return q;
  }

  async deleteQuestion(actor: Actor, id: string, ip?: string | null) {
    const cur = await this.prisma.quizQuestion.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Question introuvable');
    await this.prisma.quizQuestion.delete({ where: { id } });
    await this.audit.log(actor.userId, 'QUIZ_QUESTION', { action: 'delete', id, text: cur.text } as any, ip);
    return { ok: true };
  }
}
