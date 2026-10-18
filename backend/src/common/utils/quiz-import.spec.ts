import { parseImport, questionKey } from './quiz-import';

const L = (...c: string[]) => c.join(' ; ');

describe('Import de questions du quiz', () => {
  it('lit des lignes « catégorie ; question ; bonne ; trois mauvaises ; explication »', () => {
    const r = parseImport([
      L('Cinéma', 'Qui a réalisé Alien ?', 'Ridley Scott', 'James Cameron', 'David Fincher', 'Tim Burton', 'Sorti en 1979.'),
      L('Sciences', 'Quel est le symbole du fer ?', 'Fe', 'F', 'Fr', 'Ir'),
    ].join('\n'));
    expect(r.errors).toEqual([]);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toEqual({ category: 'Cinéma', text: 'Qui a réalisé Alien ?', choices: ['Ridley Scott', 'James Cameron', 'David Fincher', 'Tim Burton'], answer: 0, explain: 'Sorti en 1979.' });
    expect(r.items[1].explain).toBeNull();
  });

  it('accepte les tabulations d\'un tableur et la barre verticale', () => {
    const tab = parseImport(['Musique', 'Combien de cordes a un violon ?', '4', '3', '5', '6'].join('\t'));
    expect(tab.items).toHaveLength(1);
    const pipe = parseImport('Musique | Quel instrument a des touches noires et blanches ? | Le piano | La flûte | Le violon | Le tambour');
    expect(pipe.items).toHaveLength(1);
    expect(pipe.items[0].choices[0]).toBe('Le piano');
  });

  it('ignore les lignes vides, les commentaires et l\'en-tête', () => {
    const r = parseImport(['Catégorie ; Question ; Bonne ; M1 ; M2 ; M3', '', '# une note', L('Cinéma', 'Qui a réalisé Alien ?', 'Ridley Scott', 'a1', 'b1', 'c1')].join('\n'));
    expect(r.items).toHaveLength(1);
    expect(r.errors).toEqual([]);
  });

  it('signale chaque ligne invalide avec son numéro et sa raison, sans bloquer les autres', () => {
    const r = parseImport([
      L('Cinéma', 'Question valide numéro un ?', 'oui', 'non', 'peut-être', 'jamais'),
      L('Cinéma', 'Trop peu de colonnes ?', 'oui', 'non'),
      L('Cinéma', 'Réponses en double ?', 'oui', 'Oui', 'peut-être', 'jamais'),
      L('C', 'Catégorie trop courte ?', 'a', 'b', 'c', 'd'),
      L('Cinéma', 'Question valide numéro deux ?', 'un', 'deux', 'trois', 'quatre'),
    ].join('\n'));
    expect(r.items.map((i) => i.text)).toEqual(['Question valide numéro un ?', 'Question valide numéro deux ?']);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(r.errors[0].reason).toMatch(/6 colonnes/);
    expect(r.errors[1].reason).toMatch(/différentes/);
    expect(r.errors[2].reason).toMatch(/catégorie/i);
  });

  it('écarte les doublons de la banque et de l\'import lui-même, sans tenir compte des majuscules', () => {
    const known = new Set([questionKey('Qui a réalisé Alien ?')]);
    const r = parseImport([
      L('Cinéma', 'QUI A RÉALISÉ   ALIEN ?', 'Ridley Scott', 'a', 'b', 'c'),
      L('Cinéma', 'Nouvelle question assez longue ?', 'x', 'y', 'z', 'w'),
      L('Cinéma', 'nouvelle question assez longue ?', 'x', 'y', 'z', 'w'),
    ].join('\n'), known);
    expect(r.items).toHaveLength(1);
    expect(r.errors.map((e) => e.line)).toEqual([1, 3]);
    expect(r.errors[0].reason).toMatch(/déjà présente/);
  });

  it('lit un tableau JSON', () => {
    const r = parseImport(JSON.stringify([
      { category: 'Cinéma', text: 'Qui a réalisé Alien ?', choices: ['a', 'b', 'c', 'd'], answer: 2 },
      { category: 'Cinéma', text: 'Question sans bonne réponse valable ?', choices: ['a', 'b', 'c', 'd'], answer: 9 },
    ]));
    expect(r.items).toHaveLength(1);
    expect(r.items[0].answer).toBe(2);
    expect(r.errors).toEqual([{ line: 2, reason: expect.stringContaining('bonne') }]);
  });

  it('refuse un JSON invalide, qui n\'est pas un tableau, ou trop gros', () => {
    expect(parseImport('[{ nope').errors[0].reason).toMatch(/JSON invalide/);
    expect(parseImport('[]').items).toEqual([]);
    const big = JSON.stringify(Array.from({ length: 501 }, (_, i) => ({ category: 'Test', text: `Question numéro ${i} ?`, choices: ['a', 'b', 'c', 'd'], answer: 0 })));
    expect(parseImport(big).errors[0].reason).toMatch(/500/);
    expect(parseImport(Array(1001).fill('x').join('\n')).errors[0].reason).toMatch(/1 000/);
  });
});
