import { parseXmlRpc, transmissionRpcUrl, xmlRpcCall } from './torrent-clients';

describe('Transmission : adresse du RPC', () => {
  it("complète l'adresse quelle que soit sa forme", () => {
    expect(transmissionRpcUrl('https://hote.exemple:9091')).toBe('https://hote.exemple:9091/transmission/rpc');
    expect(transmissionRpcUrl('https://hote.exemple/transmission')).toBe('https://hote.exemple/transmission/rpc');
    expect(transmissionRpcUrl('https://hote.exemple/transmission/')).toBe('https://hote.exemple/transmission/rpc');
    expect(transmissionRpcUrl('https://hote.exemple/transmission/rpc')).toBe('https://hote.exemple/transmission/rpc');
    expect(transmissionRpcUrl('https://hote.exemple/user/transmission/rpc/')).toBe('https://hote.exemple/user/transmission/rpc');
  });
});

describe('ruTorrent : XML-RPC', () => {
  it('construit un appel avec du texte, des caractères spéciaux et un fichier en base64', () => {
    const xml = xmlRpcCall('load.raw_start', ['', { base64: Buffer.from('abc') }, 'd.directory.set="/a & b/<c>"']);
    expect(xml).toContain('<methodName>load.raw_start</methodName>');
    expect(xml).toContain('<param><value><string></string></value></param>');
    expect(xml).toContain('<base64>YWJj</base64>');
    expect(xml).toContain('d.directory.set="/a &amp; b/&lt;c&gt;"');
  });

  it('lit un tableau de tableaux (d.multicall2) avec chaînes, entiers 64 bits et texte sans balise', () => {
    const xml = `<?xml version="1.0"?><methodResponse><params><param><value><array><data>
      <value><array><data><value><string>ABC123</string></value><value><string>Film.2025.mkv</string></value><value><i8>1500000000</i8></value><value><i8>1</i8></value><value><string>/home/u/dl/Film.2025.mkv</string></value><value><string>Films%20perso</string></value></data></array></value>
      <value><array><data><value>HASH2</value><value><string/></value><value><i4>7</i4></value><value><boolean>0</boolean></value></data></array></value>
    </data></array></value></param></params></methodResponse>`;
    const r = parseXmlRpc(xml);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual(['ABC123', 'Film.2025.mkv', 1500000000, 1, '/home/u/dl/Film.2025.mkv', 'Films%20perso']);
    expect(r[1]).toEqual(['HASH2', '', 7, false]);
  });

  it('lit une chaîne simple, une structure et décode les entités', () => {
    expect(parseXmlRpc('<methodResponse><params><param><value><string>/home/u/.session</string></value></param></params></methodResponse>')).toBe('/home/u/.session');
    expect(parseXmlRpc('<methodResponse><params><param><value><string>a &amp; b &lt;c&gt;</string></value></param></params></methodResponse>')).toBe('a & b <c>');
    expect(parseXmlRpc('<methodResponse><params><param><value><struct><member><name>a</name><value><i4>1</i4></value></member><member><name>b</name><value><string>x</string></value></member></struct></value></param></params></methodResponse>')).toEqual({ a: 1, b: 'x' });
  });

  it('transforme un « fault » en erreur lisible', () => {
    const fault = '<methodResponse><fault><value><struct><member><name>faultCode</name><value><i4>-506</i4></value></member><member><name>faultString</name><value><string>Method not defined</string></value></member></struct></value></fault></methodResponse>';
    expect(() => parseXmlRpc(fault)).toThrow(/Method not defined/);
  });

  it('refuse une réponse qui ne ressemble pas à du XML-RPC', () => {
    expect(() => parseXmlRpc('<html><body>Bad gateway</body></html>')).toThrow();
  });
});
