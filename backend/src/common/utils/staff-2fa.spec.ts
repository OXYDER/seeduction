import { forgetStaff2fa, isStaffRole, staff2faRequired, staffBlockedFor2fa } from './staff-2fa';

describe('2FA obligatoire pour l\'équipe', () => {
  it('ne bloque que l\'équipe sans 2FA, et seulement quand le réglage est actif', () => {
    expect(staffBlockedFor2fa(true, 'MODERATOR', false)).toBe(true);
    expect(staffBlockedFor2fa(true, 'ADMIN', false)).toBe(true);
    expect(staffBlockedFor2fa(true, 'OWNER', true)).toBe(false);
    expect(staffBlockedFor2fa(false, 'ADMIN', false)).toBe(false);
    expect(staffBlockedFor2fa(true, 'USER', false)).toBe(false);
    expect(staffBlockedFor2fa(true, 'UPLOADER', false)).toBe(false);
  });
  it('ne bloque pas quand l\'état de la 2FA est inconnu (profil famille, choix de profil)', () => {
    expect(staffBlockedFor2fa(true, 'ADMIN', undefined)).toBe(false);
  });
  it('reconnaît les rôles de l\'équipe', () => {
    expect(['USER', 'UPLOADER', 'MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].filter(isStaffRole)).toEqual(['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER']);
  });
  it('lit le réglage une fois puis le garde en mémoire', async () => {
    forgetStaff2fa();
    const findUnique = jest.fn().mockResolvedValue({ value: true });
    const db: any = { siteSetting: { findUnique } };
    expect(await staff2faRequired(db)).toBe(true);
    expect(await staff2faRequired(db)).toBe(true);
    expect(findUnique).toHaveBeenCalledTimes(1);
    forgetStaff2fa();
    findUnique.mockResolvedValue(null);
    expect(await staff2faRequired(db)).toBe(false);
  });
});
