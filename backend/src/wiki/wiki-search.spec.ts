import { WikiIndex, plainBBCode, tokens } from './wiki-search';

const docs = [
  { id: '1', slug: 'hit-and-run', title: 'Hit & Run : l\'obligation de seed', keywords: 'hnr, hit and run, seed obligatoire', content: 'Après un téléchargement, tu dois seeder [b]72 heures[/b] ou atteindre un ratio de 1.', isFaq: true, category: 'Ratio' },
  { id: '2', slug: 'mot-de-passe', title: 'Connexion et mot de passe oublié', keywords: 'reset, mdp', content: 'Si tu as oublié ton mot de passe, utilise le lien « Mot de passe oublié » sur la page de connexion.', isFaq: false, category: 'Compte' },
  { id: '3', slug: 'points-bonus', title: 'Points bonus et la boutique', keywords: null, content: 'Tu gagnes des points bonus en seedant. Ils servent à acheter du freeleech ou de l\'upload dans la boutique.', isFaq: false, category: 'Ratio' },
  { id: '4', slug: 'lecteur', title: 'Installer le lecteur Seeduction', keywords: 'player', content: 'Le lecteur de bureau lit les torrents pendant leur téléchargement.', isFaq: false, category: 'Lecteur' },
];
const index = new WikiIndex(docs);

describe('wiki search', () => {
  it('ignores accents, plurals and stop words', () => {
    expect(tokens('Comment gérer les points bonus ?')).toEqual(['gerer', 'point', 'bonus']);
  });
  it('strips BBCode', () => {
    expect(plainBBCode('Voir [url=/x]ceci[/url] et [b]ça[/b][img]a.png[/img]')).toBe('Voir ceci et ça');
  });
  it('finds the article by title words', () => {
    expect(index.search('comment marche le hit and run ?')[0].slug).toBe('hit-and-run');
  });
  it('finds it through keywords (abbreviation)', () => {
    expect(index.search('hnr')[0].slug).toBe('hit-and-run');
  });
  it('matches a natural question about a forgotten password', () => {
    expect(index.search("j'ai oublié mon mot de passe")[0].slug).toBe('mot-de-passe');
  });
  it('matches a body-only word without accents', () => {
    expect(index.search('boutique freeleech')[0].slug).toBe('points-bonus');
  });
  it('returns nothing for nonsense', () => {
    expect(index.search('zzzxx blabla')).toEqual([]);
  });
  it('gives a readable excerpt', () => {
    const hit = index.search('seeder 72 heures')[0];
    expect(hit.excerpt).toMatch(/72 heures/);
    expect(hit.excerpt).not.toMatch(/\[b\]/);
  });
});
