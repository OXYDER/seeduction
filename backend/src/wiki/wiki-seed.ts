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
        keywords: 'hnr, hit and run, obligation de seed, abandon, icône, pastille, seeds à terminer',
        isFaq: true,
        content:
          `Télécharger un torrent crée une petite obligation : le seeder un minimum de temps après, pour ne pas juste « prendre et partir ».\n\n` +
          `[b]La règle[/b]\n` +
          `Un téléchargement complété (« snatch ») est régularisé dès que [b]l'une[/b] des deux conditions suivantes est remplie :\n` +
          `• Tu l'as seedé au moins [b]72 heures[/b] au total après la fin du téléchargement, OU\n` +
          `• Tu as envoyé au moins l'équivalent de [b]100 % de sa taille[/b] en upload sur ce torrent précis.\n\n` +
          `Un délai de grâce de [b]48 heures[/b] après la fin du téléchargement est toujours accordé avant qu'un manquement soit compté comme un hit & run.\n\n` +
          `[b]Suivre tes seeds en un coup d'œil[/b]\n` +
          `Dès que tu as au moins un téléchargement à terminer, une icône [b]🌱[/b] apparaît en haut de l'écran, à côté de la cloche. Sa pastille indique combien de torrents sont concernés et sa couleur résume la situation : [b]verte[/b] (tout est en seed), [b]orange[/b] (un torrent ne seede pas en ce moment — relance-le), [b]rouge[/b] (un hit & run est déjà compté). Un clic ouvre la liste, du plus urgent au moins urgent : pour chacun, le temps de seed accompli sur les 72 h requises, ton ratio sur ce torrent, et la date limite du délai de grâce. L'icône disparaît toute seule quand tout est régularisé.\n\n` +
          `[b]Deux pages dédiées[/b] (clique sur les pastilles 🌱 et H&R en haut de l'écran) :\n` +
          `• [b]📈 Mon activité[/b] (menu du compte, clic sur ton nom) : tout ce que tu télécharges et partages au même endroit — tes torrents en seed, tes téléchargements en cours avec leur progression, l'historique de tes téléchargements terminés et tes propres envois, avec les volumes envoyés et reçus.\n` +
          `• [b]🌱 Mes seeds[/b] : ce que tu seedes en ce moment, depuis combien de temps (seed cumulé), ton ratio sur chaque torrent, et si l'obligation de partage est [b]terminée ✅[/b], en cours ⏳, à relancer 🟠 ou un hit & run 🔴. Quatre onglets : en seed maintenant, obligation à terminer, obligation terminée, tout.\n` +
          `• [b]⚠️ Hit & run[/b] : seulement les hit & run [b]confirmés[/b] (avertissement déjà reçu). Pour chacun : reprendre le seed (gratuit, la bonne façon) ou [b]l'effacer avec des points bonus[/b].\n\n` +
          `[b]Effacer un hit & run avec des points[/b]\n` +
          `Le temps de partage reste la règle, donc effacer coûte volontairement bien plus cher que de seeder (un torrent seedé rapporte 1 point par heure) : [b]250 points de base + 5 points par heure de seed manquante[/b], + 100 points pour chaque hit & run déjà effacé ces 30 derniers jours, maximum 900 points. Le torrent est alors considéré comme régularisé et l'avertissement automatique correspondant est retiré. Le staff peut ajuster ces prix dans Admin > Paramètres.\n\n` +
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
          `• Un code d'invitation supplémentaire.\n\n` +
          `[b]Transférer des points à un autre membre[/b]\n` +
          `Dans la page Points bonus (section « Transférer des points ») ou directement sur le profil du membre (bouton 🎁 [b]Transférer des points[/b]) : choisis un montant (minimum 10 points, maximum 2 000 points envoyés par 24 h) et un petit mot facultatif. Le membre est prévenu par une notification. Un transfert est définitif, et les derniers envois et réceptions sont listés sous le formulaire.\n\n` +
          `[b]Amis depuis un profil[/b] : le profil d'un membre propose aussi ➕ Ajouter en ami, ✅ Accepter / Refuser sa demande, ou ✓ Retirer de mes amis, sans passer par la page Amis.`,
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
          `La page Envoyer te guide en plusieurs étapes : dépose ton fichier .torrent et ajoute son [b]NFO ou son MediaInfo (obligatoire)[/b], en fichier .nfo ou en texte collé, et le site tente de détecter automatiquement le maximum d'informations à partir du nom de fichier et du NFO (saison/épisode, langue, genre, type de contenu...). Tu n'as à remplir à la main que ce qui n'a pas pu être deviné.\n\n` +
          `[b]Catégorie[/b] : choisis une [i]sous-catégorie[/i] précise — les catégories principales (Films & Vidéos, Jeux Vidéo...) ne sont que des regroupements, pas des destinations valides.\n\n` +
          `[b]Recherche de la fiche[/b] : dès que le fichier et la catégorie sont choisis, le site cherche la fiche (TMDB, Deezer, RAWG...) avec le titre du torrent. Si le nom interne du .torrent n'est qu'un code (par exemple le dossier « GGSPA4 » d'un jeu GameCube), il prend le nom du fichier .torrent, ou à défaut la première ligne du NFO. La recherche repart toute seule quand tu changes le NFO, la catégorie, le nom ou l'année ; si tu as tapé ton propre titre dans la zone de recherche, il n'est jamais remplacé.\n\n` +
          `[b]Détails de la catégorie[/b] : selon la sous-catégorie choisie, la page affiche ses propres filtres : format audio et qualité d'un album, type et genre de musique, format de fichier et langue d'un ebook, console et genre d'un jeu, système d'un logiciel mobile, dynamic range (HDR10, Dolby Vision...), canaux (5.1, 7.1) et qualité audio d'un film. Ils sont [b]trouvés automatiquement[/b] d'après le nom de la release, les fichiers du .torrent (extensions, nombre de pistes), le NFO / MediaInfo (HDR, canaux, bit depth...) et les genres de la fiche choisie. Tu vois ✓ ce qui a été trouvé, avec un bouton « Modifier », et tu complètes d'un clic ce qui manque. Ces valeurs servent ensuite de filtres sur Parcourir.\n\n` +
          `[b]Jeux : choisir la plateforme d'un clic[/b]\n` +
          `Quand tu choisis « Jeux Vidéo », une rangée de boutons propose les plateformes (Windows, macOS, Linux, Switch, Switch 2, PS3, PS4, PS5, Xbox 360, Xbox One, Series X/S, Android, iOS...). Un clic range le jeu dans la bonne sous-catégorie et remplit le filtre de console. La plateforme est reconnue d'après le nom, les fichiers (.nsp, .apk...) et le NFO ; quand une seule est trouvée, elle est choisie toute seule. Si tu choisis une fiche de jeu (RAWG), les plateformes où le jeu existe sont marquées d'un ✓ et proposées en premier ; les autres restent accessibles sous « Autres plateformes ». La liste des résultats de recherche montre aussi toutes les plateformes de chaque jeu pour t'aider à choisir la bonne fiche.\n\n` +
          `[b]Doublons[/b] : un torrent avec la même empreinte (info_hash) qu'un torrent déjà présent est refusé. Si une version différente (qualité, langue...) existe déjà, le panneau « Versions » te la signale avant l'envoi.\n\n` +
          `[b]Modération[/b] : ton torrent passe en attente jusqu'à validation par le staff (sauf configuration particulière) — tu peux le modifier tant qu'il n'est pas encore approuvé.`,
      },
      {
        title: 'Parcourir, filtrer et trier',
        slug: 'parcourir-et-filtrer',
        keywords: 'browse, recherche, filtres, période, page size, acteur, producteur, réalisateur, genre, barre de recherche',
        content:
          `La page Parcourir combine une recherche en langage naturel (tape par exemple « Dune 2024 4K HDR VOSTFR », les critères sont détectés tout seuls) avec des filtres explicites : catégorie et sous-catégorie, qualité, source, langue, codec, audio, taille, nombre de seeders minimum, et [b]période d'ajout[/b] (24 heures / cette semaine / ce mois).\n\n` +
          `[b]Le fil d'Ariane[/b] : en haut de chaque page (sauf l'accueil), une ligne comme « Accueil › Parcourir › Films › Inception » montre où tu es. Chaque niveau est cliquable pour remonter d'un cran, par exemple d'un torrent vers sa catégorie ou d'un sujet du forum vers son forum.\n\n` +
          `[b]La barre de recherche du haut[/b] (disponible partout) propose des résultats au fil de la frappe : des torrents, mais aussi des [b]acteurs[/b], des [b]réalisateurs[/b], des [b]producteurs et studios[/b], des [b]genres[/b], des artistes, des membres et des catégories. Un clic sur une fiche (acteur, genre...) liste tous les torrents liés ; Entrée (« Voir tous les résultats ») cherche le mot dans les noms de torrents ET dans leurs acteurs, producteurs, studios et genres.\n\n` +
          `[b]Une seule carte de filtres[/b] : sous les catégories, la carte « Filtres » regroupe tout, rangé en sections (Période, Qualité vidéo, Audio, Langue et origine, Contenu, puis les filtres propres à la catégorie). Chaque section est une ligne de pastilles avec le nombre de résultats ; la ligne « Critères précis » en bas ajoute l'année, la taille, le nombre de seeders et l'état. Les filtres actifs s'affichent en haut de la carte : un clic sur l'un d'eux le retire, « Tout effacer » les retire tous. Le bouton « Filtres » de la barre du haut replie ou rouvre la carte (le site s'en souvient).\n\n` +
          `[b]Filtres propres à chaque catégorie[/b] : en choisissant par exemple Audio, Ebook ou Jeux Vidéo, de nouvelles lignes de filtres apparaissent (format musique, genre, console, langue ebook...). Seules les valeurs que portent les torrents affichés sont proposées, avec leur nombre ; tu peux en cocher plusieurs dans une même ligne (« FLAC ou MP3 ») et combiner plusieurs lignes. Un clic sur une pastille de la fiche d'un torrent ouvre Parcourir déjà filtré.\n\n` +
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
          `• [b]Compact[/b] : une ligne fine par torrent, pour en voir un maximum à l'écran.\n` +
          `• [b]Groupé[/b] : les releases d'un même film, d'une même série, d'un album ou d'un logiciel sont réunies sous un seul titre (affiche, qualités disponibles, totaux) ; un clic le déplie sur chaque version (langue, qualité, source, audio, codec, équipe, taille, complétés, seeders). La fiche d'un torrent montre la même liste dans « Versions ».\n\n` +
          `[b]En haut de l'écran[/b] : en plus de l'upload, du téléchargé et des points, tu vois ton [b]différentiel[/b] (upload moins téléchargé), le nombre de torrents que tu [b]seedes[/b] et tes [b]hit & run[/b] ; l'icône 👫 montre une pastille rouge pour les demandes d'ami et une verte pour les amis en ligne (la même chose à côté de « Amis » dans le menu). Le [b]calendrier freeleech[/b] (accueil et page Points bonus) affiche le freeleech en cours et les prochains, avec un décompte.\n\n` +
          `[b]Ton affichage par défaut[/b]\n` +
          `Dans Profil > Compte > « Affichage des listes de torrents », choisis celui qui s'applique partout par défaut. Tu peux ensuite changer l'affichage d'une page précise avec les boutons en haut de la liste : ce choix est retenu pour cette page, dans ce navigateur. Changer ton réglage par défaut dans ton compte remet toutes les pages sur celui-ci.\n\n` +
          `[b]Info-bulles des torrents : 4 styles au choix[/b]\n` +
          `Quand tu passes la souris sur un titre ou une affiche, une info-bulle montre le détail du torrent. Dans Profil > Compte > « Info-bulles des torrents », choisis son style (un aperçu de chacun est affiché) :\n` +
          `• [b]Affiche[/b] (par défaut) : grande affiche avec le titre dessus, année, note, durée, genres, synopsis et casting.\n` +
          `• [b]Cinéma[/b] : bandeau panoramique avec la petite affiche, synopsis et casting.\n` +
          `• [b]Classique[/b] : petite affiche à gauche et le détail à droite.\n` +
          `• [b]Minimal[/b] : sans image, juste le titre, les infos essentielles et un court résumé.\n` +
          `Une case permet aussi de ne plus afficher d'info-bulles. Ton choix te suit sur tous tes appareils. Sur écran tactile, il n'y a pas d'info-bulle (pas de survol).\n\n` +
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
          `[b]La page Réanimation[/b] (menu « Réanimation », pastille rouge = nombre de torrents sans seeder que [b]tu[/b] as déjà téléchargés et que tu peux donc relancer) liste tous les torrents sans seeder : ceux qui sont officiellement morts ☠️ et ceux qui sont encore dans le délai de grâce.\n` +
          `• Chaque ligne montre la taille, le nombre de téléchargements, depuis quand il est sans seeder, combien de membres attendent (leechers) et les [b]points bonus que tu gagnerais[/b] en le relançant.\n` +
          `• Un cadre vert signale ceux que [b]tu[/b] as déjà téléchargés ; le bouton « ⬇ Je le relance » télécharge le .torrent à rouvrir dans ton client, en pointant vers tes fichiers.\n` +
          `• « 🔁 Demander un reseed » prévient (au plus une fois par semaine par torrent) tous les membres qui l'ont déjà téléchargé.\n` +
          `• Tu peux trier (plus téléchargés, morts depuis le plus longtemps, plus gros, meilleure récompense), chercher, filtrer par catégorie ou n'afficher que ceux que tu as téléchargés.\n` +
          `• La page affiche aussi les [b]réanimateurs du mois[/b] et les torrents ressuscités récemment : une façon de remercier ceux qui redonnent vie au catalogue.\n` +
          `\n` +
          `Depuis la fiche d'un torrent à 0 seeder, le même bouton « Demander un reseed » est disponible.\n`,
      },
      {
        title: 'Statistiques et classements',
        slug: 'statistiques-et-classements',
        keywords: 'stats, classement, top, ratio, hit and run, records, tendance, meilleurs, plus bas, assidus, torrents populaires',
        content:
          `La page [b]Statistiques[/b] (menu « Stats ») est découpée en onglets :\n` +
          `• [b]📈 Aperçu[/b] : ta place dans les classements, les chiffres clés de la période (7, 30 ou 90 jours) comparés à la période précédente (▲ en hausse, ▼ en baisse), la croissance du site, les téléchargements par catégorie et les records.\n` +
          `• [b]👥 Membres[/b] : meilleurs et plus bas ratios, plus de points bonus, plus gros uploadeurs et téléchargeurs, plus longs seeders, plus de hit & run, les plus assidus (jours d'activité sur 30 jours), plus de commentaires, de messages au forum et au chat, plus remerciés, plus d'amis, les plus anciens, ainsi que la fréquentation, la répartition des ratios, de l'ancienneté et l'activité par heure et par jour.\n` +
          `• [b]🎞️ Torrents[/b] : santé du réseau, plus populaires (téléchargés, demandés, mieux notés, remerciés, favoris, commentés), moins populaires (moins téléchargés, un seul seeder, les plus difficiles à obtenir), plus petits et plus gros, plus anciens, morts depuis le plus longtemps, et un tableau par catégorie. Le site ne mesure pas les vitesses de transfert : « les plus difficiles à obtenir » compare le nombre de leechers au nombre de seeders.\n` +
          `• [b]💬 Communauté[/b] et [b]⚙️ Économie[/b] : participation, demandes, points en circulation, hit & run, répartitions par résolution, langue, rang et rôle.\n` +
          `Le ratio n'est classé que pour les membres qui ont téléchargé au moins 1 Go. Les classements se mettent à jour toutes les 5 minutes, et les contenus pour adultes n'y apparaissent que si tu as activé leur affichage.\n`,
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
        keywords: 'étoiles, rating, like, thanks, correction automatique, orthographe, éditeur',
        content:
          `Sur chaque fiche torrent :\n` +
          `• [b]Note en étoiles[/b] (1 à 5) : ton avis personnel sur le contenu, moyenné avec celui des autres membres.\n` +
          `• [b]👍 Merci[/b] : remercie l'uploader, qui gagne 1 point bonus (tu ne peux pas te remercier toi-même).\n` +
          `• [b]Commentaires[/b] : pour poser une question ou signaler un souci technique avec le fichier.\n\n` +
          `[b]Correction automatique (toutes les zones d'écriture)[/b]\n` +
          `Dans l'éditeur (commentaires, forum, messages, nouvelles, descriptions...), le français est corrigé pendant que tu écris : majuscule en début de phrase, accents des fautes courantes (tres → très, deja → déjà, ca → ça, l'ete → l'été...), « ... » devient « … », l'apostrophe et les guillemets deviennent typographiques (’ et « »), et l'espace insécable est ajoutée avant ? et !. Les adresses, @pseudo, #mots-clés et le code ne sont jamais touchés. Une correction qui ne te convient pas s'annule avec Ctrl+Z. Le bouton « ✓ Correction auto » de la barre d'outils l'active ou la désactive (ton choix est mémorisé), et le correcteur de ton navigateur souligne en rouge les autres fautes.`,
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
          `[b]Le menu du compte[/b] : clique sur ta carte (avatar + nom) en haut du menu de gauche. Il affiche ton ratio, ton upload, ton téléchargé et tes points bonus, puis les liens vers tout ce qui est à toi : profil, mes uploads, mes seeds, hit & run, favoris, collections, messages, mes demandes, boutique bonus, amis et wiki. Son dernier bouton, « Changer mon statut », ouvre le choix ci-dessous.\n\n` +
          `[b]Choisir ton statut[/b]\n` +
          `Depuis ce menu, tu peux choisir ton statut :\n\n` +
          `• [b]En ligne[/b], [b]Absent[/b], [b]Occupé[/b], ou [b]Apparaître hors ligne[/b] (les autres te voient alors comme déconnecté, même si tu es bien là).\n` +
          `• Un [b]message personnalisé[/b] libre (100 caractères) s'affiche à côté, visible dans l'infobulle qui apparaît quand on survole ton pseudo n'importe où sur le site.\n\n` +
          `Ce statut (sauf « Apparaître hors ligne ») et ton message sont visibles de tous les membres.`,
      },
      {
        title: 'Messenger : discussions, groupes et canaux',
        slug: 'messenger',
        keywords: 'chat, messagerie, appel, appeler, vidéo, caméra, partage d\'écran, vocal, message vocal, micro, gif, autocollant, sticker, dm, message privé, groupe, canal, salon, mention, répondre, réaction, amis, notifications, son, épingler, sourdine, archiver, partager un torrent',
        isFaq: true,
        supersedes: ['amis-et-messagerie', 'chat-public'],
        content:
          `Le Messenger regroupe toutes tes discussions au même endroit : la page [b]Chat[/b] du menu, et des bulles flottantes en bas à droite de n'importe quelle page.\n\n` +
          `[b]Trois types de conversations[/b]\n` +
          `• [b]Privées (1 à 1)[/b] : avec n'importe quel membre. Par défaut tout le monde peut t'écrire ; tu peux restreindre ça à tes amis seulement dans Profil > Compte.\n` +
          `• [b]Groupes[/b] : jusqu'à 50 personnes, avec un nom et une image. Seuls tes amis peuvent être ajoutés. Le créateur est propriétaire ; il peut nommer des administrateurs, qui ajoutent et retirent des membres et épinglent des messages. Tu peux quitter un groupe quand tu veux.\n` +
          `• [b]Canaux publics[/b] : des salons ouverts à toute la communauté (le canal « Général » est l'ancien chat public). Le staff en crée d'autres, avec leurs règles (lecture seule, mode lent...).\n\n` +
          `[b]Ce que tu peux faire dans un message[/b]\n` +
          `• Envoyer du texte, des [b]émojis[/b], des [b]photos[/b] (jpeg, png, webp), des [b]GIF animés[/b] (10 Mo maximum) et des [b]fichiers[/b] (20 Mo maximum) — par le trombone, en collant une image, ou en glissant un fichier sur la conversation.\n` +
          `• Envoyer un [b]message vocal[/b] : quand le champ est vide, le bouton 🎤 démarre l'enregistrement (le navigateur te demande l'accès au micro la première fois). Le bouton ➤ l'envoie, 🗑️ l'annule ; 5 minutes maximum. Celui qui l'écoute peut avancer dans l'enregistrement et l'accélérer (x1,5 / x2).\n` +
          `• Les [b]autocollants[/b] : le bouton 😀 ouvre trois onglets — Émojis (à insérer dans ton texte), Autocollants (de grands émojis qui partent d'un clic) et GIF. L'onglet GIF cherche dans une grande bibliothèque (tape un mot, ou parcours les tendances ; bascule sur « Stickers » pour des autocollants animés), et permet aussi d'envoyer un GIF enregistré sur ton ordinateur.\n` +
          `• [b]Partager un torrent[/b] (bouton 🎬) : sa fiche s'affiche dans la bulle avec l'affiche et les seeders. Coller un lien vers une fiche du site fait pareil.\n` +
          `• [b]Répondre[/b] à un message précis (il est cité), [b]réagir[/b] avec un émoji, [b]modifier[/b] ton message ou [b]annuler son envoi[/b] (il disparaît pour tout le monde).\n` +
          `• [b]Mentionner[/b] quelqu'un avec @pseudo : il est prévenu, et son nom ressort dans le message.\n` +
          `• Voir quand l'autre est en train d'écrire, et le « Vu » une fois ton message lu.\n` +
          `• Chercher un mot dans une conversation (🔍) et voir les photos et fichiers partagés (ⓘ).\n\n` +
          `[b]Messages épinglés[/b]\n` +
          `On peut épingler [b]plusieurs messages[/b] (25 au maximum) dans une conversation, comme sur Discord ou Telegram : menu ⋯ d'un message > « Épingler ». Dans un canal public, seul le staff épingle ; dans un groupe, les administrateurs ; dans une discussion privée, les deux personnes. Une barre en haut de la conversation montre le dernier message épinglé (un clic y amène et passe au suivant), et le bouton ☰ ouvre la liste de tous les messages épinglés avec leur contenu, même anciens. Une ligne « X a épinglé un message » apparaît dans le fil, et une 📌 marque le message. Désépingler se fait par le menu ⋯ ou depuis la liste.\n\n` +
          `[b]Message du jour d'un canal[/b]\n` +
          `Un canal peut avoir un [b]message du jour[/b] (règles, annonce, lien utile) affiché dans un bandeau en haut du canal. Tu peux le replier avec ✕ : il revient automatiquement quand le staff le modifie. Le staff l'écrit, le modifie ou l'efface avec le bouton 📢 de l'en-tête du canal (ou dans Staff > Canaux, champ « Message du jour »).\n\n` +
          `[b]Vider un canal[/b] (administrateurs)\n` +
          `Dans Staff > Canaux, le bouton « 🧹 Vider » (aussi dans le panneau ⓘ du canal) supprime [b]définitivement[/b] les messages d'un canal : [b]tous[/b], ou seulement ceux envoyés [b]depuis une date et une heure[/b] au choix. Une fenêtre indique combien de messages seront supprimés et ne s'active qu'après avoir écrit le nom du canal pour confirmer. Les réactions et les messages épinglés des messages supprimés disparaissent avec eux, et l'action est notée dans le journal du staff.\n\n` +
          `[b]Appels audio et vidéo[/b]\n` +
          `Dans une conversation privée, 📞 lance un appel audio et 🎥 un appel vidéo (les boutons sont grisés si l'autre n'est pas en ligne). Chez lui, ça sonne en haut de l'écran : il peut répondre, répondre sans caméra (🎤) ou refuser. Pendant l'appel tu peux couper ton micro, activer ou couper ta caméra (même si l'appel a commencé en audio), partager ton écran (ordinateur seulement) et réduire la fenêtre pour continuer à naviguer — le son continue. L'appel et sa durée (ou « manqué » / « refusé ») restent écrits dans la conversation. Le navigateur te demande l'accès au micro et à la caméra la première fois ; si tu as refusé, réautorise-les depuis le cadenas de la barre d'adresse. Les appels sont directs d'un navigateur à l'autre : si l'appel reste sur « Connexion… », l'un de vous est sans doute sur un réseau très restrictif (4G, entreprise) — essaie un autre réseau ou préviens le staff. Un seul appel à la fois ; les statuts « Occupé » ne reçoivent pas d'appels.\n\n` +
          `[b]S'organiser[/b]\n` +
          `Le menu ⋯ d'une conversation permet de l'[b]épingler[/b] en haut de la liste, de la mettre en [b]sourdine[/b] (1 h, 8 h, 24 h ou jusqu'à réactivation — plus de son ni de notification, mais les messages arrivent quand même) ou de l'[b]archiver[/b]. Les filtres Non lus, Groupes et Canaux retrouvent vite ce qui t'intéresse.\n\n` +
          `[b]Pastilles sur le lien « Chat »[/b]\n` +
          `Le lien « Chat » du menu porte deux pastilles : une pastille rouge pleine pour les [b]messages privés[/b] non lus (conversations à deux et groupes) et une pastille rouge à contour, précédée de #, pour les [b]messages publics[/b] non lus (canaux). Elles disparaissent quand tu lis les conversations, et ne comptent pas celles que tu as mises en sourdine. Les conversations privées qui arrivent s'ouvrent en petite bulle en bas à droite.\n\n` +
          `[b]La page Messages (messagerie avec sujet)[/b]\n` +
          `Pour un message plus posé qu'une discussion instantanée (avec un [b]sujet[/b], une mise en forme et un historique), la page [b]Messages[/b] du menu fonctionne comme une boîte de réception : la liste des conversations à gauche (recherche dans les sujets, les textes et les pseudos ; filtres Toutes / Non lues / Envoyées ; présence en ligne des membres) et le fil à droite. Dans un fil : [b]↩ Citer[/b] un message, [b]📋 Copier[/b], [b]● Non lu[/b] pour remettre la conversation en non lue, [b]💬 Chat[/b] pour continuer en direct, [b]🗑️ Supprimer[/b] (seulement de ta boîte). « Tout marquer comme lu » vide les pastilles d'un clic. Pour écrire : choisis un destinataire (tes amis sont proposés en un clic), un sujet et ton texte ; [b]Ctrl + Entrée[/b] envoie, et un brouillon est conservé si tu changes de page. Les règles du chat s'appliquent aussi ici : on ne peut pas écrire à un membre qui t'a bloqué, ni à un membre qui n'accepte que les messages de ses amis (réglage dans Profil > Compte).\n\n` +
          `[b]Notifications[/b]\n` +
          `Un son et une pastille (dans le menu et dans le titre de l'onglet) signalent chaque nouveau message ; le 🔔 de la liste des discussions règle le son et active les notifications du navigateur (quand l'onglet est en arrière-plan). Si tu es hors ligne, tu reçois une notification sur le site.\n\n` +
          `[b]Amis[/b] : envoie une demande depuis un profil ou la page Amis ; une fois acceptée, tu peux créer des groupes avec cette personne. Tu n'as pas besoin d'être ami pour discuter à deux.`,
      },
      {
        title: 'Teams',
        slug: 'teams',
        keywords: 'team, équipe, postuler, candidature, chef, officier, recrute',
        content:
          `La page [b]Teams[/b] (menu) liste les équipes du site avec leur chef, leurs membres, leur upload cumulé et si elles recrutent.

` +
          `• [b]Postuler[/b] : ouvre la team, lis ce qu'elle attend des candidats, écris un message de présentation et envoie ta candidature. Tu peux avoir [b]3 candidatures en attente[/b] et tu peux la retirer quand tu veux ; tu es prévenu de la réponse.
` +
          `• [b]Une seule team[/b] par compte : pour en rejoindre une autre, quitte d'abord la tienne.
` +
          `• Le [b]chef[/b] (nommé par l'administration) et ses [b]officiers[/b] examinent les candidatures, acceptent ou refusent, et retirent des membres ; le chef peut nommer des officiers, modifier la présentation, le logo et ouvrir ou fermer le recrutement.
` +
          `• Ta team s'affiche sur ton profil.

` +
          `[b]Teams détectées automatiquement[/b] : quand une release est partagée, le système lit la team à la fin de son nom (« …x264-TOXIC ») et l'ajoute à la liste, [b]sans propriétaire[/b] (les mentions génériques comme NOTAG sont ignorées). Si tu fais vraiment partie d'une de ces teams, ouvre sa page et [b]prends-en possession[/b] : envoie une demande avec une [b]preuve[/b] (lien vers une annonce, NFO, capture…). L'administration la vérifie ; le premier membre validé devient le propriétaire de la team et gère ensuite ses candidatures. Le nom de la team sur chaque release est cliquable.

` +
          `[b]Roadmap[/b] : la page Statistiques (et le numéro de version en bas du menu) mène au journal des modifications du site, rempli automatiquement avec la date et l'heure de chaque mise à jour, et à la liste de ce qui est prévu.`,
      },
      {
        title: 'Les nouvelles',
        slug: 'les-nouvelles',
        keywords: 'nouvelles, annonces, actualités, réactions, commentaires, mise à jour, maintenance, événement',
        content:
          `La page Nouvelles est l'endroit où le staff annonce ce qui change sur le site. La [b]dernière nouvelle[/b] est aussi mise en avant en haut de l'accueil.\n\n` +
          `[b]Lire et filtrer[/b]\n` +
          `Chaque nouvelle a un [b]type[/b] : 📯 Nouveauté, 🆕 Mise à jour, 🎉 Événement, 🛠️ Maintenance ou ⚠️ Important. Les boutons en haut de la page filtrent par type, et la recherche trouve un mot dans le titre, le chapeau et le texte. Une pastille rouge sur « Nouvelles » dans le menu compte celles publiées depuis ta dernière visite.\n\n` +
          `[b]Réagir[/b]\n` +
          `Sous chaque nouvelle, choisis une réaction (👍 ❤️ 😂 😮 😢 🎉 🔥). Tu n'as qu'une réaction par nouvelle : en choisir une autre remplace la première, et cliquer de nouveau sur la tienne la retire.\n\n` +
          `[b]Commenter[/b]\n` +
          `Les commentaires s'écrivent sous la nouvelle (3 000 caractères maximum). Tu peux modifier ou supprimer les tiens ; le staff peut supprimer n'importe quel commentaire et fermer les commentaires d'une nouvelle. L'auteur de la nouvelle est prévenu quand quelqu'un la commente.\n\n` +
          `[b]Aussi sur la page[/b]\n` +
          `Le nombre de membres qui l'ont lue, le temps de lecture, un bouton pour copier le lien, la nouvelle précédente et la suivante, et d'autres nouvelles à lire.\n\n` +
          `[b]Pour le staff[/b]\n` +
          `Le bouton « Nouvelle nouvelle » (et ✏️ Modifier) ouvre l'éditeur : titre, chapeau, image principale, type, épinglage et fermeture des commentaires. À la publication, tous les membres reçoivent une notification.\n\n` +
          `[b]Bannière instantanée (staff)[/b] : sous le titre, le bloc « 🎨 Bannière instantanée » crée tout de suite 3 bannières 16:9, gratuitement et sans service externe : le [b]vrai logo de Seeduction[/b], le titre et le chapeau en texte net, les couleurs et les motifs du type de la nouvelle (rouages pour une maintenance, confettis pour un événement, circuits pour une mise à jour...). Clique sur celle que tu veux, puis publie ; « Autres bannières » les recrée si tu changes le titre ou le type.

` +
          `[b]Image par IA, facultative (staff)[/b] : sous le titre, le bloc « ✨ Image automatique (Gemini) » crée 2 propositions de bannière en 16:9. Le [b]logo de Seeduction est envoyé à chaque génération[/b] comme image de référence, avec le titre, le résumé, le type de la nouvelle (chaque type a ses couleurs et ses motifs : rouages pour une maintenance, confettis pour un événement, circuits pour une mise à jour...) et les mots-clés que tu ajoutes. Clique sur l'image choisie, puis publie ; « Régénérer » en propose d'autres. La limite est de 12 images par heure et par membre du staff. L'administrateur du serveur active la fonction en ajoutant GEMINI_API_KEY dans backend/.env.`,
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
      {
        title: 'Support : chat en direct et billets',
        slug: 'support-chat-et-billets',
        keywords: 'aide, assistance, ticket, billet, support, contacter le staff, parler à un humain, problème, question, assistant, bot, ia, seeduction',
        isFaq: true,
        content:
          `Besoin d'aide ? La section [b]Support[/b] du menu rassemble tout au même endroit : une recherche dans le wiki, le chat en direct et tes billets.\n` +
          `\n` +
          `[b]1. Cherche dans le wiki[/b]\n` +
          `Décris ton problème en quelques mots : les articles du wiki les plus proches s'affichent aussitôt. Beaucoup de réponses y sont déjà (ratio, hit & run, upload, lecteur, compte...).\n` +
          `\n` +
          `[b]2. Discute en direct dans le canal « Support »[/b]\n` +
          `Dans le chat, le canal #Support est tenu par [b]Seeduction[/b], l'assistant du site, et par l'équipe SDT. Écris ta question : Seeduction répond tout de suite, automatiquement, en s'appuyant sur le wiki, et te montre les articles utilisés. Il continue de répondre à tes questions tant que tu n'as pas demandé l'aide d'une personne.\n` +
          `Sous chaque réponse, deux boutons : « ✅ Ça règle mon problème » ou « 🙋 Demander l'aide de l'équipe ». Tu peux aussi l'écrire (« je veux parler à quelqu'un de l'équipe »). L'équipe SDT est alors prévenue, Seeduction se retire et un membre de l'équipe te répond dans le canal dès qu'il est disponible. Si l'assistant ne trouve pas la réponse, il te propose lui-même ce bouton. Attention : ce canal est [b]public[/b], n'y écris jamais de mot de passe, de passkey ni d'information privée.\n` +
          `\n` +
          `[b]3. Ouvre un billet pour un suivi privé[/b]\n` +
          `Si tu ne veux pas attendre devant le chat, ou pour un sujet privé, ouvre un [b]billet de support[/b] (le bouton « 🎫 Ouvrir un billet » apparaît dans le chat, ou depuis la page Support). Un billet est une conversation [b]privée[/b] avec l'équipe :\n` +
          `• choisis une catégorie, donne un titre et décris le problème (captures d'écran et fichiers acceptés, 4 au maximum) ;\n` +
          `• ton échange avec l'assistant est joint automatiquement, tu n'as rien à répéter ;\n` +
          `• pendant que tu écris, le wiki te suggère des articles qui répondent peut-être déjà ;\n` +
          `• tu es prévenu (cloche, pastille du menu et, si le courriel du site est configuré, par courriel) dès que l'équipe répond, et tu réponds directement dans le billet.\n` +
          `\n` +
          `[b]Les états d'un billet[/b]\n` +
          `• [b]Ouvert[/b] : en attente de l'équipe. • [b]Répondu[/b] : à toi de répondre. • [b]Résolu[/b] : réglé — réponds-y si le problème revient, il se rouvre. • [b]Fermé[/b] : terminé, ouvre un nouveau billet si besoin. Un billet « répondu » sans nouvelle de ta part est marqué résolu au bout de quelques jours, puis fermé.\n` +
          `Une fois le billet résolu, tu peux noter le support (1 à 5 étoiles).\n` +
          `\n` +
          `[b]Bon à savoir[/b]\n` +
          `Le nombre de billets ouverts en même temps est limité. Pour signaler un torrent ou un message précis, utilise plutôt le bouton de signalement (voir « Signaler un problème »).\n` +
          `\n` +
          `[b]Pour le staff[/b]\n` +
          `[b]Modération > 🎫 Billets de support[/b] : la file des billets (filtres par statut, responsable, catégorie, priorité), le traitement d'un billet (statut, priorité, catégorie, assignation, notes internes invisibles du membre), l'insertion d'une [b]réponse type[/b] ou d'un article du wiki dans une réponse et le bouton « ✨ Brouillon IA » qui prépare une réponse d'après le billet et le wiki. [b]Modération > 📊 Statistiques du support[/b] : délais de réponse, satisfaction, billets par catégorie et activité de l'assistant. Le chiffre sur « Modération » dans le menu compte aussi les billets en attente.\n` +
          `Quand un membre demande l'aide de l'équipe dans le canal Support, tout le staff reçoit une notification qui mène au canal : réponds-lui directement (en répondant à son message), l'assistant reste en retrait. Le menu ⋯ d'un message de membre permet aussi d'« Ouvrir un billet pour ce membre ». L'assistant ignore normalement les messages du staff : pour l'essayer avec ton compte, écris « /ia ta question ».\n` +
          `Les administrateurs règlent dans Staff > Support les réponses types, les catégories, les délais de clôture automatique et l'assistant (activation, nom, fournisseur d'IA Claude ou Gemini, nombre de réponses avant de proposer l'aide de l'équipe, durée de silence après une demande, consignes supplémentaires) et peuvent le tester avant de le laisser répondre aux membres. Les clés d'IA se placent dans backend/.env (ANTHROPIC_API_KEY ou GEMINI_API_KEY).\n`,
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
        title: 'Compte famille : profils et codes PIN',
        slug: 'compte-famille',
        keywords: 'famille, profil, profils, pin, code pin, enfant, adulte, parent, contrôle parental, qui est-ce, changer de profil, bloquer',
        isFaq: true,
        content:
          `Plusieurs personnes d'une même famille peuvent utiliser Seeduction avec [b]un seul compte[/b], chacune avec son propre profil.\n\n` +
          `[b]Comment ça marche[/b]\n` +
          `• Dans le menu, [b]👨‍👩‍👧 Famille[/b] (visible du profil principal) permet d'activer le compte famille : tu choisis un [b]PIN à 4 chiffres[/b] pour toi, puis tu crées jusqu'à [b]4 profils[/b] au total (le tien compris).\n` +
          `• Chaque profil a son [b]nom[/b], son [b]avatar[/b] et son [b]PIN[/b] obligatoire. À chaque connexion, après le mot de passe, l'écran [b]« Qui est-ce ? »[/b] demande le profil et son PIN. Pour changer de profil en cours de route : [b]↔ Changer de profil[/b] (PIN demandé).\n` +
          `• Après 5 PIN erronés, le profil est verrouillé 10 minutes. Le profil principal peut redéfinir le PIN d'un profil à tout moment.\n\n` +
          `[b]Ce qui est propre à chaque profil[/b] : messagerie et amis, favoris, collections, commentaires, notes, abonnements, notifications, affichage par défaut et recommandations. Dans le chat, les commentaires et le forum, un profil s'affiche sous la forme [b]« Nom·pseudo »[/b] : le compte auquel il appartient reste toujours visible.\n\n` +
          `[b]Ce qui reste commun au compte[/b] : le ratio, l'upload, le seed et les hit & run, la passkey, les points bonus, les invitations, le mot de passe, la 2FA et le courriel. Seul le profil principal peut y toucher (boutique, jetons freeleech, clés API, sécurité). Les téléchargements de toute la famille comptent sur le même ratio : un profil qui télécharge sans seeder pénalise tout le monde.\n\n` +
          `[b]Droits de chaque profil[/b]\n` +
          `Le profil principal a le [b]contrôle complet[/b] et choisit, profil par profil (bouton 🔑 Droits, modifiable à tout moment) : le [b]contenu adulte (XXX)[/b], l'[b]envoi de torrents[/b], la [b]dépense des points[/b] (boutique, jetons freeleech, primes de demandes), le [b]téléchargement et la lecture[/b], la [b]messagerie, le chat et les appels[/b], et les [b]commentaires et le forum[/b]. Un nouveau profil n'a au départ ni contenu adulte, ni envoi, ni dépenses ; le reste est permis.\n\n` +
          `[b]Supervision par le profil principal[/b]\n` +
          `• Un [b]journal d'activité[/b] montre qui a fait quoi depuis le site : connexions, PIN erronés, téléchargements, lectures, consultations, recherches, commentaires, messages du forum, favoris, envois, demandes d'ami, signalements. Le seed fait par ton client BitTorrent reste au niveau du compte.\n` +
          `• Les [b]conversations[/b] de chaque profil se lisent (lecture seule) dans l'onglet « Conversations ». Préviens les membres de ta famille.\n` +
          `• Un profil peut être [b]bloqué[/b] (il ne peut plus s'ouvrir, même s'il est déjà connecté) puis débloqué.\n\n` +
          `Un profil n'a pas de mot de passe : on entre toujours par le compte. Si le compte est banni, tous ses profils le sont.`,
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
          `• [b]Super modérateur[/b] : comme un modérateur, avec en plus le droit de modifier les membres (upload, download, points bonus, courriel, rang, ratio minimum, effacement des hit & run).
` +
          `• [b]Admin[/b] : tout ce que peut faire un modérateur, plus la configuration du site (catégories, freeleech, templates, statistiques du serveur) et les [b]paramètres du tracker[/b] (Admin > Paramètres : cadeau de bienvenue, ratio minimum, hit & run, points bonus, rangs, prix de la boutique).\n` +
          `• [b]Owner[/b] : accès complet, y compris la promotion d'autres membres au staff.\n\n` +
          `Un badge distinctif identifie chaque rôle partout où le pseudo apparaît.\n\n` +
          `[b]Codes d'invitation génériques[/b] (administrateurs) : Admin > Invitations permet de créer des codes avec la durée de validité de ton choix (et un début programmé), un nombre d'inscriptions permises, et si besoin une seule inscription par adresse IP. Chaque inscription est notée (membre, IP, date) ; un code peut être désactivé, prolongé ou supprimé, et un lien d'inscription prêt à envoyer est généré.\n\n` +
          `[b]Journal d'activité des membres[/b] : sur le profil de chaque membre, l'équipe Seeduction (modérateurs et plus, personne d'autre) voit un journal de ses actions sur le site : téléchargements, envois, torrents consultés, recherches, commentaires, forum, amis, achats de points bonus, réglages, teams, avec la date et l'adresse IP, plus l'historique des connexions et de la modération (avertissements, bannissements, modifications du compte). Le contenu des messages privés n'est jamais enregistré. Les lignes sont conservées 180 jours. Pour un compte famille, le journal regroupe tous les profils et indique lequel a agi.\n\n` +
          `[b]La page Modération[/b]\n` +
          `Le menu « Modération » (avec une pastille rouge qui compte ce qui attend) regroupe le travail du staff : les [b]torrents à valider[/b] (pochette, envoyeur, extrait de description, approbation ou rejet en un clic avec un motif envoyé au membre, approbation de plusieurs d'un coup) et les [b]signalements[/b] ouverts (résoudre, ignorer, ou retirer le torrent signalé). L'accueil affiche aussi un bandeau « À modérer » quand il y a quelque chose à traiter, et la fiche de [b]chaque[/b] torrent porte en haut une barre de modération (visible du staff seulement) : statut actuel, Approuver / Rejeter ou Retirer selon le cas, Marquer mort, Freeleech, Double upload, Modifier, et les signalements ouverts s'il y en a.`,
      },
    ],
  },
];
