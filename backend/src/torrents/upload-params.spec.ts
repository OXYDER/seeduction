import { uploadParamsFromBody } from './upload-params';

const NFO = 'Un NFO assez long pour être accepté par la validation.';

describe('paramètres d\'envoi', () => {
  it('le freeleech est au choix de l\'envoyeur (désactivé par défaut)', () => {
    const base = { name: 'Release.2026.1080p.WEB-TEAM', nfo: NFO };
    expect(uploadParamsFromBody('u1', Buffer.from('x'), base, 'cat').freeleech).toBe(false);
    expect(uploadParamsFromBody('u1', Buffer.from('x'), { ...base, freeleech: 'true' }, 'cat').freeleech).toBe(true);
    expect(uploadParamsFromBody('u1', Buffer.from('x'), { ...base, freeleech: 'false' }, 'cat').freeleech).toBe(false);
  });
  it('refuse un envoi sans NFO', () => {
    expect(() => uploadParamsFromBody('u1', Buffer.from('x'), { name: 'X', nfo: '' }, 'cat')).toThrow();
  });
});
