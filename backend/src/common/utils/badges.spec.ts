import { BADGES, BADGE_CATEGORIES, BadgeStats, evaluateBadges } from './badges';

const base: BadgeStats = { uploadsApproved: 0, uploadedBytes: 0n, ratio: null, bonusPoints: 0, invitees: 0, forumPosts: 0, accountAgeDays: 0, requestFills: 0, seedHours: 0, seedOk: 0, snatches: 0, hnrOpen: 0, subtitles: 0, comments: 0, mentored: 0, ratings: 0, watched: 0, quizzes: 0, wheelSpins: 0, picksWon: 0, badgesEarned: 0 };

describe('badges', () => {
  it('les codes sont uniques et chaque badge a une catégorie connue', () => {
    const codes = BADGES.map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const b of BADGES) expect(Object.keys(BADGE_CATEGORIES)).toContain(b.category);
  });
  it('un nouveau compte n\'a aucun badge', () => {
    expect(evaluateBadges(base)).toEqual([]);
  });
  it('le test et la progression disent la même chose', () => {
    const rich: BadgeStats = { ...base, uploadsApproved: 300, uploadedBytes: BigInt(6e13), ratio: 12, bonusPoints: 30000, invitees: 30, forumPosts: 600, accountAgeDays: 2000, requestFills: 30, seedHours: 25000, seedOk: 300, snatches: 600, subtitles: 120, comments: 600, mentored: 12, ratings: 250, watched: 60, quizzes: 60, wheelSpins: 200, picksWon: 60, badgesEarned: 60 };
    expect(evaluateBadges(rich).sort()).toEqual(BADGES.map((b) => b.code).sort());
    for (const b of BADGES) { const p = b.progress(rich); expect(p.value).toBe(p.target); }
    for (const b of BADGES) { const p = b.progress(base); expect(p.value).toBeLessThan(p.target); expect(p.value).toBeGreaterThanOrEqual(0); }
  });
  it('seuils : ancienneté, seed, sous-titres, mentor', () => {
    expect(evaluateBadges({ ...base, accountAgeDays: 90 })).toEqual(['FIDELE']);
    expect(evaluateBadges({ ...base, accountAgeDays: 365 })).toEqual(['FIDELE', 'VETERAN']);
    expect(evaluateBadges({ ...base, seedHours: 500 })).toEqual(['GARDIEN']);
    expect(evaluateBadges({ ...base, subtitles: 5 })).toEqual(['SOUS_TITREUR']);
    expect(evaluateBadges({ ...base, mentored: 3 })).toEqual(['MENTOR']);
  });
  it('« Irréprochable » est perdu tant qu\'un hit & run est en cours', () => {
    expect(evaluateBadges({ ...base, snatches: 50 })).toContain('IRREPROCHABLE');
    expect(evaluateBadges({ ...base, snatches: 80, hnrOpen: 1 })).not.toContain('IRREPROCHABLE');
  });
  it('le ratio d\'or exige 5.0', () => {
    expect(evaluateBadges({ ...base, ratio: 4.9 })).not.toContain('RATIO_OR');
    expect(evaluateBadges({ ...base, ratio: 5 })).toContain('RATIO_OR');
  });
});

describe('points des badges', () => {
  it('chaque badge rapporte des points, et les plus difficiles rapportent davantage', () => {
    for (const b of BADGES) expect(b.points).toBeGreaterThan(0);
    const pts = (code: string) => BADGES.find((b) => b.code === code)!.points;
    expect(pts('PREMIER_PAS')).toBeLessThan(pts('UPLOADER_CONFIRME'));
    expect(pts('UPLOADER_CONFIRME')).toBeLessThan(pts('UPLOADER_LEGENDAIRE'));
    expect(pts('UPLOADER_LEGENDAIRE')).toBeLessThan(pts('GRAND_ARCHIVISTE'));
  });
  it('les badges de collection et de jeux suivent leurs seuils', () => {
    expect(evaluateBadges({ ...base, badgesEarned: 10 })).toEqual(['COLLECTIONNEUR']);
    expect(evaluateBadges({ ...base, quizzes: 10 })).toEqual(['CERVEAU']);
    expect(evaluateBadges({ ...base, picksWon: 50 })).toEqual(['DEVIN', 'ORACLE']);
    expect(evaluateBadges({ ...base, ratio: 2 })).toEqual(['BON_PARTAGEUR']);
  });
});
