import { normalizeAccess } from '../common/utils/forum-access';
import { SUGGESTED_FORUMS, SuggestedForum, planStructure } from './forum-suggested';

describe('structure de forum recommandée', () => {
  const forums: { cat: string; f: SuggestedForum; depth: number }[] = [];
  const walk = (cat: string, f: SuggestedForum, depth: number) => { forums.push({ cat, f, depth }); (f.subforums ?? []).forEach((s) => walk(cat, s, depth + 1)); };
  SUGGESTED_FORUMS.forEach((c) => c.forums.forEach((f) => walk(c.name, f, 1)));

  it('trois niveaux au maximum, jamais de sous-sous-forum', () => {
    expect(Math.max(...forums.map((x) => x.depth))).toBe(2);
  });
  it('pas de nom en double au même endroit', () => {
    const names = SUGGESTED_FORUMS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    SUGGESTED_FORUMS.forEach((c) => { const n = c.forums.map((f) => f.name); expect(new Set(n).size).toBe(n.length); });
  });
  it('chaque élément a une icône et une description', () => {
    SUGGESTED_FORUMS.forEach((c) => { expect(c.icon).toBeTruthy(); expect(c.description).toBeTruthy(); });
    forums.forEach(({ f }) => { expect(f.icon).toBeTruthy(); expect(f.description.length).toBeGreaterThan(10); });
  });
  it('les règles d\'accès sont toutes reconnues (rien ne serait ignoré à la création)', () => {
    SUGGESTED_FORUMS.forEach((c) => { if (c.access) expect(normalizeAccess(c.access)).toEqual(c.access); });
    forums.forEach(({ f }) => { if (f.access) expect(normalizeAccess(f.access)).toEqual(f.access); });
  });
  it('ne fait pas doublon avec les sections du site (annonces, suggestions, support, demandes)', () => {
    const all = [...SUGGESTED_FORUMS.map((c) => c.name), ...forums.map((x) => x.f.name)].join(' | ').toLowerCase();
    for (const banned of ['annonces de l', 'suggestions', 'bugs et problèmes', 'demandes de torrent']) expect(all).not.toContain(banned);
  });
  it('l\'espace équipe est privé et l\'espace 18+ réservé', () => {
    expect(SUGGESTED_FORUMS.find((c) => c.name === 'Équipe')?.staffOnly).toBe(true);
    expect(SUGGESTED_FORUMS.find((c) => c.name.startsWith('Adulte'))?.access?.read?.type).toBe('ADULT');
    expect(forums.find((x) => x.f.name === 'Salon des donateurs')?.f.access?.read?.type).toBe('DONORS');
  });
  it('les forums d\'entraide ont leurs règles', () => {
    const qa = forums.filter((x) => x.f.qa);
    expect(qa.length).toBeGreaterThanOrEqual(4);
    expect(forums.find((x) => x.f.name === 'Aide entre membres')?.f.rules).toContain('Wiki');
  });
});

describe('aperçu de la structure', () => {
  it('sur un forum vide : tout est à créer', () => {
    const plan = planStructure([]);
    expect(plan.every((p) => p.status === 'create')).toBe(true);
    expect(plan.filter((p) => p.kind === 'category').length).toBe(SUGGESTED_FORUMS.length);
    expect(plan.some((p) => p.kind === 'subforum')).toBe(true);
  });
  it('ce qui existe déjà (même nom au même endroit) est repéré, le reste est créé', () => {
    const existing = [
      { id: 'c1', parentId: null, name: 'communauté', isCategory: true },
      { id: 'f1', parentId: 'c1', name: 'Présentations', isCategory: false },
      { id: 'x', parentId: null, name: 'Mon forum perso', isCategory: false },
    ];
    const plan = planStructure(existing);
    expect(plan.find((p) => p.name === 'Communauté')?.status).toBe('exists');
    expect(plan.find((p) => p.name === 'Présentations')?.status).toBe('exists');
    expect(plan.find((p) => p.name === 'Discussions générales')?.status).toBe('create');
    expect(plan.find((p) => p.name === 'Médias')?.status).toBe('create');
  });
  it('les sous-forums d\'un parent à créer sont tous à créer', () => {
    const plan = planStructure([{ id: 'c1', parentId: null, name: 'Médias', isCategory: true }]);
    expect(plan.find((p) => p.name === 'Films')?.status).toBe('create');
    expect(plan.find((p) => p.name === 'Avis et discussions')?.status).toBe('create');
  });
});
