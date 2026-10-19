import { PushThrottle, buildPayload, isGone, safeUrl, validEndpoint, validKeys } from './push';

const P256 = 'B' + 'A'.repeat(64) + '-_' + 'x'.repeat(21); // 88 caractères base64url
const AUTH = 'a'.repeat(22);

describe('notifications push', () => {
  it('accepte seulement les services des navigateurs, en https', () => {
    expect(validEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe('https://fcm.googleapis.com/fcm/send/abc');
    expect(validEndpoint('https://updates.push.services.mozilla.com/wpush/v2/xyz')).not.toBeNull();
    expect(validEndpoint('https://web.push.apple.com/QWER')).not.toBeNull();
    expect(validEndpoint('https://wns2-par02p.notify.windows.com/?token=1')).not.toBeNull();
    expect(validEndpoint('http://fcm.googleapis.com/x')).toBeNull();
    expect(validEndpoint('https://evil.example.com/fcm.googleapis.com')).toBeNull();
    expect(validEndpoint('https://fcm.googleapis.com.evil.com/x')).toBeNull();
    expect(validEndpoint('https://127.0.0.1/x')).toBeNull();
    expect(validEndpoint('https://user:pw@fcm.googleapis.com/x')).toBeNull();
    expect(validEndpoint('https://fcm.googleapis.com:8443/x')).toBeNull();
    expect(validEndpoint('https://fcm.googleapis.com/' + 'a'.repeat(1300))).toBeNull();
    expect(validEndpoint(42)).toBeNull();
    expect(validEndpoint('pas une adresse')).toBeNull();
  });
  it('contrôle les clés de chiffrement', () => {
    expect(P256.length).toBe(88);
    expect(validKeys({ p256dh: P256, auth: AUTH })).toEqual({ p256dh: P256, auth: AUTH });
    expect(validKeys({ p256dh: 'court', auth: AUTH })).toBeNull();
    expect(validKeys({ p256dh: P256, auth: 'x' })).toBeNull();
    expect(validKeys({ p256dh: P256 + '<script>', auth: AUTH })).toBeNull();
    expect(validKeys(null)).toBeNull();
  });
  it('destination du clic : seulement une page du site', () => {
    expect(safeUrl('/courriel')).toBe('/courriel');
    expect(safeUrl('/torrents/abc?x=1')).toBe('/torrents/abc?x=1');
    expect(safeUrl('https://evil.com')).toBe('/notifications');
    expect(safeUrl('//evil.com')).toBe('/notifications');
    expect(safeUrl('javascript:alert(1)')).toBe('/notifications');
    expect(safeUrl(null)).toBe('/notifications');
  });
  it('message court et sans mise en forme', () => {
    const p = buildPayload({ title: 'x'.repeat(200), body: 'a\n\n  b   c', link: '/chat', groupKey: 'mail:1', category: 'support' });
    expect(p.title.length).toBe(80); expect(p.title.endsWith('…')).toBe(true);
    expect(p).toMatchObject({ body: 'a b c', url: '/chat', tag: 'mail:1', category: 'support' });
    expect(buildPayload({ title: 'T', id: 'n9' })).toEqual({ title: 'T', body: '', url: '/notifications', tag: 'n9' });
  });
  it('limite de fréquence par regroupement', () => {
    const t = new PushThrottle(60_000);
    expect(t.allow('a', 1000)).toBe(true);
    expect(t.allow('a', 30_000)).toBe(false);
    expect(t.allow('b', 30_000)).toBe(true);
    expect(t.allow('a', 61_001)).toBe(true);
  });
  it('abonnement disparu', () => {
    expect(isGone(410)).toBe(true); expect(isGone(404)).toBe(true); expect(isGone(500)).toBe(false); expect(isGone(undefined)).toBe(false);
  });
});
