import { parsePeerClient } from './peer-client';

describe('client BitTorrent d après le peer_id', () => {
  it('style Azureus', () => {
    expect(parsePeerClient('-qB4630-abcdefghijkl')).toEqual({ client: 'qBittorrent', version: '4.6.3.0', known: true });
    expect(parsePeerClient('-TR4050-xxxxxxxxxxxx')).toMatchObject({ client: 'Transmission', version: '4.0.5.0' });
    expect(parsePeerClient('-UT355W-xxxxxxxxxxxx').client).toBe('µTorrent');
    expect(parsePeerClient('-lt0D80-xxxxxxxxxxxx').client).toBe('libtorrent (rTorrent)');
  });
  it('client inconnu ou illisible', () => {
    expect(parsePeerClient('-ZZ1000-xxxxxxxxxxxx')).toMatchObject({ client: 'Inconnu (ZZ)', known: false });
    expect(parsePeerClient('n-importe-quoi')).toMatchObject({ client: 'Inconnu', known: false });
    expect(parsePeerClient('')).toMatchObject({ known: false });
  });
});
