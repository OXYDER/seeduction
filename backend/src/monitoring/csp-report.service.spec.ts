import { CspReportService } from './csp-report.service';

describe('CspReportService', () => {
  it('regroupe les rapports identiques et garde seulement l\'adresse sans paramètres', () => {
    const s = new CspReportService();
    const r = { 'csp-report': { 'violated-directive': 'img-src', 'blocked-uri': 'https://cdn.exemple.com/a.png?token=secret', 'document-uri': 'https://site.test/torrents/1?x=1' } };
    s.record(r); s.record(r);
    const list = s.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ directive: 'img-src', blocked: 'https://cdn.exemple.com/a.png', count: 2, page: 'https://site.test/torrents/1' });
  });
  it('accepte le format moderne et ignore les corps invalides', () => {
    const s = new CspReportService();
    s.record({ effectiveDirective: 'script-src', blockedURL: 'inline' });
    s.record(null); s.record('x'); s.record({});
    expect(s.list().map((v) => v.directive)).toEqual(['script-src']);
  });
  it('la mémoire est plafonnée', () => {
    const s = new CspReportService();
    for (let i = 0; i < 500; i++) s.record({ 'csp-report': { 'violated-directive': 'img-src', 'blocked-uri': `https://h${i}.test/x` } });
    expect(s.list().length).toBeLessThanOrEqual(30);
    s.clear(); expect(s.list()).toEqual([]);
  });
});
