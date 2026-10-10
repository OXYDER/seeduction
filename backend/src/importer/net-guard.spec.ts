import { assertPublicHost, assertPublicUrl, isPrivateIp } from './net-guard';

describe('net-guard : adresses autorisées pour le client d\'un membre', () => {
  it('refuse les adresses privées, locales et réservées (IPv4)', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.20', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '198.18.0.1']) expect(isPrivateIp(ip)).toBe(true);
  });

  it('accepte les adresses publiques (IPv4)', () => {
    for (const ip of ['8.8.8.8', '51.38.12.4', '172.15.0.1', '172.32.0.1', '100.63.0.1']) expect(isPrivateIp(ip)).toBe(false);
  });

  it('juge aussi les adresses IPv6 et les adresses IPv4 enfermées dans une IPv6', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fd12:3456::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1', '::ffff:a00:1', '64:ff9b::192.168.0.1']) expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ['2606:4700:4700::1111', '::ffff:8.8.8.8']) expect(isPrivateIp(ip)).toBe(false);
  });

  it('refuse un nom d\'hôte interne ou une adresse qui y mène', async () => {
    await expect(assertPublicHost('localhost')).rejects.toThrow(/interne/);
    await expect(assertPublicHost('nas.local')).rejects.toThrow(/interne/);
    await expect(assertPublicHost('192.168.1.10')).rejects.toThrow(/privé/);
    await expect(assertPublicHost('[::1]')).rejects.toThrow(/privé/);
    await expect(assertPublicHost('')).rejects.toThrow();
  });

  it('accepte une adresse publique donnée en clair', async () => {
    await expect(assertPublicHost('8.8.8.8')).resolves.toBeUndefined();
  });

  it('refuse les adresses web mal formées, non http(s) ou avec identifiants', async () => {
    await expect(assertPublicUrl('ftp://exemple.com')).rejects.toThrow(/http/);
    await expect(assertPublicUrl('pas une adresse')).rejects.toThrow(/invalide/);
    await expect(assertPublicUrl('https://user:pass@8.8.8.8:8080')).rejects.toThrow(/identifiant/);
    await expect(assertPublicUrl('http://127.0.0.1:8080')).rejects.toThrow(/privé/);
    await expect(assertPublicUrl('http://[::ffff:10.0.0.1]/')).rejects.toThrow(/privé/);
  });

  it('renvoie l\'adresse nettoyée (sans barre finale)', async () => {
    await expect(assertPublicUrl(' https://8.8.8.8:8443/qbit/ ')).resolves.toBe('https://8.8.8.8:8443/qbit');
  });

  it('la variable d\'essai lève la règle', async () => {
    process.env.MEMBER_IMPORT_ALLOW_PRIVATE = '1';
    try { await expect(assertPublicHost('127.0.0.1')).resolves.toBeUndefined(); } finally { delete process.env.MEMBER_IMPORT_ALLOW_PRIVATE; }
  });
});
