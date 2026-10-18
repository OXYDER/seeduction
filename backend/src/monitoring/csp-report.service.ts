import { Injectable } from '@nestjs/common';

export interface CspViolation { directive: string; blocked: string; count: number; lastAt: string; page: string }

const MAX_KEYS = 200;
const clean = (v: unknown, max = 120): string => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, max);
/** Garde l'origine et le chemin, jamais les paramètres (ils peuvent contenir un jeton ou des données personnelles). */
const stripQuery = (u: string): string => u.split(/[?#]/)[0];

/**
 * Rapports de violation de la politique de sécurité du navigateur (CSP en mode test) : on garde, en mémoire, un compte par (règle, adresse bloquée) pour voir ce qu'il faudrait
 * autoriser avant de rendre la politique obligatoire. Rien n'est écrit en base, et la mémoire est plafonnée (n'importe qui peut envoyer un rapport).
 */
@Injectable()
export class CspReportService {
  private seen = new Map<string, CspViolation>();

  record(body: any) {
    const r = body?.['csp-report'] ?? body;
    if (!r || typeof r !== 'object') return;
    const directive = clean(r['violated-directive'] ?? r['effective-directive'] ?? r.effectiveDirective ?? r.violatedDirective, 60);
    const blocked = stripQuery(clean(r['blocked-uri'] ?? r.blockedURL ?? r.blockedUri, 160)) || '(en ligne)';
    if (!directive) return;
    const page = stripQuery(clean(r['document-uri'] ?? r.documentURL ?? r.documentUri, 120));
    const key = `${directive}|${blocked}`;
    const hit = this.seen.get(key);
    if (hit) { hit.count++; hit.lastAt = new Date().toISOString(); return; }
    if (this.seen.size >= MAX_KEYS) return;
    this.seen.set(key, { directive, blocked, count: 1, lastAt: new Date().toISOString(), page });
  }

  list(): CspViolation[] { return [...this.seen.values()].sort((a, b) => b.count - a.count).slice(0, 30); }
  clear() { this.seen.clear(); }
}
