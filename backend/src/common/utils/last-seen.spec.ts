import { lastSeenVisible } from './last-seen';

const at = new Date('2026-10-31T12:00:00Z');
const row = { lastSeenAt: at, showLastSeen: true, presenceStatus: 'ONLINE', anonymous: false, anonymousSelf: false };
const other = { self: false, staff: false };

describe('Derni\u00e8re activit\u00e9 affich\u00e9e', () => {
  it('visible par les autres par d\u00e9faut', () => expect(lastSeenVisible(row, other)).toEqual(at));
  it('cach\u00e9e quand le membre l\u2019a choisi, qu\u2019il appara\u00eet hors ligne ou qu\u2019il est anonyme', () => {
    expect(lastSeenVisible({ ...row, showLastSeen: false }, other)).toBeNull();
    expect(lastSeenVisible({ ...row, presenceStatus: 'INVISIBLE' }, other)).toBeNull();
    expect(lastSeenVisible({ ...row, anonymous: true }, other)).toBeNull();
    expect(lastSeenVisible({ ...row, anonymousSelf: true }, other)).toBeNull();
  });
  it('toujours visible par lui-m\u00eame et par l\u2019\u00e9quipe', () => {
    const hidden = { ...row, showLastSeen: false, presenceStatus: 'INVISIBLE', anonymousSelf: true };
    expect(lastSeenVisible(hidden, { self: true, staff: false })).toEqual(at);
    expect(lastSeenVisible(hidden, { self: false, staff: true })).toEqual(at);
  });
  it('rien quand on ne l\u2019a jamais vu', () => expect(lastSeenVisible({ ...row, lastSeenAt: null }, other)).toBeNull());
});
