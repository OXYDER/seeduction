import { BADGES, BADGE_CATEGORIES, BadgeStats, evaluateBadges } from './badges';

const base: BadgeStats = { uploadsApproved: 0, uploadedBytes: 0n, ratio: null, bonusPoints: 0, invitees: 0, forumPosts: 0, accountAgeDays: 0, requestFills: 0, seedHours: 0, seedOk: 0, snatches: 0, hnrOpen: 0, subtitles: 0, comments: 0, mentored: 0 };

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
    const rich: BadgeStats = { ...base, uploadsApproved: 60, uploadedBytes: BigInt(3e12), ratio: 6, bonusPoints: 9000, invitees: 12, forumPosts: 40, accountAgeDays: 1200, requestFills: 9, seedHours: 6000, seedOk: 120, snatches: 200, subtitles: 40, comments: 30, mentored: 5 };
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
