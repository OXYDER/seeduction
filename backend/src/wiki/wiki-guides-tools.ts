import type { WikiSeedCategory } from './wiki-seed';

/**
 * Guides « brancher tes outils » : Prowlarr, Sonarr, Radarr, Lidarr, Readarr, Jackett et les flux RSS des clients torrent.
 * IMPORTANT : comme tout le wiki (voir wiki-seed.ts), ces guides doivent rester à jour avec le site. Si l'adresse de l'API, ses paramètres,
 * ses catégories ou la page « API & flux RSS » (frontend/src/pages/Integrations.tsx) changent, mets ces articles à jour dans le même commit.
 * Le texte {SITE} est remplacé par l'adresse du site (celle de la barre d'adresse du navigateur) à l'affichage.
 */
export const GUIDES_TOOLS: WikiSeedCategory = {
  name: 'Guides : brancher tes outils (Prowlarr, Sonarr, RSS…)',
  slug: 'guides-outils',
  icon: '🔌',
  articles: [
    {
      title: 'Guides : par où commencer',
      slug: 'guides',
      keywords: 'guides, tutoriel, pas à pas, comment faire, aide, débutant, par où commencer, sommaire',
      isFaq: true,
      content:
        `Les guides expliquent, pas à pas et en langage simple, comment utiliser Seeduction. Chaque guide commence par l'essentiel, puis détaille chaque étape. Ils sont mis à jour en même temps que le site.\n\n` +
        `[b]Je débute[/b]\n` +
        `• [url=/wiki/guide-premiers-pas]Premiers pas : de l'inscription à ton premier torrent[/url]\n` +
        `• [url=/wiki/guide-telecharger]Télécharger un torrent[/url]\n` +
        `• [url=/wiki/guide-trouver]Trouver ce que tu cherches[/url]\n` +
        `• [url=/wiki/guide-ratio-seed]Garder un bon ratio : le seed expliqué simplement[/url]\n\n` +
        `[b]Brancher mes outils (automatisation)[/b]\n` +
        `• [url=/wiki/guide-api-et-cles]Comprendre l'API, la clé API et les flux RSS[/url] puis ouvre la page [url=/integrations]API & flux RSS[/url] : elle génère toutes les adresses pour toi.\n` +
        `• [url=/wiki/guide-prowlarr]Prowlarr[/url] (le plus simple : il partage Seeduction avec tous les autres)\n` +
        `• [url=/wiki/guide-sonarr]Sonarr[/url] (séries) · [url=/wiki/guide-radarr]Radarr[/url] (films) · [url=/wiki/guide-lidarr]Lidarr[/url] (musique) · [url=/wiki/guide-readarr]Readarr[/url] (livres)\n` +
        `• [url=/wiki/guide-jackett]Jackett[/url]\n` +
        `• [url=/wiki/guide-rss-clients]Flux RSS dans qBittorrent, ruTorrent, Deluge…[/url]\n` +
        `• [url=/wiki/guide-depannage-api]Ça ne marche pas : dépannage[/url]\n\n` +
        `[b]Partager des torrents[/b]\n` +
        `• [url=/wiki/guide-envoyer-premier-torrent]Envoyer ton premier torrent[/url]\n` +
        `• [url=/wiki/guide-nommer-releases]Bien nommer et décrire une release : langues, qualité, NFO[/url]\n` +
        `• [url=/wiki/guide-fiches]Les fiches (TMDB, ThePornDB…) et les packs[/url]\n` +
        `• [url=/wiki/guide-envoyer-plusieurs]Envoyer plusieurs torrents depuis ton client[/url] et [url=/wiki/guide-envoi-multiple-depannage]son dépannage[/url]\n\n` +
        `[b]Profiter du site[/b]\n` +
        `• [url=/wiki/guide-points-bonus]Points bonus[/url] · [url=/wiki/guide-pot-commun]Pot commun[/url] · [url=/wiki/guide-hit-and-run-reparer]Réparer un hit & run[/url] · [url=/wiki/guide-reanimation]Faire revivre un torrent[/url] · [url=/wiki/guide-demandes]Demandes[/url]\n` +
        `• [url=/wiki/guide-lecteur]Le lecteur Seeduction[/url] · [url=/wiki/guide-personnaliser]Personnaliser le site[/url] · [url=/wiki/guide-favoris-collections]Favoris et collections[/url] · [url=/wiki/guide-stats]Statistiques[/url]\n` +
        `• [url=/wiki/guide-messenger]Messenger[/url] · [url=/wiki/guide-forum-nouvelles]Forum, nouvelles, commentaires[/url] · [url=/wiki/guide-teams]Teams[/url] · [url=/wiki/guide-support]Obtenir de l'aide[/url]\n` +
        `• [url=/wiki/guide-compte-securite]Sécuriser ton compte[/url] · [url=/wiki/guide-compte-famille]Compte famille[/url]\n\n` +
        `[b]Pour le staff[/b]\n` +
        `• [url=/wiki/guide-staff-moderation]Modérer : traiter la file[/url] · [url=/wiki/guide-staff-import]Import automatique (Admin > Import)[/url] · [url=/wiki/guide-staff-outils]Autres outils du staff[/url]\n\n` +
        `Une question qui n'est pas ici ? Cherche dans le [url=/wiki]wiki[/url] (barre de recherche) ou ouvre le [url=/wiki/support-chat-et-billets]Support[/url].`,
    },
    {
      title: "Comprendre l'API, la clé API et les flux RSS",
      slug: 'guide-api-et-cles',
      keywords: 'api, torznab, clé api, apikey, rss, flux, prowlarr, sonarr, radarr, lidarr, readarr, jackett, indexeur, automatisation, adresse',
      isFaq: true,
      content:
        `Seeduction sait « parler » aux outils d'automatisation les plus répandus : [b]Prowlarr, Jackett, Sonarr, Radarr, Lidarr et Readarr[/b]. Il fournit aussi des [b]flux RSS[/b] que ton client torrent (qBittorrent, ruTorrent, Deluge…) peut lire pour télécharger automatiquement ce qui t'intéresse.\n\n` +
        `Pour te simplifier la vie, la page [url=/integrations]API & flux RSS[/url] (menu du compte) génère toutes les adresses et les valeurs à copier. Ce guide explique ce que ça veut dire.\n\n` +
        `[b]Les 3 notions à connaître[/b]\n` +
        `• [b]Torznab[/b] : le nom du « langage » que ces outils utilisent pour interroger un tracker. Tu n'as rien à comprendre de technique : on te donne une adresse et une clé, tu les colles dans l'outil.\n` +
        `• [b]La clé API[/b] : ton « mot de passe » pour les outils. Elle leur permet de chercher et de télécharger [b]en ton nom[/b]. Elle commence par « sd_ ». Elle est créée dans la page API & flux RSS (bouton « 🔑 Créer une clé pour mes outils ») ou dans Profil > Développeur.\n` +
        `• [b]Un flux RSS[/b] : une adresse que ton client relit régulièrement pour voir les nouveaux torrents. C'est la même adresse que Torznab, avec des filtres en plus (catégorie, langue, résolution…).\n\n` +
        `[b]Les adresses de Seeduction[/b]\n` +
        `• Adresse de base : [code]{SITE}[/code]\n` +
        `• Chemin de l'API : [code]/api[/code] (les outils l'ajoutent tout seuls à l'adresse de base). L'adresse complète est donc [code]{SITE}/api[/code]\n` +
        `• Test sans clé, dans ton navigateur : [code]{SITE}/api?t=caps[/code] doit afficher du texte XML (les « capacités » du site).\n` +
        `• Dernières nouveautés avec ta clé : [code]{SITE}/api?t=search&apikey=TA_CLE&limit=5[/code]\n\n` +
        `[b]Créer et protéger ta clé[/b]\n` +
        `• Crée une clé avec les deux portées [b]torrents:read[/b] (chercher) et [b]torrents:download[/b] (télécharger). Le bouton de la page API & flux RSS les coche pour toi.\n` +
        `• La clé n'est affichée [b]qu'une seule fois[/b], à sa création : copie-la tout de suite. Si tu la perds, crée-en une autre et révoque l'ancienne (Profil > Développeur).\n` +
        `• Ne la partage avec personne : quiconque la possède peut télécharger en ton nom, et les téléchargements comptent dans [b]ton[/b] ratio.\n` +
        `• Une clé par outil est une bonne habitude : tu peux en révoquer une sans casser les autres.\n` +
        `• Un compte famille : les clés appartiennent au profil principal.\n\n` +
        `[b]Ce que ça change pour ton ratio[/b]\n` +
        `Les téléchargements lancés par un outil sont de vrais téléchargements : le ratio, le freeleech, le hit & run et le contenu adulte (masqué tant que tu ne l'as pas activé dans ton compte) s'appliquent exactement comme sur le site. Les .torrent reçus contiennent [b]ta[/b] passkey. Lis [url=/wiki/guide-ratio-seed]Garder un bon ratio[/url] avant d'automatiser des téléchargements en masse.\n\n` +
        `[b]Les catégories (numéros)[/b]\n` +
        `Les outils classent les torrents avec des numéros standard : [b]2000[/b] films (2030 SD, 2040 HD, 2045 UHD, 2050 Blu-ray), [b]5000[/b] séries et émissions (5030 SD, 5040 HD, 5045 UHD, 5060 sport, 5070 animes, 5080 documentaires), [b]3000[/b] musique (3010 MP3, 3040 sans perte), [b]7000[/b] livres (7020 ebooks, 7030 bandes dessinées), [b]4000[/b] PC (jeux 4050, logiciels), [b]1000[/b] consoles, [b]6000[/b] adulte, [b]8000[/b] autres. Seeduction range chaque torrent dans le bon numéro d'après sa catégorie et sa qualité. La page API & flux RSS indique les numéros à cocher pour chaque outil.\n\n` +
        `[b]Les limites[/b]\n` +
        `• 120 requêtes par minute et par clé, et 100 résultats au maximum par réponse : largement suffisant pour Sonarr, Radarr et compagnie.\n` +
        `• Une clé révoquée cesse de fonctionner tout de suite.\n\n` +
        `[b]Et ensuite ?[/b]\n` +
        `Choisis ton outil : [url=/wiki/guide-prowlarr]Prowlarr[/url] (recommandé), [url=/wiki/guide-sonarr]Sonarr[/url], [url=/wiki/guide-radarr]Radarr[/url], [url=/wiki/guide-lidarr]Lidarr[/url], [url=/wiki/guide-readarr]Readarr[/url], [url=/wiki/guide-jackett]Jackett[/url] ou le [url=/wiki/guide-rss-clients]flux RSS de ton client[/url]. En cas de souci : [url=/wiki/guide-depannage-api]dépannage[/url].`,
    },
    {
      title: 'Brancher Seeduction à Prowlarr',
      slug: 'guide-prowlarr',
      keywords: 'prowlarr, torznab, indexeur, indexer, generic torznab, sonarr, radarr, lidarr, readarr, sync, apps',
      isFaq: true,
      content:
        `Prowlarr est le « chef d'orchestre » des indexeurs : tu ajoutes Seeduction [b]une seule fois[/b] dans Prowlarr, et il le partage automatiquement avec Sonarr, Radarr, Lidarr et Readarr. C'est la méthode la plus simple si tu utilises plusieurs de ces applications.\n\n` +
        `[b]Avant de commencer[/b]\n` +
        `Il te faut ta clé API : ouvre la page [url=/integrations]API & flux RSS[/url], clique sur « 🔑 Créer une clé pour mes outils » et garde la page ouverte, ses valeurs sont déjà remplies avec ta clé (onglet Prowlarr). Détails sur la clé : [url=/wiki/guide-api-et-cles]Comprendre l'API[/url].\n\n` +
        `[b]Étape 1 : ajouter l'indexeur[/b]\n` +
        `1. Dans Prowlarr, va dans [b]Indexers[/b] puis clique sur [b]Add Indexer[/b] (le bouton « + »).\n` +
        `2. Dans la zone de recherche, tape [b]Generic Torznab[/b] et choisis-le.\n\n` +
        `[b]Étape 2 : remplir les champs[/b]\n` +
        `• [b]Name[/b] : Seeduction (le nom que tu veux).\n` +
        `• [b]Base Url / URL[/b] : [code]{SITE}[/code]\n` +
        `• [b]API Path[/b] : [code]/api[/code] (c'est la valeur par défaut, ne la change pas).\n` +
        `• [b]API Key[/b] : ta clé API (commence par sd_).\n` +
        `• [b]Categories[/b] : laisse les catégories proposées, Prowlarr les récupère tout seul auprès de Seeduction.\n` +
        `• [b]Seed Ratio[/b] : 1 et [b]Seed Time[/b] : 4320 (minutes, soit 72 heures). Ce sont les objectifs de Seeduction (voir [url=/wiki/hit-and-run]Hit & Run[/url]) : ainsi les torrents ne sont pas supprimés trop tôt.\n` +
        `• Minimum Seeders : 1 est un bon réglage (évite de grabber un torrent sans seeder).\n\n` +
        `[b]Étape 3 : tester et enregistrer[/b]\n` +
        `Clique sur [b]Test[/b] : tu dois voir une coche verte. Puis [b]Save[/b]. Si le test échoue, regarde le [url=/wiki/guide-depannage-api]dépannage[/url].\n\n` +
        `[b]Étape 4 : partager avec Sonarr, Radarr, Lidarr, Readarr[/b]\n` +
        `1. Dans Prowlarr : [b]Settings > Apps[/b] puis « + » et choisis l'application (Sonarr, Radarr…).\n` +
        `2. [b]Prowlarr Server[/b] : l'adresse de Prowlarr (par exemple http://localhost:9696). [b]Sonarr Server[/b] : l'adresse de Sonarr (par exemple http://localhost:8989).\n` +
        `3. [b]API Key[/b] : la clé API [i]de Sonarr[/i] (dans Sonarr : Settings > General > Security). Ne la confonds pas avec celle de Seeduction.\n` +
        `4. Laisse la synchronisation sur [b]Full Sync[/b], teste, enregistre. Fais la même chose pour chaque application.\n\n` +
        `Quelques secondes plus tard, Seeduction apparaît tout seul dans les indexeurs de Sonarr, Radarr, etc. : rien d'autre à configurer de ce côté.\n\n` +
        `[b]Vérifier que ça marche[/b]\n` +
        `Dans Prowlarr, ouvre [b]Search[/b], tape le titre d'un film : tu dois voir des résultats de Seeduction avec leur taille, leurs seeders et leur catégorie. Un clic sur la flèche de téléchargement envoie le torrent à ton client.\n\n` +
        `[b]Bon à savoir[/b]\n` +
        `• Les résultats reflètent ton compte : le contenu adulte n'apparaît que si tu l'as activé dans Profil > Compte.\n` +
        `• Les téléchargements comptent pour ton ratio : voir [url=/wiki/guide-ratio-seed]Garder un bon ratio[/url].\n` +
        `• Pour les films, séries, musique et livres, voir aussi [url=/wiki/guide-radarr]Radarr[/url], [url=/wiki/guide-sonarr]Sonarr[/url], [url=/wiki/guide-lidarr]Lidarr[/url], [url=/wiki/guide-readarr]Readarr[/url] (réglages du client de téléchargement, qualité…).`,
    },
    {
      title: 'Brancher Seeduction à Sonarr (séries)',
      slug: 'guide-sonarr',
      keywords: 'sonarr, séries, torznab, indexeur, tv, saison, épisode, anime, catégories 5000',
      isFaq: true,
      content:
        `Sonarr surveille tes séries et télécharge les nouveaux épisodes dès qu'ils sortent. Si tu utilises Prowlarr, ajoute plutôt Seeduction dans [url=/wiki/guide-prowlarr]Prowlarr[/url] : il l'enverra à Sonarr tout seul. Sinon, voici comment l'ajouter directement.\n\n` +
        `[b]Avant de commencer[/b]\n` +
        `Crée ta clé API dans la page [url=/integrations]API & flux RSS[/url] (onglet Sonarr : les valeurs sont déjà remplies). Explications : [url=/wiki/guide-api-et-cles]Comprendre l'API[/url].\n\n` +
        `[b]Étape 1 : ajouter l'indexeur[/b]\n` +
        `1. Dans Sonarr : [b]Settings > Indexers[/b], puis le bouton « + ».\n` +
        `2. Choisis [b]Torznab[/b] (le choix « Custom » dans la liste des Torznab).\n\n` +
        `[b]Étape 2 : remplir les champs[/b]\n` +
        `• [b]Name[/b] : Seeduction.\n` +
        `• [b]Enable RSS Sync[/b], [b]Enable Automatic Search[/b], [b]Enable Interactive Search[/b] : laisse tout activé.\n` +
        `• [b]URL[/b] : [code]{SITE}[/code]\n` +
        `• [b]API Path[/b] : [code]/api[/code]\n` +
        `• [b]API Key[/b] : ta clé API Seeduction.\n` +
        `• [b]Categories[/b] : [code]5000,5030,5040,5045[/code] (séries, SD, HD, UHD).\n` +
        `• [b]Anime Categories[/b] : [code]5070[/code] (animes), si tu en suis.\n` +
        `• [b]Minimum Seeders[/b] : 1.\n` +
        `• [b]Seed Ratio[/b] : 1 — [b]Seed Time[/b] : 4320 (minutes = 72 h) — [b]Season-Pack Seed Time[/b] : 4320. Ce sont les objectifs de Seeduction : voir [url=/wiki/hit-and-run]Hit & Run[/url].\n\n` +
        `[b]Étape 3 : tester[/b]\n` +
        `Clique sur [b]Test[/b] : coche verte attendue, puis [b]Save[/b]. En cas d'erreur : [url=/wiki/guide-depannage-api]dépannage[/url].\n\n` +
        `[b]Étape 4 : ton client de téléchargement[/b]\n` +
        `Sonarr a besoin d'un client torrent : [b]Settings > Download Clients > « + »[/b] puis qBittorrent, Transmission, Deluge ou rTorrent, avec son adresse, son port, son identifiant et son mot de passe. Teste et enregistre. Suis la documentation de Sonarr pour les dossiers et les catégories de ton client.\n\n` +
        `[b]Étape 5 : attention au seed[/b]\n` +
        `Dans [b]Settings > Download Clients[/b], l'option [b]Remove Completed[/b] supprime un torrent une fois ses objectifs de seed atteints. Avec les valeurs ci-dessus (ratio 1 ou 72 h) elle respecte la règle de Seeduction. Ne la règle jamais pour supprimer plus tôt, sinon tu risques des hit & run.\n\n` +
        `[b]Comment Sonarr trouve les épisodes[/b]\n` +
        `Sonarr cherche par titre, saison et épisode. Seeduction retrouve les noms de release avec des points (« Ma.Serie.S01E02 ») et ajoute les saisons complètes quand tu cherches un épisode. Une série sans résultat ? Vérifie qu'elle existe sur [url=/browse]Parcourir[/url] : sinon fais une [url=/wiki/guide-demandes]demande[/url].\n\n` +
        `[b]Conseils[/b]\n` +
        `• Commence par une seule série pour tester, puis ajoute les autres.\n` +
        `• Mets des profils de qualité raisonnables : télécharger du 4K pour toute une bibliothèque consomme du ratio.\n` +
        `• Les torrents freeleech ne coûtent rien en ratio : ils sont signalés dans les résultats.`,
    },
    {
      title: 'Brancher Seeduction à Radarr (films)',
      slug: 'guide-radarr',
      keywords: 'radarr, films, torznab, indexeur, movie, catégories 2000, qualité, 4k',
      isFaq: true,
      content:
        `Radarr surveille ta liste de films et télécharge ceux qui sortent ou que tu ajoutes. Si tu utilises Prowlarr, ajoute plutôt Seeduction dans [url=/wiki/guide-prowlarr]Prowlarr[/url]. Sinon, voici comment l'ajouter directement dans Radarr.\n\n` +
        `[b]Avant de commencer[/b]\n` +
        `Crée ta clé API dans la page [url=/integrations]API & flux RSS[/url] (onglet Radarr : les valeurs sont déjà remplies). Explications : [url=/wiki/guide-api-et-cles]Comprendre l'API[/url].\n\n` +
        `[b]Étape 1 : ajouter l'indexeur[/b]\n` +
        `1. Dans Radarr : [b]Settings > Indexers[/b], puis le bouton « + ».\n` +
        `2. Choisis [b]Torznab[/b] (« Custom »).\n\n` +
        `[b]Étape 2 : remplir les champs[/b]\n` +
        `• [b]Name[/b] : Seeduction. Laisse activés RSS, recherche automatique et recherche interactive.\n` +
        `• [b]URL[/b] : [code]{SITE}[/code]\n` +
        `• [b]API Path[/b] : [code]/api[/code]\n` +
        `• [b]API Key[/b] : ta clé API Seeduction.\n` +
        `• [b]Categories[/b] : [code]2000,2030,2040,2045,2050[/code] (films, SD, HD, UHD, Blu-ray).\n` +
        `• [b]Minimum Seeders[/b] : 1.\n` +
        `• [b]Seed Ratio[/b] : 1 — [b]Seed Time[/b] : 4320 (minutes = 72 h) : les objectifs de Seeduction ([url=/wiki/hit-and-run]Hit & Run[/url]).\n\n` +
        `[b]Étape 3 : tester[/b]\n` +
        `Clique sur [b]Test[/b], puis [b]Save[/b]. En cas d'erreur : [url=/wiki/guide-depannage-api]dépannage[/url].\n\n` +
        `[b]Étape 4 : ton client de téléchargement[/b]\n` +
        `[b]Settings > Download Clients > « + »[/b] : choisis ton client torrent (qBittorrent, Transmission, Deluge, rTorrent), renseigne son adresse et ses identifiants, teste et enregistre.\n\n` +
        `[b]Choisir la langue et la qualité[/b]\n` +
        `Seeduction indique la langue dans le nom des releases : VFQ (québécois), VFF (France), MULTI.VFQ, MULTI.VF2, VOSTFR, VO… Dans Radarr, crée un profil ou des « Custom Formats » qui recherchent ces mots pour obtenir la langue souhaitée. La liste des étiquettes est dans [url=/wiki/guide-nommer-releases]Bien nommer une release[/url].\n\n` +
        `[b]Bon à savoir[/b]\n` +
        `• Radarr retrouve un film par son titre et son année : les films sans fiche TMDB sont aussi trouvés par leur nom.\n` +
        `• Attention au ratio quand tu ajoutes beaucoup de films d'un coup : ils se téléchargent tous. Lis [url=/wiki/guide-ratio-seed]Garder un bon ratio[/url].\n` +
        `• Ne supprime pas un film du client avant la fin de son obligation de seed (72 h ou ratio 1).`,
    },
    {
      title: 'Brancher Seeduction à Lidarr (musique)',
      slug: 'guide-lidarr',
      keywords: 'lidarr, musique, albums, artistes, torznab, flac, mp3, catégories 3000',
      content:
        `Lidarr gère ta collection de musique : il suit tes artistes et télécharge les nouveaux albums. Avec Prowlarr, ajoute Seeduction dans [url=/wiki/guide-prowlarr]Prowlarr[/url] ; sinon, suis ces étapes.\n\n` +
        `[b]Avant de commencer[/b]\n` +
        `Ta clé API (page [url=/integrations]API & flux RSS[/url], onglet Lidarr). Explications : [url=/wiki/guide-api-et-cles]Comprendre l'API[/url].\n\n` +
        `[b]Étape 1 : ajouter l'indexeur[/b]\n` +
        `Dans Lidarr : [b]Settings > Indexers[/b], bouton « + », puis [b]Torznab[/b] (« Custom »).\n\n` +
        `[b]Étape 2 : remplir les champs[/b]\n` +
        `• [b]Name[/b] : Seeduction.\n` +
        `• [b]URL[/b] : [code]{SITE}[/code] — [b]API Path[/b] : [code]/api[/code] — [b]API Key[/b] : ta clé.\n` +
        `• [b]Categories[/b] : [code]3000,3010,3040[/code] (audio, MP3, sans perte FLAC).\n` +
        `• [b]Minimum Seeders[/b] : 1 — [b]Seed Ratio[/b] : 1 — [b]Seed Time[/b] : 4320 (minutes = 72 h) — [b]Discography Seed Time[/b] : 4320.\n\n` +
        `[b]Étape 3 : tester[/b]\n` +
        `Clique sur [b]Test[/b] puis [b]Save[/b]. En cas d'erreur : [url=/wiki/guide-depannage-api]dépannage[/url].\n\n` +
        `[b]Étape 4 : client de téléchargement et qualité[/b]\n` +
        `Ajoute ton client torrent dans [b]Settings > Download Clients[/b]. Dans [b]Settings > Profiles[/b], choisis la qualité voulue : le sans perte (FLAC) est rangé dans la catégorie 3040, le MP3 dans 3010.\n\n` +
        `[b]Comment Lidarr cherche[/b]\n` +
        `Il envoie l'artiste et l'album : Seeduction cherche ces mots dans le nom des releases et dans la fiche (Deezer). Si un album n'apparaît pas, cherche-le sur [url=/browse]Parcourir[/url] avec la catégorie Musique : il est peut-être nommé différemment.\n\n` +
        `[b]Bon à savoir[/b]\n` +
        `Les téléchargements comptent dans ton ratio, et chaque torrent téléchargé doit être seedé 72 h ou jusqu'à un ratio de 1 : voir [url=/wiki/guide-ratio-seed]Garder un bon ratio[/url].`,
    },
    {
      title: 'Brancher Seeduction à Readarr (livres)',
      slug: 'guide-readarr',
      keywords: 'readarr, livres, ebooks, bandes dessinées, auteurs, torznab, catégories 7000',
      content:
        `Readarr gère ta bibliothèque de livres : il suit tes auteurs et télécharge les nouveaux titres. Avec Prowlarr, ajoute Seeduction dans [url=/wiki/guide-prowlarr]Prowlarr[/url] ; sinon, suis ces étapes.\n\n` +
        `[b]Avant de commencer[/b]\n` +
        `Ta clé API (page [url=/integrations]API & flux RSS[/url], onglet Readarr). Explications : [url=/wiki/guide-api-et-cles]Comprendre l'API[/url].\n\n` +
        `[b]Étape 1 : ajouter l'indexeur[/b]\n` +
        `Dans Readarr : [b]Settings > Indexers[/b], bouton « + », puis [b]Torznab[/b] (« Custom »).\n\n` +
        `[b]Étape 2 : remplir les champs[/b]\n` +
        `• [b]Name[/b] : Seeduction.\n` +
        `• [b]URL[/b] : [code]{SITE}[/code] — [b]API Path[/b] : [code]/api[/code] — [b]API Key[/b] : ta clé.\n` +
        `• [b]Categories[/b] : [code]7000,7020,7030[/code] (livres, ebooks, bandes dessinées).\n` +
        `• [b]Minimum Seeders[/b] : 1 — [b]Seed Ratio[/b] : 1 — [b]Seed Time[/b] : 4320 (minutes = 72 h).\n\n` +
        `[b]Étape 3 : tester[/b]\n` +
        `Clique sur [b]Test[/b] puis [b]Save[/b]. En cas d'erreur : [url=/wiki/guide-depannage-api]dépannage[/url].\n\n` +
        `[b]Étape 4 : client de téléchargement[/b]\n` +
        `Ajoute ton client torrent dans [b]Settings > Download Clients[/b].\n\n` +
        `[b]Comment Readarr cherche[/b]\n` +
        `Il envoie l'auteur et le titre : Seeduction cherche ces mots dans le nom des releases. Si rien ne sort, essaie la recherche manuelle sur [url=/browse]Parcourir[/url] dans la catégorie Livres.\n\n` +
        `[b]Bon à savoir[/b]\n` +
        `Chaque torrent téléchargé doit être seedé 72 h ou jusqu'à un ratio de 1 : voir [url=/wiki/guide-ratio-seed]Garder un bon ratio[/url].`,
    },
    {
      title: 'Brancher Seeduction à Jackett',
      slug: 'guide-jackett',
      keywords: 'jackett, torznab, indexeur, generic torznab, proxy, sonarr, radarr',
      content:
        `Jackett est un « traducteur » entre les trackers et tes applications. Si tu hésites entre Jackett et Prowlarr, Prowlarr est plus moderne et plus simple (voir [url=/wiki/guide-prowlarr]Prowlarr[/url]). Si tu as déjà Jackett, voici comment y ajouter Seeduction.\n\n` +
        `[b]Avant de commencer[/b]\n` +
        `Ta clé API (page [url=/integrations]API & flux RSS[/url], onglet Jackett : les valeurs sont déjà remplies). Explications : [url=/wiki/guide-api-et-cles]Comprendre l'API[/url].\n\n` +
        `[b]Étape 1 : ajouter Seeduction à Jackett[/b]\n` +
        `1. Ouvre l'interface de Jackett et clique sur [b]Add indexer[/b].\n` +
        `2. Cherche [b]Generic Torznab[/b] (tape « torznab » dans le filtre) et clique sur le « + ». Si tu ne le vois pas, mets Jackett à jour : les versions récentes l'incluent.\n` +
        `3. [b]Torznab Feed URL[/b] : l'adresse COMPLÈTE avec /api à la fin : [code]{SITE}/api[/code]\n` +
        `4. [b]API key[/b] : ta clé API Seeduction.\n` +
        `5. Clique sur [b]Okay[/b]. Seeduction apparaît dans ta liste d'indexeurs configurés, avec une coche verte si tout va bien.\n\n` +
        `[b]Étape 2 : donner Seeduction à tes applications[/b]\n` +
        `Dans la liste de Jackett, clique sur [b]Copy Torznab Feed[/b] à côté de Seeduction. Cette adresse est celle de Jackett (pas celle de Seeduction) : colle-la dans l'indexeur Torznab de Sonarr, Radarr, Lidarr ou Readarr, avec la [b]clé API de Jackett[/b] (affichée en haut à droite de Jackett), comme décrit dans les guides [url=/wiki/guide-sonarr]Sonarr[/url], [url=/wiki/guide-radarr]Radarr[/url], [url=/wiki/guide-lidarr]Lidarr[/url] ou [url=/wiki/guide-readarr]Readarr[/url] (pour l'adresse et la clé, remplace celles de Seeduction par celles de Jackett).\n\n` +
        `[b]Tester dans Jackett[/b]\n` +
        `Le bouton [b]Manual Search[/b] (en haut) permet de chercher un titre : tu dois voir des résultats de Seeduction.\n\n` +
        `[b]Bon à savoir[/b]\n` +
        `• Ta clé Seeduction reste dans Jackett : protège l'accès à Jackett (mot de passe).\n` +
        `• Les téléchargements comptent pour ton ratio. Objectifs de seed : 72 h ou ratio 1 ([url=/wiki/hit-and-run]Hit & Run[/url]).\n` +
        `• Un souci ? [url=/wiki/guide-depannage-api]Dépannage[/url].`,
    },
    {
      title: 'Ajouter un flux RSS dans ton client torrent',
      slug: 'guide-rss-clients',
      keywords: 'rss, flux, qbittorrent, ruTorrent, deluge, transmission, téléchargement automatique, règle, filtre, abonnement',
      isFaq: true,
      content:
        `Un flux RSS permet à ton client torrent de télécharger [b]automatiquement[/b] les nouveaux torrents qui t'intéressent : par exemple tous les films en 1080p VFQ, ou une série précise. Tu n'as pas besoin de Sonarr ni de Radarr pour ça.\n\n` +
        `[b]Étape 1 : créer ton flux[/b]\n` +
        `1. Ouvre la page [url=/integrations]API & flux RSS[/url] (menu du compte), section « Générateur de flux RSS ».\n` +
        `2. Crée ta clé avec le bouton « 🔑 Créer une clé pour mes outils » (ou colle-la si tu en as déjà une).\n` +
        `3. Choisis tes filtres : catégories, mots du titre, langue, résolution, source, codec, seeders minimum, freeleech seulement, tri, nombre d'éléments.\n` +
        `4. Clique sur « 👁 Aperçu du flux » : tu vois les premiers résultats. Quand ça te convient, clique sur « Copier » à côté de l'adresse.\n\n` +
        `Cette adresse ressemble à : [code]{SITE}/api?t=search&apikey=TA_CLE&cat=2000&language=VFQ&resolution=1080p&limit=50[/code] — elle contient ta clé : ne la partage pas.\n\n` +
        `[b]qBittorrent[/b]\n` +
        `1. Active le lecteur RSS : [b]Outils > Options > RSS[/b], coche « Activer la récupération des flux RSS » et « Activer le téléchargement automatique des torrents RSS ». Tu peux y régler l'intervalle de rafraîchissement.\n` +
        `2. Ouvre l'onglet [b]RSS[/b] (bouton dans la barre d'outils ou menu Affichage > Lecteur RSS) puis [b]Nouvel abonnement[/b] : colle l'adresse, choisis un nom. Les articles apparaissent.\n` +
        `3. Clique sur [b]Modifier les règles de téléchargement automatique[/b], puis « + » pour créer une règle : donne-lui un nom, coche ton flux dans « Appliquer la règle aux flux », et règle « Doit contenir » / « Ne doit pas contenir » (par exemple « VFQ » ou « 2160p » à exclure), une catégorie et un dossier. Sans filtre, tout ce qui arrive dans le flux sera téléchargé.\n` +
        `4. Les nouveaux torrents correspondants sont ajoutés tout seuls à chaque rafraîchissement.\n\n` +
        `[b]ruTorrent[/b]\n` +
        `1. Ouvre l'onglet [b]RSS[/b] (le greffon « RSS » doit être activé, c'est le cas par défaut sur la plupart des seedbox).\n` +
        `2. Ajoute un flux (« Ajouter un flux » / « Add RSS ») avec un nom et l'adresse copiée.\n` +
        `3. Crée un [b]filtre[/b] sur ce flux : un motif à chercher dans les titres (« VFQ 1080p »), des mots à exclure, l'étiquette et le dossier de destination, puis active le téléchargement automatique.\n\n` +
        `[b]Deluge[/b]\n` +
        `Deluge n'a pas de RSS intégré : installe le greffon [b]YaRSS2[/b], puis ajoute le flux et des abonnements (filtres) dans ses préférences.\n\n` +
        `[b]Transmission[/b]\n` +
        `Transmission ne lit pas les flux RSS. Utilise [url=/wiki/guide-prowlarr]Prowlarr[/url] avec Sonarr / Radarr (qui envoient les torrents à Transmission), ou un outil dédié comme Flexget ou autobrr.\n\n` +
        `[b]Bien utiliser le RSS sans abîmer ton ratio[/b]\n` +
        `• Commence avec des filtres [b]serrés[/b] (une catégorie, une langue, une résolution) et peu d'éléments : un flux trop large télécharge tout.\n` +
        `• Choisis « freeleech » si tu veux télécharger sans toucher à ton ratio (voir [url=/wiki/freeleech]Freeleech[/url]).\n` +
        `• Chaque torrent téléchargé doit être seedé 72 h ou jusqu'à un ratio de 1 : ne règle pas ton client pour les supprimer avant ([url=/wiki/hit-and-run]Hit & Run[/url]).\n` +
        `• Mets une limite de torrents actifs dans ton client pour ne pas tout lancer en même temps.\n\n` +
        `[b]Ça ne marche pas ?[/b]\n` +
        `Ouvre l'adresse du flux dans ton navigateur : tu dois voir du XML avec des « item ». Si tu vois « error code=100 » : la clé est absente ou fausse. Le [url=/wiki/guide-depannage-api]dépannage[/url] détaille les cas.`,
    },
    {
      title: "Dépannage : l'API ou le flux ne marche pas",
      slug: 'guide-depannage-api',
      keywords: 'erreur, ne marche pas, test échoue, 401, error 100, 105, clé invalide, portée, aucun résultat, prowlarr, sonarr, radarr, rss vide, timeout, ssl',
      isFaq: true,
      content:
        `Un test échoue ou un outil ne trouve rien ? Passe en revue ces cas, du plus fréquent au plus rare.\n\n` +
        `[b]Je vois « error code=100 » (clé API)[/b]\n` +
        `• « Clé API manquante » : le champ API Key de ton outil est vide, ou l'adresse du flux n'a pas « apikey= ».\n` +
        `• « Clé API invalide ou révoquée » : la clé est mal copiée (une espace en trop ?), ou tu l'as révoquée. Crée-en une nouvelle dans la page [url=/integrations]API & flux RSS[/url].\n` +
        `• Vérifie que tu utilises la clé de [b]Seeduction[/b] (commence par sd_) et pas celle de Sonarr ou de Prowlarr.\n\n` +
        `[b]Je vois « error code=105 » (portée)[/b]\n` +
        `La clé n'a pas la portée nécessaire. Pour chercher il faut [b]torrents:read[/b], pour télécharger [b]torrents:download[/b]. Le bouton « Créer une clé pour mes outils » les coche toutes les deux. Une ancienne clé créée avant n'a pas la portée de téléchargement : crée-en une nouvelle.\n\n` +
        `[b]Les recherches marchent mais le téléchargement échoue (401)[/b]\n` +
        `C'est presque toujours la portée [b]torrents:download[/b] manquante : voir ci-dessus.\n\n` +
        `[b]Le test passe mais je n'ai aucun résultat[/b]\n` +
        `• Les catégories de l'outil ne correspondent à rien : coche celles du bon type (films 2000, séries 5000, musique 3000, livres 7000).\n` +
        `• Le titre est écrit autrement : essaie une recherche plus courte (un seul mot).\n` +
        `• Le contenu adulte est masqué tant que tu ne l'as pas activé dans Profil > Compte.\n` +
        `• Ton outil exige un identifiant (IMDb, TVDB) : Seeduction accepte le titre et l'identifiant TMDB, pas les autres. Prowlarr, Sonarr et Radarr retombent alors sur le titre, tout va bien.\n` +
        `• Le torrent n'existe pas encore sur Seeduction : vérifie sur [url=/browse]Parcourir[/url], sinon [url=/wiki/guide-demandes]fais une demande[/url].\n\n` +
        `[b]« error code=500 » trop de requêtes[/b]\n` +
        `Limite de 120 requêtes par minute et par clé. Réduis la fréquence de ton outil (RSS toutes les 15 à 30 minutes suffit largement).\n\n` +
        `[b]« error code=101 » compte suspendu[/b]\n` +
        `Ton compte est suspendu : contacte le staff ([url=/wiki/support-chat-et-billets]Support[/url]).\n\n` +
        `[b]Impossible de joindre le site / erreur de certificat / 404[/b]\n` +
        `• Utilise exactement l'adresse de ton navigateur ([code]{SITE}[/code]), en [b]https[/b], sans barre oblique à la fin ni chemin supplémentaire.\n` +
        `• Dans Prowlarr / Sonarr / Radarr, l'API Path doit rester [code]/api[/code].\n` +
        `• Dans Jackett, l'adresse complète finit par /api.\n` +
        `• Si ton outil tourne dans un conteneur Docker, vérifie qu'il sait résoudre le nom du site (DNS) et qu'il fait confiance au certificat.\n\n` +
        `[b]Le téléchargement démarre mais ne progresse pas[/b]\n` +
        `Ton client torrent ne se connecte pas au tracker. Vérifie que le port de ton client est ouvert et regarde le message d'erreur du tracker dans le client : « Ratio insuffisant » (voir [url=/wiki/comprendre-le-ratio]Comprendre le ratio[/url]) ou trop de hit & run non régularisés ([url=/wiki/guide-hit-and-run-reparer]Réparer un hit & run[/url]).\n\n` +
        `[b]Tester à la main[/b]\n` +
        `• [code]{SITE}/api?t=caps[/code] : doit afficher du XML sans demander de clé. Sinon, le site ou le proxy bloque.\n` +
        `• [code]{SITE}/api?t=search&apikey=TA_CLE&limit=3[/code] : doit afficher 3 torrents.\n\n` +
        `Toujours bloqué ? Ouvre un billet au [url=/wiki/support-chat-et-billets]Support[/url] en indiquant l'outil, sa version, l'adresse utilisée (sans ta clé) et le message d'erreur exact.`,
    },
  ],
};
