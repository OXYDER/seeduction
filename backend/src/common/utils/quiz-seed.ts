/**
 * Banque de questions fournie avec le site (ajoutée une seule fois au premier démarrage ; l'administration peut ensuite en ajouter, modifier ou retirer).
 * La bonne réponse est écrite en premier : l'ordre est mélangé à chaque partie.
 */
export interface SeedQuestion { category: string; text: string; choices: string[]; answer: 0; explain: string | null }

type Row = [category: string, text: string, good: string, w1: string, w2: string, w3: string, explain?: string];

const ROWS: Row[] = [
  // Hockey
  ['Hockey', 'Combien de Coupes Stanley le Canadien de Montréal a-t-il remportées ?', '24', '21', '27', '18', 'Le Canadien est l\'équipe qui compte le plus de Coupes Stanley.'],
  ['Hockey', 'Dans quel amphithéâtre joue le Canadien de Montréal ?', 'Centre Bell', 'Centre Vidéotron', 'Forum de Montréal', 'Stade olympique'],
  ['Hockey', 'Quel joueur était surnommé « le Rocket » ?', 'Maurice Richard', 'Guy Lafleur', 'Jean Béliveau', 'Yvan Cournoyer'],
  ['Hockey', 'Quel est le surnom de Guy Lafleur ?', 'Le Démon blond', 'Le Gros Bill', 'Le Rocket', 'Le Petit Poucet'],
  ['Hockey', 'Combien de joueurs une équipe a-t-elle sur la glace, gardien compris ?', '6', '5', '7', '8'],
  ['Hockey', 'Quelle est la durée d\'une période dans la LNH ?', '20 minutes', '15 minutes', '25 minutes', '30 minutes'],
  ['Hockey', 'Quel trophée récompense le meilleur gardien de but de la LNH ?', 'Trophée Vézina', 'Trophée Hart', 'Trophée Norris', 'Trophée Calder'],
  ['Hockey', 'Quel trophée récompense le meilleur défenseur de la LNH ?', 'Trophée Norris', 'Trophée Vézina', 'Trophée Art-Ross', 'Trophée Lady-Byng'],
  ['Hockey', 'Quel numéro de Patrick Roy a été retiré par le Canadien ?', '33', '29', '31', '35'],
  ['Hockey', 'Quelle ville accueille les Maple Leafs dans la LNH ?', 'Toronto', 'Ottawa', 'Winnipeg', 'Calgary'],
  // Cinéma
  ['Cinéma', 'Qui a réalisé le film Titanic ?', 'James Cameron', 'Steven Spielberg', 'Ridley Scott', 'Tim Burton'],
  ['Cinéma', 'Qui a réalisé le film Inception ?', 'Christopher Nolan', 'Denis Villeneuve', 'David Fincher', 'Martin Scorsese'],
  ['Cinéma', 'Quel acteur incarne Jack Sparrow dans Pirates des Caraïbes ?', 'Johnny Depp', 'Orlando Bloom', 'Brad Pitt', 'Tom Cruise'],
  ['Cinéma', 'Dans Star Wars, qui est le père de Luke Skywalker ?', 'Dark Vador', 'Obi-Wan Kenobi', 'Yoda', 'Han Solo'],
  ['Cinéma', 'Quel studio a créé Toy Story ?', 'Pixar', 'DreamWorks', 'Illumination', 'Blue Sky'],
  ['Cinéma', 'Quel est le premier film de la trilogie du Seigneur des anneaux ?', 'La Communauté de l\'anneau', 'Les Deux Tours', 'Le Retour du roi', 'Un voyage inattendu'],
  ['Cinéma', 'Qui a réalisé le film Pulp Fiction ?', 'Quentin Tarantino', 'Guy Ritchie', 'Oliver Stone', 'Spike Lee'],
  ['Cinéma', 'Quel acteur joue Neo dans Matrix ?', 'Keanu Reeves', 'Will Smith', 'Nicolas Cage', 'Hugh Jackman'],
  ['Cinéma', 'Quel réalisateur québécois a dirigé Dune (2021) ?', 'Denis Villeneuve', 'Xavier Dolan', 'Jean-Marc Vallée', 'Denys Arcand'],
  ['Cinéma', 'Quel film de Denys Arcand a remporté l\'Oscar du meilleur film en langue étrangère en 2004 ?', 'Les Invasions barbares', 'Le Déclin de l\'empire américain', 'Jésus de Montréal', 'Séraphin'],
  // Séries
  ['Séries', 'Quelle série met en scène Walter White, professeur de chimie devenu fabricant de drogue ?', 'Breaking Bad', 'The Wire', 'Ozark', 'Narcos'],
  ['Séries', 'Quelle maison est celle de Daenerys dans Game of Thrones ?', 'Targaryen', 'Stark', 'Lannister', 'Baratheon'],
  ['Séries', 'Comment s\'appelle la ville fictive de Stranger Things ?', 'Hawkins', 'Springfield', 'Riverdale', 'Twin Peaks'],
  ['Séries', 'Combien d\'amis principaux compte la série Friends ?', '6', '4', '5', '7'],
  ['Séries', 'Dans la série The Office (version américaine), dans quelle ville se trouve Dunder Mifflin ?', 'Scranton', 'Pittsburgh', 'Buffalo', 'Albany'],
  ['Séries', 'Quel humoriste est la vedette de la série québécoise Les Beaux Malaises ?', 'Martin Matte', 'Louis-José Houde', 'Rémy Girard', 'Guy A. Lepage'],
  ['Séries', 'Quelle série d\'animation met en scène la famille Simpson ?', 'Les Simpson', 'Family Guy', 'South Park', 'Futurama'],
  // Musique
  ['Musique', 'Quel groupe a chanté Bohemian Rhapsody ?', 'Queen', 'Led Zeppelin', 'Pink Floyd', 'The Rolling Stones'],
  ['Musique', 'Quel artiste a chanté Thriller ?', 'Michael Jackson', 'Prince', 'Stevie Wonder', 'Elton John'],
  ['Musique', 'Combien de cordes compte une guitare classique ?', '6', '4', '5', '8'],
  ['Musique', 'Dans quelle ville est né le groupe des Beatles ?', 'Liverpool', 'Londres', 'Manchester', 'Dublin'],
  ['Musique', 'Quel artiste a chanté La Bohème ?', 'Charles Aznavour', 'Jacques Brel', 'Georges Brassens', 'Édith Piaf'],
  ['Musique', 'Quel groupe a chanté Hotel California ?', 'Eagles', 'Fleetwood Mac', 'The Doors', 'Aerosmith'],
  ['Musique', 'Combien de touches compte un piano classique ?', '88', '66', '76', '100'],
  // Géographie
  ['Géographie', 'Quelle est la capitale du Canada ?', 'Ottawa', 'Toronto', 'Montréal', 'Québec'],
  ['Géographie', 'Quel est le plus long fleuve du Québec ?', 'Le Saint-Laurent', 'Le Saguenay', 'L\'Outaouais', 'Le Richelieu'],
  ['Géographie', 'Combien de provinces compte le Canada ?', '10', '8', '12', '13'],
  ['Géographie', 'Quelle province canadienne est la plus à l\'ouest ?', 'Colombie-Britannique', 'Alberta', 'Saskatchewan', 'Manitoba'],
  ['Géographie', 'Quel est le plus haut sommet du Canada ?', 'Le mont Logan', 'Le mont Royal', 'Le mont Tremblant', 'Le mont Washington'],
  ['Géographie', 'Quelle est la capitale de l\'Australie ?', 'Canberra', 'Sydney', 'Melbourne', 'Perth'],
  ['Géographie', 'Quelle est la capitale du Brésil ?', 'Brasilia', 'Rio de Janeiro', 'São Paulo', 'Salvador'],
  ['Géographie', 'Quel est le plus grand océan du monde ?', 'L\'océan Pacifique', 'L\'océan Atlantique', 'L\'océan Indien', 'L\'océan Arctique'],
  ['Géographie', 'Dans quel pays se trouve la tour de Pise ?', 'Italie', 'France', 'Espagne', 'Grèce'],
  ['Géographie', 'Combien de continents compte-t-on habituellement ?', '7', '5', '6', '8'],
  // Culture générale
  ['Culture', 'Quel animal figure sur la pièce canadienne de cinq cents ?', 'Le castor', 'Le huard', 'Le caribou', 'L\'orignal'],
  ['Culture', 'Quel animal figure sur la pièce canadienne d\'un dollar ?', 'Le huard', 'Le castor', 'Le caribou', 'L\'ours polaire'],
  ['Culture', 'Quelle est la date de la Fête nationale du Québec ?', 'Le 24 juin', 'Le 1er juillet', 'Le 15 août', 'Le 21 juin'],
  ['Culture', 'Quelle est la date de la fête du Canada ?', 'Le 1er juillet', 'Le 24 juin', 'Le 4 juillet', 'Le 11 novembre'],
  ['Culture', 'Quel peintre a réalisé La Joconde ?', 'Léonard de Vinci', 'Michel-Ange', 'Raphaël', 'Rembrandt'],
  ['Culture', 'Qui a écrit Les Misérables ?', 'Victor Hugo', 'Émile Zola', 'Alexandre Dumas', 'Gustave Flaubert'],
  ['Culture', 'Quel peintre a réalisé La Nuit étoilée ?', 'Vincent van Gogh', 'Claude Monet', 'Pablo Picasso', 'Salvador Dalí'],
  ['Culture', 'Quelle est la monnaie du Japon ?', 'Le yen', 'Le won', 'Le yuan', 'La roupie'],
  ['Culture', 'À quel sport associe-t-on la Coupe Grey ?', 'Le football canadien', 'Le hockey', 'Le baseball', 'Le curling'],
  ['Culture', 'Quel pays a gagné la Coupe du monde de football de 2022 ?', 'L\'Argentine', 'La France', 'Le Brésil', 'La Croatie'],
  ['Culture', 'Dans quelle ville se sont tenus les Jeux olympiques d\'été de 2024 ?', 'Paris', 'Tokyo', 'Los Angeles', 'Londres'],
  ['Culture', 'De quel arbre extrait-on principalement la sève qui donne le sirop d\'érable ?', 'L\'érable à sucre', 'Le bouleau jaune', 'Le chêne rouge', 'Le peuplier'],
  // Sciences
  ['Sciences', 'Quelle planète est la plus proche du Soleil ?', 'Mercure', 'Vénus', 'Mars', 'Jupiter'],
  ['Sciences', 'Quelle est la plus grande planète du système solaire ?', 'Jupiter', 'Saturne', 'Neptune', 'La Terre'],
  ['Sciences', 'Combien de planètes compte le système solaire ?', '8', '7', '9', '10'],
  ['Sciences', 'Quel est le symbole chimique de l\'or ?', 'Au', 'Ag', 'Or', 'Fe'],
  ['Sciences', 'Quel est le plus grand mammifère du monde ?', 'La baleine bleue', 'L\'éléphant d\'Afrique', 'Le requin-baleine', 'La girafe'],
  ['Sciences', 'Quel est l\'os le plus long du corps humain ?', 'Le fémur', 'Le tibia', 'L\'humérus', 'La colonne vertébrale'],
  ['Sciences', 'En quelle année l\'être humain a-t-il marché sur la Lune pour la première fois ?', '1969', '1961', '1975', '1957'],
  ['Sciences', 'Quel organe pompe le sang dans le corps ?', 'Le cœur', 'Le foie', 'Les poumons', 'Le rein'],
  ['Sciences', 'À quelle température l\'eau bout-elle au niveau de la mer ?', '100 °C', '90 °C', '120 °C', '80 °C'],
  // Technologie
  ['Technologie', 'Quel système d\'exploitation libre a été créé par Linus Torvalds ?', 'Linux', 'Windows', 'macOS', 'Android'],
  ['Technologie', 'Qui est l\'inventeur du World Wide Web ?', 'Tim Berners-Lee', 'Bill Gates', 'Steve Jobs', 'Mark Zuckerberg'],
  ['Technologie', 'Combien de bits compte un octet ?', '8', '4', '16', '10'],
  ['Technologie', 'Que signifie l\'abréviation USB ?', 'Universal Serial Bus', 'Ultra Speed Board', 'United System Bridge', 'Universal Storage Box'],
  ['Technologie', 'Quel langage sert à structurer le contenu d\'une page web ?', 'HTML', 'CSS', 'SQL', 'Python'],
  ['Technologie', 'Dans le partage de fichiers, que fait un « seeder » ?', 'Il partage le fichier complet', 'Il télécharge sans partager', 'Il supprime les fichiers', 'Il crée les comptes'],
  ['Technologie', 'Que contient un fichier .torrent ?', 'Les informations pour retrouver le contenu, pas le contenu lui-même', 'Le film complet', 'Un virus', 'Un mot de passe'],
  ['Technologie', 'Comment calcule-t-on le ratio d\'un membre sur un tracker ?', 'Données envoyées ÷ données téléchargées', 'Données téléchargées ÷ données envoyées', 'Nombre de messages ÷ nombre de jours', 'Points bonus ÷ torrents'],
  // Seeduction
  ['Seeduction', 'À quel jour de suite la roue de la fortune offre-t-elle un bonus supplémentaire ?', 'Le 7e jour', 'Le 3e jour', 'Le 5e jour', 'Le 10e jour', 'Reviens chaque jour : le 7e jour de suite rapporte un bonus.'],
  ['Seeduction', 'Les points reçus par un don peuvent-ils être misés dans les jeux ?', 'Non', 'Oui, toujours', 'Seulement le dimanche', 'Seulement aux machines à sous'],
];

export const QUIZ_SEED: SeedQuestion[] = ROWS.map(([category, text, good, w1, w2, w3, explain]) => ({ category, text, choices: [good, w1, w2, w3], answer: 0, explain: explain ?? null }));
