import { DEFAULT_QUIZ, AnswerRec, choicesFor, nextQuizStreak, normalizeQuiz, pickDailyIds, pointsFor, rewardFor, seededRandom, shuffle, streakMultiplier, validateQuestion } from './quiz';
import { QUIZ_SEED } from './quiz-seed';

const rec = (correct: boolean, points: number): AnswerRec => ({ q: 'q', choice: correct ? 1 : 2, ms: 1000, correct, points });

describe('Quiz quotidien : points', () => {
  it('une mauvaise réponse ne rapporte rien', () => {
    expect(pointsFor(false, 100, DEFAULT_QUIZ)).toBe(0);
  });

  it('le bonus de rapidité diminue avec le temps pris', () => {
    expect(pointsFor(true, 0, DEFAULT_QUIZ)).toBe(15);
    expect(pointsFor(true, 10_000, DEFAULT_QUIZ)).toBe(13); // moitié du temps : 10 + 2,5 arrondi
    expect(pointsFor(true, 20_000, DEFAULT_QUIZ)).toBe(10);
    expect(pointsFor(true, 60_000, DEFAULT_QUIZ)).toBe(10);
  });

  it('le bonus de série monte puis plafonne', () => {
    expect(streakMultiplier(1, DEFAULT_QUIZ)).toBe(1);
    expect(streakMultiplier(5, DEFAULT_QUIZ)).toBeCloseTo(1.2);
    expect(streakMultiplier(99, DEFAULT_QUIZ)).toBeCloseTo(1.5);
  });

  it('un sans-faute rapporte un bonus, augmenté par la série', () => {
    const answers = [1, 2, 3, 4, 5].map(() => rec(true, 14));
    const r = rewardFor(answers, 5, 1, DEFAULT_QUIZ);
    expect(r).toMatchObject({ correct: 5, base: 70, perfect: 50, total: 120, bonus: 50, consolation: false });
    expect(rewardFor(answers, 5, 5, DEFAULT_QUIZ).total).toBe(144); // 120 × 1,2
  });

  it('un quiz sans bonne réponse donne le prix de consolation, jamais zéro', () => {
    const r = rewardFor([rec(false, 0), rec(false, 0)], 5, 3, DEFAULT_QUIZ);
    expect(r).toMatchObject({ correct: 0, total: 10, consolation: true });
  });

  it('un quiz partiel donne ses points sans bonus sans-faute', () => {
    const r = rewardFor([rec(true, 12), rec(false, 0), rec(true, 10), rec(false, 0), rec(false, 0)], 5, 1, DEFAULT_QUIZ);
    expect(r).toMatchObject({ correct: 2, base: 22, perfect: 0, total: 22 });
  });

  it('la série continue si le dernier quiz était hier', () => {
    expect(nextQuizStreak('2026-10-16', 3, '2026-10-17')).toBe(4);
    expect(nextQuizStreak('2026-10-15', 3, '2026-10-17')).toBe(1);
    expect(nextQuizStreak(null, 0, '2026-10-17')).toBe(1);
  });
});

describe('Quiz quotidien : tirage des questions', () => {
  const pool = Array.from({ length: 30 }, (_, i) => `q${i}`);

  it('le générateur à graine est reproductible', () => {
    const a = seededRandom('2026-10-17'), b = seededRandom('2026-10-17'), c = seededRandom('2026-10-18');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seededRandom('x')()).not.toBe(c());
  });

  it('le mélange garde tous les éléments', () => {
    expect(shuffle(pool, seededRandom('s')).sort()).toEqual([...pool].sort());
  });

  it('évite les questions récentes tant qu\'il en reste assez', () => {
    const recent = new Set(pool.slice(0, 20));
    const picked = pickDailyIds(pool, recent, 5, seededRandom('d'));
    expect(picked).toHaveLength(5);
    expect(new Set(picked).size).toBe(5);
    picked.forEach((id) => expect(recent.has(id)).toBe(false));
  });

  it('reprend dans toute la banque quand il n\'y a plus assez de questions fraîches', () => {
    const recent = new Set(pool.slice(0, 28));
    expect(pickDailyIds(pool, recent, 5, seededRandom('d'))).toHaveLength(5);
  });

  it('les réponses sont mélangées de façon stable et gardent leur indice d\'origine', () => {
    const choices = ['A', 'B', 'C', 'D'];
    const one = choicesFor(choices, 'play1:q1');
    expect(choicesFor(choices, 'play1:q1')).toEqual(one);
    expect(one.map((c) => c.i).sort()).toEqual([0, 1, 2, 3]);
    one.forEach((c) => expect(choices[c.i]).toBe(c.text));
    // la bonne réponse n'est pas toujours à la même place : sur beaucoup de parties, chaque position sort
    const positions = new Set<number>();
    for (let k = 0; k < 60; k++) positions.add(choicesFor(choices, `p${k}:q`).findIndex((c) => c.i === 0));
    expect(positions.size).toBe(4);
  });
});

describe('Quiz quotidien : réglages et questions', () => {
  it('garde les valeurs précédentes quand une valeur est invalide', () => {
    expect(normalizeQuiz({ questionsPerDay: 1, secondsPerQuestion: 1, streak: { bonusPerDay: 9 }, podium: ['x'] })).toEqual(DEFAULT_QUIZ);
  });

  it('règle les valeurs valides', () => {
    const c = normalizeQuiz({ questionsPerDay: 8, podium: [100, 60, 40], streak: { maxBonus: 1 } });
    expect(c.questionsPerDay).toBe(8);
    expect(c.podium).toEqual([100, 60, 40]);
    expect(c.streak.maxBonus).toBe(1);
  });

  it('valide une question', () => {
    const ok = validateQuestion({ category: 'Cinéma', text: 'Qui a réalisé Titanic ?', choices: ['James Cameron', 'Ridley Scott', 'Steven Spielberg', 'Tim Burton'], answer: 0 });
    expect(ok.ok).toBe(true);
    expect(validateQuestion({ category: 'C', text: 'Question valide ?', choices: ['a', 'b', 'c', 'd'], answer: 0 }).ok).toBe(false);
    expect(validateQuestion({ category: 'Cinéma', text: 'Question valide ?', choices: ['a', 'b', 'c'], answer: 0 }).ok).toBe(false);
    expect(validateQuestion({ category: 'Cinéma', text: 'Question valide ?', choices: ['a', 'A', 'c', 'd'], answer: 0 }).ok).toBe(false);
    expect(validateQuestion({ category: 'Cinéma', text: 'Question valide ?', choices: ['a', 'b', 'c', 'd'], answer: 4 }).ok).toBe(false);
  });
});

describe('Banque de questions fournie', () => {
  it('contient assez de questions, toutes valides', () => {
    expect(QUIZ_SEED.length).toBeGreaterThanOrEqual(60);
    for (const q of QUIZ_SEED) {
      const v = validateQuestion({ category: q.category, text: q.text, choices: q.choices, answer: q.answer, explain: q.explain });
      expect(v.ok).toBe(true);
      expect(q.answer).toBe(0); // la bonne réponse est toujours écrite en premier (l'ordre est mélangé à l'affichage)
    }
  });

  it('n\'a pas de question en double', () => {
    expect(new Set(QUIZ_SEED.map((q) => q.text.toLowerCase())).size).toBe(QUIZ_SEED.length);
  });
});
