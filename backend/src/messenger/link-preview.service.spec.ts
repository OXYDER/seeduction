import { isPublicIp, parsePreview } from './link-preview.service';

describe('aperçu des liens : adresses', () => {
  it('refuse le réseau interne', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.10', '172.16.5.5', '172.31.255.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '::1', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
      expect(isPublicIp(ip)).toBe(false);
    }
  });
  it('accepte les adresses publiques', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) expect(isPublicIp(ip)).toBe(true);
  });
  it('refuse ce qui n\'est pas une adresse', () => {
    expect(isPublicIp('localhost')).toBe(false);
    expect(isPublicIp('')).toBe(false);
  });
});

describe('aperçu des liens : lecture de la page', () => {
  it('Open Graph en premier, balise title en secours', () => {
    const og = '<html><head><title>Titre brut</title><meta property="og:title" content="Titre &amp; OG"><meta content="Une description" name="description"><meta property="og:site_name" content="Exemple"></head></html>';
    expect(parsePreview(og, 'https://exemple.org/a')).toEqual({ url: 'https://exemple.org/a', title: 'Titre & OG', description: 'Une description', siteName: 'Exemple' });
    expect(parsePreview('<title> Seulement  le titre </title>', 'https://x.org').title).toBe('Seulement le titre');
  });
  it('tronque et ne renvoie que du texte', () => {
    const p = parsePreview(`<meta property="og:title" content="${'a'.repeat(300)}"><meta property="og:image" content="https://x.org/i.jpg">`, 'https://x.org');
    expect(p.title?.length).toBe(140);
    expect(JSON.stringify(p)).not.toMatch(/i\.jpg/);
  });
});
