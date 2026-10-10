import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * Protection contre le détournement du serveur : un membre qui donne l'adresse de SON client ne doit pas pouvoir faire interroger
 * le réseau interne du site (NAS, base de données, autres conteneurs, service de métadonnées du cloud...). Les adresses privées,
 * locales ou réservées sont refusées. MEMBER_IMPORT_ALLOW_PRIVATE=1 lève la règle (essais en local uniquement).
 */

function v4Parts(ip: string): number[] | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every((n) => n <= 255) ? p : null;
}

function privateV4([a, b, c]: number[]): boolean {
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // partage de connexion opérateur (CGNAT)
    (a === 169 && b === 254) || // adresses locales, dont le service de métadonnées des clouds
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multidiffusion et réservé
  );
}

export function isPrivateIp(ip: string): boolean {
  const addr = ip.replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
  const v4 = v4Parts(addr);
  if (v4) return privateV4(v4);
  if (isIP(addr) !== 6) return true; // ni IPv4 ni IPv6 : on refuse
  // IPv6 : boucle locale, non spécifiée, locale unique (fc00::/7), lien local (fe80::/10)
  if (addr === '::' || addr === '::1') return true;
  if (/^f[cd]/.test(addr) || /^fe[89ab]/.test(addr)) return true;
  // IPv4 incluse dans une adresse IPv6 (::ffff:10.0.0.1, 64:ff9b::10.0.0.1) : on juge l'adresse IPv4
  const tail = addr.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (tail) { const p = v4Parts(tail[1]); return p ? privateV4(p) : true; }
  const mapped = addr.match(/^(?:0:0:0:0:0:ffff|::ffff):([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) {
    const hi = parseInt(mapped[1], 16), lo = parseInt(mapped[2], 16);
    return privateV4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
  }
  return false;
}

/** Refuse un nom d'hôte ou une adresse qui mène au réseau du serveur (vérifié à chaque passe, pas seulement à l'enregistrement). */
export async function assertPublicHost(host: string): Promise<void> {
  const h = String(host ?? '').trim().replace(/^\[|\]$/g, '');
  if (!h) throw new Error("adresse vide");
  if (process.env.MEMBER_IMPORT_ALLOW_PRIVATE === '1') return;
  if (/^localhost$/i.test(h) || /\.(local|localhost|internal|lan|home|intranet)$/i.test(h)) throw new Error(`« ${h} » est une adresse interne : seuls les serveurs accessibles depuis Internet sont acceptés`);
  let addrs: string[];
  if (isIP(h)) addrs = [h];
  else {
    try { addrs = (await lookup(h, { all: true })).map((a) => a.address); }
    catch { throw new Error(`adresse introuvable : ${h} (nom mal écrit ?)`); }
  }
  if (addrs.length === 0) throw new Error(`adresse introuvable : ${h}`);
  if (addrs.some(isPrivateIp)) throw new Error(`« ${h} » mène à un réseau privé ou interne : seuls les serveurs accessibles depuis Internet sont acceptés`);
}

/** Adresse de l'interface web d'un client : http(s) seulement, sans identifiant dans l'adresse, hôte public. Renvoie l'adresse nettoyée. */
export async function assertPublicUrl(raw: string): Promise<string> {
  let u: URL;
  try { u = new URL(String(raw ?? '').trim()); } catch { throw new Error('adresse invalide (ex. https://qbittorrent.exemple.com)'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error("l'adresse doit commencer par http:// ou https://");
  if (u.username || u.password) throw new Error("n'écris pas l'identifiant ni le mot de passe dans l'adresse : ils se saisissent dans leurs propres champs");
  await assertPublicHost(u.hostname);
  return u.toString().replace(/\/$/, '');
}
