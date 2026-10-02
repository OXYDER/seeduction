/**
 * Contenu de départ du Wiki (voir WikiService.onModuleInit) : peuplé une seule fois si la table est vide, comme les
 * catégories par défaut. Modifiable ensuite par le staff depuis Admin > Wiki, ou en éditant ce fichier (dans ce cas
 * les changements n'apparaissent qu'au prochain démarrage sur une base vide — sur une base existante, passe par
 * l'admin ou par une requête directe).
 *
 * IMPORTANT pour Claude (ou tout futur développeur) : ce fichier doit rester à jour avec le fonctionnement réel du
 * site. Chaque fois qu'une fonctionnalité ou une règle change (nouveau système, seuil ECONOMY modifié, etc.), mets
 * à jour l'article concerné ici (ou via l'admin) dans le même commit — c'est ça, « le wiki qui se tient à jour
 * automatiquement » : pas une magie du site, un réflexe de la personne (ou de l'IA) qui code le changement.
 */

export interface WikiSeedArticle {
  title: string;
  slug: string;
  content: string;
  keywords?: string;
  isFaq?: boolean;
  /** Anciens articles du seed remplacés par celui-ci : supprimés au démarrage s'ils n'ont jamais été modifiés par le staff. */
  supersedes?: string[];
}

export interface WikiSeedCategory {
  name: string;
  slug: string;
  icon: string;
  articles: WikiSeedArticle[];
}

export const WIKI_SEED: WikiSeedCategory[] = [
  {
    name: 'Démarrer',
    slug: 'demarrer',
    icon: '🚀',
    articles: [
      {
        title: 'Créer un compte',
        slug: 'creer-un-compte',
        keywords: 'inscription, invitation, code, register',
        isFaq: true,
        content:
          `Seeduction fonctionne par invitation : il faut un code fourni par un membre qui a déjà un compte (sauf le tout premier compte du tracker, qui devient automatiquement administrateur).\n\n` +
          `• Chaque code d'invitation n'est utilisable qu'une seule fois et peut avoir une date d'expiration.\n` +
          `• Le nombre d'invitations que tu peux créer toi-même dépend de ton rang (voir [url=/wiki/rangs-et-classes]Rangs et classes[/url]) : 0 pour un Nouveau ou un Membre, 2 pour un Power User, 5 pour un Élite, 10 pour un Vétéran. Le staff n'a pas de limite.\n` +
          `• [b]Tu es responsable des membres que tu invites[/b] : des abus répétés de leur part peuvent retomber sur ton propre compte.\n\n` +
          `Pour inviter quelqu'un, va dans ton profil et génère un code depuis l'onglet Invitations (si ton rang le permet).`,
      },
      {
        title: 'Le cadeau de bienvenue',
        slug: 'cadeau-de-bienvenue',
        keywords: 'welcome, gratuit, freeleech de départ, upload gratuit',
        isFaq: true,
        content:
          `Pour démarrer sans stress, chaque nouveau compte reçoit automatiquement à l'inscription :\n\n` +
          `• [b]50 Go d'upload[/b] déjà crédités (ton ratio ne part donc pas de zéro).\n` +
          `• [b]7 jours de freeleech personnel[/b] : pendant cette semaine, tout ce que tu télécharges ne compte pas dans ton ratio (l'upload, lui, compte toujours et t'aide encore plus).\n\n` +
          `Une notification de bienvenue te le rappelle dès la création du compte, et ton profil affiche un bandeau tant que le freeleech personnel est actif. Une fois la semaine passée, tu repasses aux règles normales de ratio — profites-en pour télécharger large et surtout pour bien seeder derrière, ça t'aidera après.`,
      },
      {
        title: 'Connexion, mot de passe oublié et double authentification (2FA)',
        slug: 'connexion-et-securite',
        keywords: '2fa, totp, google authenticator, mot de passe oublié, sécurité du compte',
        content:
          `[b]Mot de passe oublié[/b]\n` +
          `Depuis la page de connexion, clique sur « Mot de passe oublié » et suis le lien reçu par e-mail (valable une durée limitée, usage unique).\n\n` +
          `[b]Double authentification (2FA)[/b]\n` +
          `Active la 2FA depuis Profil > Sécurité pour ajouter une couche de protection avec une application comme Google Authenticator ou Authy (standard TOTP). Une fois activée :\n` +
          `• Chaque connexion demande le code à 6 chiffres en plus du mot de passe.\n` +
          `• Des codes de secours à usage unique sont générés à l'activation : garde-les en lieu sûr, ils permettent de te reconnecter si tu perds ton téléphone.\n\n` +
          `Le staff ne peut pas désactiver ta 2FA à ta place sans passer par la procédure de vérification d'identité habituelle — ne perds pas tes codes de secours.`,
      },
    ],
  },
  {
    name: 'Ratio et économie',
    slug: 'ratio-et-economie',
    icon: '📊',
    articles: [
      {
        title: 'Comprendre le ratio',
        slug: 'comprendre-le-ratio',
        keywords: 'upload download ratio minimum, bloqué, ratio insuffisant',
        isFaq: true,
        content:
          `Ton ratio, c'est [b]upload ÷ download[/b]. Plus il est haut, plus tu contribues au partage par rapport à ce que tu prends.\n\n` +
          `• Un ratio minimum est exigé pour continuer à télécharger (visible sur ton profil, il dépend de ton compte).\n` +
          `• [b]Période de grâce[/b] : ce minimum ne s'applique qu'après avoir téléchargé un premier volume de grâce (5 Go par défaut) — le temps de découvrir le site sans être bloqué immédiatement.\n` +
          `• Le blocage empêche seulement de [i]démarrer de nouveaux téléchargements[/i] : le seed continue de fonctionner normalement, et c'est justement en seedant que tu remontes ton ratio.\n\n` +
          `Des freeleech (globaux, personnels ou par jeton) permettent de télécharger sans faire baisser ton ratio — voir [url=/wiki/freeleech]Freeleech, tous les types[/url].`,
      },
      {
        title: 'Hit & Run : l\'obligation de seed',
        slug: 'hit-and-run',
        keywords: 'hnr, hit and run, obligation de seed, abandon',
        isFaq: true,
        content:
          `Télécharger un torrent crée une petite obligation : le seeder un minimum de temps après, pour ne pas juste « prendre et partir ».\n\n` +
          `[b]La règle[/b]\n` +
          `Un téléchargement complété (« snatch ») est régularisé dès que [b]l'une[/b] des deux conditions suivantes est remplie :\n` +
          `• Tu l'as seedé au moins [b]72 heures[/b] au total après la fin du téléchargement, OU\n` +
          `• Tu as envoyé au moins l'équivalent de [b]100 % de sa taille[/b] en upload sur ce torrent précis.\n\n` +
          `Un délai de grâce de [b]48 heures[/b] après la fin du téléchargement est toujours accordé avant qu'un manquement soit compté comme un hit & run.\n\n` +
          `[b]Ce qui se passe si tu accumules des hit & run non régularisés[/b]\n` +
          `Au-delà de [b]5 hit & run non régularisés[/b], tes nouveaux téléchargements sont bloqués (le seed, lui, continue normalement) jusqu'à ce que tu en régularises assez — reprends le seed des torrents concernés (visibles sur ton profil) pour débloquer ton compte.\n\n` +
          `[b]Le lecteur Seeduction compte pareil[/b]\n` +
          `Depuis que le lecteur desktop est un vrai client BitTorrent qui garde le fichier et continue de seeder après la lecture, un téléchargement complété via le lecteur suit exactement les mêmes règles qu'un téléchargement classique — voir [url=/wiki/fonctionnement-du-lecteur]Comment fonctionne le lecteur[/url].`,
      },
      {
        title: 'Freeleech, tous les types',
        slug: 'freeleech',
        keywords: 'fl, freeleech token, jeton, double upload, 2x',
        isFaq: true,
        content:
          `Un torrent (ou une situation) en freeleech veut dire que le [b]télécharger ne compte pas dans ton ratio[/b] — l'upload, lui, compte toujours normalement.\n\n` +
          `Il y a plusieurs façons d'en profiter, cumulables :\n\n` +
          `• [b]Freeleech sur un torrent précis[/b] : marqué « FREELEECH » par le staff (souvent pour relancer l'intérêt sur un contenu rare).\n` +
          `• [b]Freeleech global[/b] : un événement pour tout le site, pendant une durée donnée (annoncé dans les Nouvelles et visible dans un bandeau en haut du site).\n` +
          `• [b]Freeleech personnel[/b] : offert à toi seul jusqu'à une date donnée — le cadeau de bienvenue en est un exemple (voir [url=/wiki/cadeau-de-bienvenue]Le cadeau de bienvenue[/url]), le staff peut aussi t'en offrir un en récompense.\n` +
          `• [b]Jeton freeleech[/b] : acheté dans la boutique à points bonus, à dépenser sur UN torrent précis de ton choix — son téléchargement ne comptera pas dans ton ratio pendant 7 jours.\n\n` +
          `[b]Double upload (2x)[/b] : un torrent marqué ainsi fait compter ton upload en double — se cumule avec le freeleech (tu peux avoir un torrent gratuit en download ET qui rapporte deux fois plus en upload).`,
      },
      {
        title: 'Points bonus et la boutique',
        slug: 'points-bonus-et-boutique',
        keywords: 'bonus points, shop, boutique, gagner des points',
        isFaq: true,
        content:
          `Les points bonus sont une monnaie du site, séparée du ratio, qui se dépense dans une petite boutique.\n\n` +
          `[b]Comment en gagner[/b]\n` +
          `• [b]1 point par heure[/b] et par torrent activement seedé (plafonné à 200 torrents comptés par heure, pour éviter l'abus par des centaines de tout petits torrents).\n` +
          `• [b]1 point[/b] à chaque fois qu'un autre membre te remercie (👍) sur un de tes torrents.\n` +
          `• Une récompense en cas de reseed d'un torrent mort — voir [url=/wiki/torrents-morts-et-reseed]Torrents morts et récompense de reseed[/url].\n\n` +
          `[b]Ce qu'on peut acheter[/b] (voir la page Boutique)\n` +
          `• De l'upload supplémentaire (5 Go ou 20 Go, le paquet de 20 Go coûtant proportionnellement un peu moins cher).\n` +
          `• Un jeton freeleech, à dépenser sur le torrent de ton choix.\n` +
          `• Un code d'invitation supplémentaire.`,
      },
      {
        title: 'Rangs et classes de membre',
        slug: 'rangs-et-classes',
        keywords: 'memberclass, grade, promotion, veteran, elite, power user',
        content:
          `Ton rang évolue automatiquement selon ton ancienneté, ton upload et ton ratio — pas besoin de le demander, il se recalcule tout seul (nuit, après chaque badge). Du plus haut au plus bas, le premier rang dont [b]toutes[/b] les conditions sont remplies s'applique :\n\n` +
          `• [b]Vétéran[/b] — 26 semaines d'ancienneté, 2 000 Go d'upload, ratio ≥ 2.\n` +
          `• [b]Élite[/b] — 12 semaines, 500 Go d'upload, ratio ≥ 1,5.\n` +
          `• [b]Power User[/b] — 4 semaines, 50 Go d'upload, ratio ≥ 1,05.\n` +
          `• [b]Membre[/b] — 1 semaine, ratio ≥ 0,5.\n` +
          `• [b]Nouveau[/b] — tout le monde au départ.\n\n` +
          `Ton rang détermine notamment ton quota d'invitations (voir [url=/wiki/creer-un-compte]Créer un compte[/url]).`,
      },
    ],
  },
  {
    name: 'Torrents',
    slug: 'torrents',
    icon: '📥',
    articles: [
      {
        title: 'Envoyer un torrent',
        slug: 'envoyer-un-torrent',
        keywords: 'upload, uploader, assistant, wizard, nfo',
        isFaq: true,
        content:
          `La page Envoyer te guide en plusieurs étapes : dépose ton fichier .torrent (et son .nfo si tu l'as), et le site tente de détecter automatiquement le maximum d'informations à partir du nom de fichier et du NFO (saison/épisode, langue, genre, type de contenu...). Tu n'as à remplir à la main que ce qui n'a pas pu être deviné.\n\n` +
          `[b]Catégorie[/b] : choisis une [i]sous-catégorie[/i] précise — les catégories principales (Films & Vidéos, Jeux Vidéo...) ne sont que des regroupements, pas des destinations valides.\n\n` +
          `[b]Doublons[/b] : un torrent avec la même empreinte (info_hash) qu'un torrent déjà présent est refusé. Si une version différente (qualité, langue...) existe déjà, le panneau « Versions » te la signale avant l'envoi.\n\n` +
          `[b]Modération[/b] : ton torrent passe en attente jusqu'à validation par le staff (sauf configuration particulière) — tu peux le modifier tant qu'il n'est pas encore approuvé.`,
      },
      {
        title: 'Parcourir, filtrer et trier',
        slug: 'parcourir-et-filtrer',
        keywords: 'browse, recherche, filtres, période, page size',
        content:
          `La page Parcourir combine une recherche en langage naturel (tape par exemple « Dune 2024 4K HDR VOSTFR », les critères sont détectés tout seuls) avec des filtres explicites : catégorie et sous-catégorie, qualité, source, langue, codec, audio, taille, nombre de seeders minimum, et [b]période d'ajout[/b] (24 heures / cette semaine / ce mois).\n\n` +
          `Chaque bouton de filtre affiche le nombre de résultats qu'il donnerait, pour ne jamais cliquer à l'aveugle. Le nombre de torrents affichés par page se règle en bas de la liste (25/50/100).\n\n` +
          `La page d'accueil propose aussi des rangées « Derniers torrents » et « Les plus populaires », chacune avec ses propres onglets de période — leur lien « Voir tout » ouvre Parcourir déjà filtré pareil.`,
      },
      {
        title: 'Affichages des listes et offres personnalisées',
        slug: 'affichages-et-recommandations',
        keywords: 'vue, liste, détails, grille, affiches, compact, affichage par défaut, recommandations, suggestions, tu pourrais aimer',
        isFaq: true,
        content:
          `[b]Cinq façons d'afficher les torrents[/b]\n` +
          `Partout où le site montre une liste de torrents (Parcourir, À télécharger plus tard, collections, fiches d'acteurs et de studios...), les boutons en haut de la liste changent l'affichage :\n` +
          `• [b]Liste[/b] : tableau complet avec colonnes triables (date, taille, seeders...).\n` +
          `• [b]Détails[/b] : une grande ligne par torrent avec l'affiche, les infos techniques et un extrait du synopsis.\n` +
          `• [b]Grille[/b] : cartes avec l'affiche, le titre, la qualité et les statistiques toujours visibles.\n` +
          `• [b]Affiches[/b] : grandes affiches seules, les détails apparaissent au survol.\n` +
          `• [b]Compact[/b] : une ligne fine par torrent, pour en voir un maximum à l'écran.\n\n` +
          `[b]Ton affichage par défaut[/b]\n` +
          `Dans Profil > Compte > « Affichage des listes de torrents », choisis celui qui s'applique partout par défaut. Tu peux ensuite changer l'affichage d'une page précise avec les boutons en haut de la liste : ce choix est retenu pour cette page, dans ce navigateur. Changer ton réglage par défaut dans ton compte remet toutes les pages sur celui-ci.\n\n` +
          `[b]« Tu pourrais aimer » : les offres de torrents[/b]\n` +
          `Sur l'accueil, sur chaque fiche torrent (« Dans la même veine »), dans tes favoris, tes collections et quand une recherche ne donne rien, le site te propose des torrents que tu n'as pas encore, d'après ton activité :\n` +
          `• ce que tu as téléchargé, regardé dans le lecteur Seeduction, mis de côté, remercié, noté ou rangé dans une collection, et ce que tu seedes en ce moment ;\n` +
          `• les acteurs, studios, artistes et genres que tu suis ;\n` +
          `• regarder un film pèse plus que le télécharger, et une mauvaise note joue contre.\n` +
          `Chaque affiche dit pourquoi elle t'est proposée (« Avec... », « Réalisé par... », « Comme... »). Les contenus que tu as déjà (même dans une autre version) et le contenu adulte masqué ne sont jamais proposés. Sans historique, tu vois ce qui est populaire en ce moment.`,
      },
      {
        title: 'Torrents morts et récompense de reseed',
        slug: 'torrents-morts-et-reseed',
        keywords: 'dead, mort, 0 seeder, reseed, récompense, resurrection',
        isFaq: true,
        content:
          `Un torrent approuvé qui reste à [b]0 seeder pendant 48 heures[/b] passe automatiquement au statut « Mort » (un court délai de grâce évite qu'une simple coupure de connexion déclenche ça pour rien).\n\n` +
          `[b]Le remettre en vie rapporte des points bonus[/b] — mais pas n'importe comment :\n` +
          `• La récompense est calculée selon la taille du torrent et le temps qu'il est resté mort (avec un plafond), et n'est [b]jamais versée à quelqu'un qui le seedait déjà juste avant sa mort[/b] — impossible donc de couper son propre seed puis de le relancer pour gagner des points.\n` +
          `• Elle n'est [b]confirmée[/b] que lorsqu'un autre membre finit vraiment de le télécharger (preuve que ça a servi), ou, à défaut, si tu as tenu le seed tout seul pendant 72 heures.\n` +
          `• Si tu abandonnes le seed avant l'une de ces deux conditions, rien n'est payé.\n\n` +
          `Depuis la fiche d'un torrent à 0 seeder, le bouton « Demander un reseed » prévient (au plus une fois par semaine) tous les membres qui l'ont déjà téléchargé.`,
      },
      {
        title: 'Favoris et collections',
        slug: 'favoris-et-collections',
        keywords: 'watchlist, liste, playlist',
        content:
          `• [b]Favoris[/b] (★) : une liste personnelle rapide, accessible depuis le menu — pour retrouver un torrent repéré sans avoir à le rechercher à nouveau.\n` +
          `• [b]Collections[/b] : des listes thématiques que tu crées et organises toi-même (une saga de films, une sélection...), consultables et partageables via leur propre page.`,
      },
      {
        title: 'Notes, « Merci » et commentaires',
        slug: 'notes-merci-commentaires',
        keywords: 'étoiles, rating, like, thanks',
        content:
          `Sur chaque fiche torrent :\n` +
          `• [b]Note en étoiles[/b] (1 à 5) : ton avis personnel sur le contenu, moyenné avec celui des autres membres.\n` +
          `• [b]👍 Merci[/b] : remercie l'uploader, qui gagne 1 point bonus (tu ne peux pas te remercier toi-même).\n` +
          `• [b]Commentaires[/b] : pour poser une question ou signaler un souci technique avec le fichier.`,
      },
    ],
  },
  {
    name: 'Le lecteur Seeduction',
    slug: 'lecteur-seeduction',
    icon: '🖥️',
    articles: [
      {
        title: 'Installer le lecteur Seeduction',
        slug: 'installer-le-lecteur',
        keywords: 'desktop player, télécharger, installation, vlc',
        isFaq: true,
        content:
          `Le lecteur Seeduction est un petit logiciel à installer une fois sur ton PC (voir la page [url=/player]Le lecteur Seeduction[/url] pour le téléchargement et le pas-à-pas complet, avec captures d'écran).\n\n` +
          `Une fois installé :\n` +
          `• Clique sur [b]🖥️ Ouvrir dans le lecteur Seeduction[/b] sur n'importe quelle fiche vidéo.\n` +
          `• Ton navigateur te demande la permission d'ouvrir le lien avec le logiciel : coche « Toujours autoriser » pour ne plus avoir à confirmer ensuite.\n` +
          `• Une copie de VLC (« Seeduction VLC ») est fournie avec l'installateur — rien d'autre à installer.\n\n` +
          `Windows peut afficher un avertissement SmartScreen au premier lancement (logiciel récent, pas encore « connu » de Microsoft) : c'est normal, clique sur « Informations complémentaires » puis « Exécuter quand même ».`,
      },
      {
        title: 'Comment fonctionne le lecteur',
        slug: 'fonctionnement-du-lecteur',
        keywords: 'seed, ratio, hit and run, dossier téléchargement',
        isFaq: true,
        content:
          `Le lecteur Seeduction est un [b]vrai client BitTorrent[/b], pas un simple lecteur vidéo :\n\n` +
          `• Il rejoint le swarm directement depuis ton PC (aucune charge sur le serveur), avec ton .torrent personnalisé — ça compte pour ton ratio exactement comme un téléchargement classique.\n` +
          `• Le fichier va dans ton dossier [b]Téléchargements/Seeduction[/b] par défaut (modifiable dans les paramètres du lecteur), pas dans un dossier caché.\n` +
          `• Le torrent [b]continue de seeder après la lecture[/b] — et comme tout autre client, il est soumis aux mêmes règles de ratio et de hit & run (voir [url=/wiki/hit-and-run]Hit & Run[/url]).\n` +
          `• Les sessions reprennent automatiquement si tu fermes puis rouvres le logiciel, qui se lance aussi avec Windows.\n\n` +
          `Depuis la fenêtre « Client Seeduction » (icône dans la zone de notification), tu peux voir la progression de chaque téléchargement, ouvrir le dossier d'un fichier, l'arrêter (le fichier reste) ou le supprimer, et régler une limite de vitesse. [b]Arrêter ou supprimer un fichier dont le temps de partage obligatoire n'est pas terminé est bloqué[/b], pour éviter de te laisser un hit & run sans t'en rendre compte.`,
      },
      {
        title: 'Reprendre une lecture et voir "en train de regarder"',
        slug: 'reprise-et-statut-en-train-de-regarder',
        keywords: 'resume, reprendre, watching, statut de visionnage',
        content:
          `Le bouton [b]▶ Visionner[/b] (ou [b]▶ Reprendre[/b] s'il connaît ta position) relance un fichier déjà téléchargé ou en cours, en reprenant automatiquement quelques secondes avant l'endroit où tu t'étais arrêté.\n\n` +
          `Pendant que tu regardes quelque chose, ton statut de présence affiche automatiquement « 🎬 Regarde [i]titre[/i] » à la place de ton message habituel (visible dans le menu et dans l'infobulle de ton profil), et redevient ton message normal dès que tu fermes la vidéo. [b]Jamais affiché pour du contenu adulte[/b], quel que soit ton réglage — et tu peux désactiver complètement cette fonction depuis Profil > Compte si tu préfères la discrétion.`,
      },
    ],
  },
  {
    name: 'Communauté',
    slug: 'communaute',
    icon: '👥',
    articles: [
      {
        title: 'Statut de présence et message personnalisé',
        slug: 'statut-de-presence',
        keywords: 'en ligne, absent, occupé, invisible, status text',
        isFaq: true,
        content:
          `Clique n'importe où sur ta carte (avatar + nom) en haut du menu de gauche pour choisir ton statut :\n\n` +
          `• [b]En ligne[/b], [b]Absent[/b], [b]Occupé[/b], ou [b]Apparaître hors ligne[/b] (les autres te voient alors comme déconnecté, même si tu es bien là).\n` +
          `• Un [b]message personnalisé[/b] libre (100 caractères) s'affiche à côté, visible dans l'infobulle qui apparaît quand on survole ton pseudo n'importe où sur le site.\n\n` +
          `Ce statut (sauf « Apparaître hors ligne ») et ton message sont visibles de tous les membres.`,
      },
      {
        title: 'Messenger : discussions, groupes et canaux',
        slug: 'messenger',
        keywords: 'chat, messagerie, dm, message privé, groupe, canal, salon, mention, répondre, réaction, amis, notifications, son, épingler, sourdine, archiver, partager un torrent',
        isFaq: true,
        supersedes: ['amis-et-messagerie', 'chat-public'],
        content:
          `Le Messenger regroupe toutes tes discussions au même endroit : la page [b]Chat[/b] du menu, et des bulles flottantes en bas à droite de n'importe quelle page.\n\n` +
          `[b]Trois types de conversations[/b]\n` +
          `• [b]Privées (1 à 1)[/b] : avec n'importe quel membre. Par défaut tout le monde peut t'écrire ; tu peux restreindre ça à tes amis seulement dans Profil > Compte.\n` +
          `• [b]Groupes[/b] : jusqu'à 50 personnes, avec un nom et une image. Seuls tes amis peuvent être ajoutés. Le créateur est propriétaire ; il peut nommer des administrateurs, qui ajoutent et retirent des membres et épinglent des messages. Tu peux quitter un groupe quand tu veux.\n` +
          `• [b]Canaux publics[/b] : des salons ouverts à toute la communauté (le canal « Général » est l'ancien chat public). Le staff en crée d'autres, avec leurs règles (lecture seule, mode lent...).\n\n` +
          `[b]Ce que tu peux faire dans un message[/b]\n` +
          `• Envoyer du texte, des [b]émojis[/b], des [b]photos[/b] (jpeg, png, webp) et des [b]fichiers[/b] (20 Mo maximum) — par le trombone, en collant une image, ou en glissant un fichier sur la conversation.\n` +
          `• [b]Partager un torrent[/b] (bouton 🎬) : sa fiche s'affiche dans la bulle avec l'affiche et les seeders. Coller un lien vers une fiche du site fait pareil.\n` +
          `• [b]Répondre[/b] à un message précis (il est cité), [b]réagir[/b] avec un émoji, [b]modifier[/b] ton message ou [b]annuler son envoi[/b] (il disparaît pour tout le monde).\n` +
          `• [b]Mentionner[/b] quelqu'un avec @pseudo : il est prévenu, et son nom ressort dans le message.\n` +
          `• Voir quand l'autre est en train d'écrire, et le « Vu » une fois ton message lu.\n` +
          `• Chercher un mot dans une conversation (🔍), épingler un message important, voir les photos et fichiers partagés (ⓘ).\n\n` +
          `[b]S'organiser[/b]\n` +
          `Le menu ⋯ d'une conversation permet de l'[b]épingler[/b] en haut de la liste, de la mettre en [b]sourdine[/b] (1 h, 8 h, 24 h ou jusqu'à réactivation — plus de son ni de notification, mais les messages arrivent quand même) ou de l'[b]archiver[/b]. Les filtres Non lus, Groupes et Canaux retrouvent vite ce qui t'intéresse.\n\n` +
          `[b]Notifications[/b]\n` +
          `Un son et une pastille (dans le menu et dans le titre de l'onglet) signalent chaque nouveau message ; le 🔔 de la liste des discussions règle le son et active les notifications du navigateur (quand l'onglet est en arrière-plan). Si tu es hors ligne, tu reçois une notification sur le site.\n\n` +
          `[b]Amis[/b] : envoie une demande depuis un profil ou la page Amis ; une fois acceptée, tu peux créer des groupes avec cette personne. Tu n'as pas besoin d'être ami pour discuter à deux.`,
      },
      {
        title: 'Forum',
        slug: 'forum',
        keywords: 'sujets, discussions, sous-forum',
        content:
          `Le forum est organisé en catégories et forums (certains réservés au staff), chacun pouvant contenir des sous-forums. Les sujets épinglés et verrouillés sont signalés clairement ; le staff peut déplacer un sujet mal rangé.`,
      },
      {
        title: 'Demandes (bounties)',
        slug: 'demandes',
        keywords: 'bounty, requête, demande de torrent',
        content:
          `Tu cherches un contenu qui n'est pas encore sur le site ? Publie une demande — les autres membres peuvent y mettre des points bonus en récompense, et celui qui la remplit (en uploadant le torrent demandé et en liant la demande) les reçoit.`,
      },
      {
        title: 'Signaler un problème',
        slug: 'signaler-un-probleme',
        keywords: 'report, signalement, modération',
        content:
          `Le bouton de signalement (sur un torrent, un profil, un message...) prévient directement le staff avec un lien vers l'élément concerné et le motif choisi — plus rapide et mieux suivi qu'un message privé à un modérateur au hasard.`,
      },
    ],
  },
  {
    name: 'Compte et personnalisation',
    slug: 'compte-et-personnalisation',
    icon: '⚙️',
    articles: [
      {
        title: 'Thèmes et couleurs d\'accent',
        slug: 'themes-et-accents',
        keywords: 'prestige, couleur, violet, néon, glacier, apparence',
        content:
          `Le site utilise une seule mise en page (Prestige), personnalisable par sa couleur d'accent depuis le sélecteur 🎨 : violet, bleu, rouge, vert, doré, néon arcade, émeraude royale, sang et ombre, glacier ou aurore.\n\n` +
          `Une option « L'accent suit la catégorie parcourue » (dans le même menu) fait changer automatiquement la couleur du site selon ce que tu regardes (Films en bleu, XXX en rose, Jeux en vert...) au lieu d'une couleur fixe — désactivée par défaut.`,
      },
      {
        title: 'Vie privée : contenu adulte, statut invisible, chat',
        slug: 'vie-privee',
        keywords: 'confidentialité, adulte, xxx, invisible',
        content:
          `Plusieurs réglages, tous dans Profil > Compte, te laissent contrôler ce que les autres voient :\n\n` +
          `• [b]Contenu adulte[/b] : masqué par défaut, à activer explicitement pour voir les catégories XXX.\n` +
          `• [b]Chat privé[/b] : ouvert à tout le monde par défaut, restreignable à tes amis.\n` +
          `• [b]Statut « Apparaître hors ligne »[/b] : te fait passer pour déconnecté aux yeux des autres.\n` +
          `• [b]« En train de regarder »[/b] : désactivable complètement (et de toute façon jamais montré pour du contenu adulte).`,
      },
      {
        title: 'Clés API et accès développeur',
        slug: 'cles-api',
        keywords: 'api key, developer, automatisation',
        content:
          `Depuis Profil > Développeur, tu peux générer des clés API à portée limitée (lecture seule, ou accès précis) pour automatiser certaines actions sans exposer ta passkey ni ton mot de passe.`,
      },
    ],
  },
  {
    name: 'Règles de conduite',
    slug: 'reglement',
    icon: '🛡️',
    articles: [
      {
        title: 'Règlement général',
        slug: 'reglement-general',
        keywords: 'règles, ban, sanction, comportement',
        isFaq: true,
        content:
          `• [b]Un seul compte par personne[/b]. Le multi-compte entraîne un bannissement des deux comptes.\n` +
          `• [b]Pas de triche de ratio[/b] (faux client, spoofing d'annonce, etc.) ni d'abus du système d'invitations.\n` +
          `• [b]Un seul upload par contenu[/b] (pas de doublon d'empreinte) ; renseigne une catégorie et une description correctes.\n` +
          `• [b]Respect entre membres[/b] sur le forum, le chat et les commentaires — le harcèlement, les propos haineux ou le spam publicitaire ne sont pas tolérés.\n` +
          `• Les infractions donnent lieu à un avertissement, puis en cas de récidive à une suspension ou un bannissement, à la discrétion du staff.\n\n` +
          `Voir aussi [url=/wiki/comprendre-le-ratio]Comprendre le ratio[/url] et [url=/wiki/hit-and-run]Hit & Run[/url] pour les règles techniques précises.`,
      },
      {
        title: 'Rôles du staff',
        slug: 'roles-du-staff',
        keywords: 'modérateur, admin, owner, hiérarchie',
        content:
          `• [b]Modérateur[/b] : modération du contenu et des membres (approbation des torrents, avertissements, gestion des reports et du forum).\n` +
          `• [b]Admin[/b] : tout ce que peut faire un modérateur, plus la configuration du site (catégories, freeleech, templates, statistiques du serveur).\n` +
          `• [b]Owner[/b] : accès complet, y compris la promotion d'autres membres au staff.\n\n` +
          `Un badge distinctif identifie chaque rôle partout où le pseudo apparaît.`,
      },
    ],
  },
];
