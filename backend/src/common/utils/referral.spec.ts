import { DEFAULT_REFERRAL, classAtLeast, inviteeProgress, monthStart, normalizeReferral } from './referral';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

describe('parrainage', () => {
  it('compare les rangs', () => {
    expect(classAtLeast('MEMBRE', 'MEMBRE')).toBe(true);
    expect(classAtLeast('ELITE', 'MEMBRE')).toBe(true);
    expect(classAtLeast('NOUVEAU', 'MEMBRE')).toBe(false);
    expect(classAtLeast('INCONNU', 'MEMBRE')).toBe(false);
  });
  it('nettoie les réglages', () => {
    expect(normalizeReferral(undefined)).toEqual(DEFAULT_REFERRAL);
    expect(normalizeReferral({ enabled: false, rewardPoints: 99999999, minDays: -5, minClass: 'ADMIN', maxPerMonth: 0 })).toEqual({ enabled: false, rewardPoints: 100000, minDays: 0, minClass: 'MEMBRE', maxPerMonth: 1 });
    expect(normalizeReferral({ rewardPoints: 'abc' }).rewardPoints).toBe(DEFAULT_REFERRAL.rewardPoints);
  });
  it('dit où en est un invité', () => {
    const cfg = DEFAULT_REFERRAL; // 14 jours, rang Membre
    expect(inviteeProgress({ createdAt: daysAgo(3), memberClass: 'NOUVEAU', status: 'ACTIVE', rewarded: false }, cfg)).toEqual({ state: 'waiting', daysLeft: 11, classOk: false });
    expect(inviteeProgress({ createdAt: daysAgo(20), memberClass: 'NOUVEAU', status: 'ACTIVE', rewarded: false }, cfg).state).toBe('waiting'); // assez ancien mais rang insuffisant
    expect(inviteeProgress({ createdAt: daysAgo(20), memberClass: 'MEMBRE', status: 'ACTIVE', rewarded: false }, cfg)).toEqual({ state: 'ready', daysLeft: 0, classOk: true });
    expect(inviteeProgress({ createdAt: daysAgo(5), memberClass: 'MEMBRE', status: 'ACTIVE', rewarded: false }, cfg).state).toBe('waiting'); // rang ok mais trop récent
    expect(inviteeProgress({ createdAt: daysAgo(40), memberClass: 'ELITE', status: 'BANNED', rewarded: false }, cfg).state).toBe('inactive');
    expect(inviteeProgress({ createdAt: daysAgo(40), memberClass: 'ELITE', status: 'ACTIVE', rewarded: true }, cfg).state).toBe('rewarded');
  });
  it('début du mois', () => {
    expect(monthStart(new Date('2026-10-18T22:00:00Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});
