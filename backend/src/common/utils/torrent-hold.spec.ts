import { HOLD_NOTE_MAX, HOLD_REASONS, holdMessage, normalizeHold } from './torrent-hold';

describe('Torrent en attente de correction', () => {
  it('garde les motifs connus, sans doublon, dans l\'ordre de la liste', () => {
    const h = normalizeHold({ reasons: ['nfo', 'noseed', 'nfo', 'inconnu', 42], note: '' });
    expect(h.reasons).toEqual(['noseed', 'nfo']);
  });

  it('accepte un message seul ou des motifs seuls', () => {
    expect(normalizeHold({ reasons: [], note: 'Le NFO est celui d\'un autre film' }).note).toContain('NFO');
    expect(normalizeHold({ reasons: ['fiche'] }).reasons).toEqual(['fiche']);
  });

  it('refuse une demande vide', () => {
    expect(() => normalizeHold({ reasons: [], note: '   ' })).toThrow();
    expect(() => normalizeHold({})).toThrow();
    expect(() => normalizeHold({ reasons: ['inconnu'] })).toThrow();
  });

  it('coupe un message trop long', () => {
    expect(normalizeHold({ note: 'x'.repeat(5000) }).note).toHaveLength(HOLD_NOTE_MAX);
  });

  it('compose le message envoyé au membre', () => {
    const m = holdMessage('Mon.Film.2024', { reasons: ['noseed', 'description'], note: 'Merci de revérifier' }, 'Alice');
    expect(m).toContain('Mon.Film.2024');
    expect(m).toContain(HOLD_REASONS.noseed);
    expect(m).toContain(HOLD_REASONS.description);
    expect(m).toContain('Alice : « Merci de revérifier »');
  });
});
