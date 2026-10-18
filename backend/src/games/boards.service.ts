import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { dayBefore } from '../common/utils/wheel';
import { addDays, weekStart } from '../common/utils/picks';
import { torontoDay } from './wheel.service';

export interface BoardRow { rank: number; username: string; value: number; detail: string; mine: boolean }
export interface Board { id: string; title: string; icon: string; unit: string; hint: string; rows: BoardRow[]; me: { rank: number; value: number } | null }

const TOP = 10;

/**
 * Classements des jeux gratuits : les meilleurs de chaque jeu, au même endroit. Seulement des activités sans mise (quiz, pronostics, roue, défis, cartes) : un classement
 * ne doit jamais pousser à miser. Chaque classement montre le top 10 et, si le membre n'y est pas, son propre rang.
 */
@Injectable()
export class BoardsService {
  constructor(private prisma: PrismaService) {}

  private async names(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    return new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, username: true } })).map((u) => [u.id, u.username]));
  }

  /** Classe (valeur décroissante, égalité : plus tôt dans la liste) et construit le classement avec le rang du membre. */
  private async build(id: string, title: string, icon: string, unit: string, hint: string, entries: { userId: string; value: number; detail: string }[], me: string): Promise<Board> {
    const sorted = entries.filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, TOP);
    const idx = sorted.findIndex((e) => e.userId === me);
    const names = await this.names(top.map((t) => t.userId));
    return {
      id, title, icon, unit, hint,
      rows: top.map((t, i) => ({ rank: i + 1, username: names.get(t.userId) ?? 'Membre supprimé', value: Math.round(t.value), detail: t.detail, mine: t.userId === me })),
      me: idx >= 0 ? { rank: idx + 1, value: Math.round(sorted[idx].value) } : null,
    };
  }

  async overview(accountId: string) {
    const today = torontoDay();
    const yesterday = dayBefore(today);
    const wk = weekStart(today);
    const weekEnd = addDays(wk, 6);
    const since30 = addDays(today, -30);

    const [quizWeek, quizStreak, picksAll, picksWon, wheel, challenges, cards] = await Promise.all([
      this.prisma.quizPlay.groupBy({ by: ['userId'], where: { day: { gte: wk, lte: weekEnd }, status: 'DONE' }, _sum: { points: true, bonus: true, correct: true }, _count: { _all: true } }),
      this.prisma.quizPlay.findMany({ where: { day: { in: [today, yesterday] }, status: 'DONE', streak: { gte: 2 } }, select: { userId: true, streak: true, day: true }, orderBy: { streak: 'desc' }, take: 200 }),
      this.prisma.nhlPick.groupBy({ by: ['userId'], where: { day: { gte: wk, lte: weekEnd }, status: { in: ['WON', 'LOST'] } }, _count: { _all: true } }),
      this.prisma.nhlPick.groupBy({ by: ['userId'], where: { day: { gte: wk, lte: weekEnd }, status: 'WON' }, _count: { _all: true } }),
      this.prisma.wheelSpin.findMany({ where: { day: { in: [today, yesterday] }, streak: { gte: 2 } }, select: { userId: true, streak: true, day: true }, orderBy: { streak: 'desc' }, take: 200 }),
      this.prisma.challengeProgress.groupBy({ by: ['userId'], where: { done: true, period: { gte: since30 } }, _count: { _all: true } }),
      this.prisma.userCard.groupBy({ by: ['userId'], _count: { _all: true } }),
    ]);

    // pour la série du quiz et de la roue, on garde le meilleur tour de chaque membre (le plus récent compte)
    const bestStreak = (rows: { userId: string; streak: number; day: string }[]) => {
      const best = new Map<string, { streak: number; day: string }>();
      for (const r of rows) { const b = best.get(r.userId); if (!b || r.day > b.day) best.set(r.userId, { streak: r.streak, day: r.day }); }
      return [...best.entries()].map(([userId, b]) => ({ userId, value: b.streak, detail: b.day === today ? 'joué aujourd\'hui' : 'à rejouer aujourd\'hui' }));
    };
    const won = new Map(picksWon.map((p) => [p.userId, p._count._all]));

    const boards = await Promise.all([
      this.build('quiz-week', 'Quiz : points de la semaine', '🧠', 'pts', 'Points gagnés au quiz quotidien du lundi au dimanche.',
        quizWeek.map((q) => ({ userId: q.userId, value: (q._sum.points ?? 0) + (q._sum.bonus ?? 0), detail: `${q._count._all} quiz · ${q._sum.correct ?? 0} bonnes réponses` })), accountId),
      this.build('quiz-streak', 'Quiz : jours de suite', '🔥', 'jours', 'Série de jours consécutifs avec le quiz terminé (il faut jouer aujourd\'hui ou hier pour la garder).', bestStreak(quizStreak), accountId),
      this.build('picks-week', 'Pronostics LNH : bonnes prédictions', '🎯', 'bonnes', 'Prédictions réussies cette semaine (lundi au dimanche).',
        picksAll.map((p) => ({ userId: p.userId, value: won.get(p.userId) ?? 0, detail: `${won.get(p.userId) ?? 0} sur ${p._count._all}` })), accountId),
      this.build('wheel-streak', 'Roue de la fortune : jours de suite', '🎡', 'jours', 'Série de jours consécutifs avec la roue tournée.', bestStreak(wheel), accountId),
      this.build('challenges', 'Défis réussis (30 jours)', '🏅', 'défis', 'Défis quotidiens et hebdomadaires réussis ces 30 derniers jours.', challenges.map((c) => ({ userId: c.userId, value: c._count._all, detail: '' })), accountId),
      this.build('cards', 'Collectionneurs', '🎴', 'cartes', 'Cartes différentes dans l\'album.', cards.map((c) => ({ userId: c.userId, value: c._count._all, detail: '' })), accountId),
    ]);
    return { week: { start: wk, end: weekEnd }, boards };
  }
}
