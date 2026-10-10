import { choiceHashOf, pickLearned } from './import-memory';

const row = (confirmations: number, members: string[]) => ({ confirmations, members });

describe('choix appris des membres : le poids décide', () => {
  it('rien en dessous d\'une acceptation', () => {
    expect(pickLearned([])).toBeNull();
    expect(pickLearned([row(0, [])])).toBeNull();
  });

  it('1 ou 2 acceptations : simple suggestion', () => {
    expect(pickLearned([row(1, ['a'])])?.level).toBe('suggest');
    expect(pickLearned([row(2, ['a', 'b'])])?.level).toBe('suggest');
  });

  it('3 acceptations de 2 membres différents : rangé tout seul', () => {
    expect(pickLearned([row(3, ['a', 'b'])])?.level).toBe('auto');
  });

  it('3 acceptations d\'un seul membre : encore une suggestion (une seule personne ne décide pas seule)', () => {
    expect(pickLearned([row(3, ['a'])])?.level).toBe('suggest');
    expect(pickLearned([row(5, ['a'])])?.level).toBe('suggest');
  });

  it('6 acceptations suffisent, même d\'un seul membre (la modération a validé six fois)', () => {
    expect(pickLearned([row(6, ['a'])])?.level).toBe('auto');
  });

  it('plus le poids monte, plus on s\'y fie (suggestion -> auto)', () => {
    const levels = [1, 2, 3, 4].map((n) => pickLearned([row(n, ['a', 'b'])])?.level);
    expect(levels).toEqual(['suggest', 'suggest', 'auto', 'auto']);
  });

  it('désaccord entre membres : retenu seulement s\'il pèse au moins le double de tous les autres', () => {
    expect(pickLearned([row(4, ['a', 'b']), row(3, ['c'])])).toBeNull();
    expect(pickLearned([row(4, ['a', 'b']), row(2, ['c'])])?.level).toBe('auto');
    expect(pickLearned([row(8, ['a', 'b']), row(2, ['c']), row(2, ['d'])])?.level).toBe('auto');
    expect(pickLearned([row(5, ['a', 'b']), row(3, ['c']), row(3, ['d'])])).toBeNull();
  });

  it('renvoie le choix gagnant', () => {
    const a = row(1, ['a']), b = row(5, ['a', 'b']);
    expect(pickLearned([a, b])?.row).toBe(b);
  });
});

describe('empreinte d\'un choix', () => {
  it('même catégorie + même fiche = même empreinte ; autre fiche ou « sans fiche » = autre empreinte', () => {
    const a = choiceHashOf({ categoryId: 'c1', metaKind: 'SERIE', metaId: '5' });
    expect(choiceHashOf({ categoryId: 'c1', metaKind: 'SERIE', metaId: '5' })).toBe(a);
    expect(choiceHashOf({ categoryId: 'c1', metaKind: 'SERIE', metaId: '6' })).not.toBe(a);
    expect(choiceHashOf({ categoryId: 'c2', metaKind: 'SERIE', metaId: '5' })).not.toBe(a);
    expect(choiceHashOf({ categoryId: 'c1', noMeta: true })).not.toBe(choiceHashOf({ categoryId: 'c1' }));
  });
});
