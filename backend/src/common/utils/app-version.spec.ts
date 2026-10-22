import { compareVersions, isValidVersion, versionFromFilename } from './app-version';

describe('numéros de version', () => {
  it('compare nombre par nombre (pas comme du texte)', () => {
    expect(compareVersions('0.10.0', '0.9.5')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('2.0', '2.0.0')).toBe(0);
    expect(compareVersions('1.2.3.4', '1.2.3')).toBeGreaterThan(0);
  });

  it('accepte seulement des nombres séparés par des points', () => {
    expect(isValidVersion('1.0.0')).toBe(true);
    expect(isValidVersion('0.2')).toBe(true);
    expect(isValidVersion('1')).toBe(false);
    expect(isValidVersion('1.0.0-beta')).toBe(false);
    expect(isValidVersion('1.0.x')).toBe(false);
    expect(isValidVersion('../1.0')).toBe(false);
    expect(isValidVersion('')).toBe(false);
    expect(isValidVersion(undefined)).toBe(false);
  });

  it('retrouve la version dans un nom de fichier', () => {
    expect(versionFromFilename('Seeduction Player Setup 0.2.0.exe')).toBe('0.2.0');
    expect(versionFromFilename('Seeduction.Player.1.1.0.apk')).toBe('1.1.0');
    expect(versionFromFilename('app-release.apk')).toBeNull();
  });
});
