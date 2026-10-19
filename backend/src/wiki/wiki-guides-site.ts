import type { WikiSeedCategory } from './wiki-seed';

/**
 * Guides « bien utiliser le site » : des explications pas à pas, en langage simple, pour chaque grande fonction.
 * IMPORTANT : comme tout le wiki (voir wiki-seed.ts), ces guides doivent rester à jour. Quand une fonction ou une règle change
 * (seuils ECONOMY, boutons, menus, pages), mets l'article concerné à jour dans le même commit — et pense aussi à l'article de
 * référence correspondant dans wiki-seed.ts. Les guides renvoient vers ces articles de référence pour les chiffres détaillés.
 */
export const GUIDES_SITE: WikiSeedCategory = {
  name: 'Guides : bien utiliser le site',
  slug: 'guides-site',
  icon: '🧭',
  articles: [
    {
      title: "Premiers pas : de l'inscription à ton premier torrent",
      slug: 'guide-premiers-pas',
      keywords: 'débutant, commencer, inscription, premier téléchargement, installer un client, qbittorrent, passkey, démarrer',
      isFaq: true,
      content:
        `Bienvenue ! Ce guide te mène de l'inscription à ton premier torrent seedé, en 6 étapes. Compte une quinzaine de minutes.\n\n` +
        `[b]Étape 1 : créer ton compte[/b]\n` +
        `Seeduction fonctionne sur invitation : un membre te donne un code, tu le saisis sur la page d'inscription avec ton pseudo, ton courriel et un mot de passe. Tu reçois ensuite un [b]code à 6 chiffres par courriel[/b] (regarde dans les indésirables) : saisis-le pour activer le compte. Détails : [url=/wiki/creer-un-compte]Créer un compte[/url].\n\n` +
        `[b]Étape 2 : profiter du cadeau de bienvenue[/b]\n` +
        `Ton compte reçoit [b]50 Go d'upload[/b] et [b]7 jours de freeleech[/b] : pendant une semaine, ce que tu télécharges ne fait pas baisser ton ratio. Profites-en pour te faire un petit stock. Voir [url=/wiki/cadeau-de-bienvenue]Le cadeau de bienvenue[/url].\n\n` +
        `[b]Étape 3 : sécuriser ton compte[/b]\n` +
        `Active la double authentification (2FA) dans Profil > Sécurité. C'est rapide et ça protège ton ratio. Guide : [url=/wiki/guide-compte-securite]Sécuriser ton compte[/url].\n\n` +
        `[b]Étape 4 : installer un client BitTorrent[/b]\n` +
        `Un client est le logiciel qui télécharge et partage les fichiers. Les plus utilisés : [b]qBittorrent[/b] (gratuit, simple, recommandé), Transmission, Deluge, rTorrent / ruTorrent. Installe-le, ouvre-le, et note le dossier où il enregistre les téléchargements. Dans les options, vérifie que le [b]port d'écoute[/b] est ouvert sur ta box (UPnP activé ou redirection de port) : sans ça, tu partages moins bien.\n\n` +
        `[b]Étape 5 : télécharger ton premier torrent[/b]\n` +
        `Cherche un contenu sur [url=/browse]Parcourir[/url], ouvre sa fiche et clique sur [b]« Télécharger le .torrent »[/b]. Ouvre le fichier avec ton client (double-clic) : le téléchargement démarre. Pas à pas : [url=/wiki/guide-telecharger]Télécharger un torrent[/url].\n\n` +
        `[b]Étape 6 : seeder (partager) après le téléchargement[/b]\n` +
        `Une fois terminé, [b]laisse le torrent dans ton client[/b] : il continue d'envoyer des morceaux aux autres. C'est ce partage (le « seed ») qui fait monter ton ratio. Seeduction demande de seeder chaque torrent téléchargé [b]72 heures[/b] ou jusqu'à un ratio de 1 sur ce torrent. Tout est expliqué simplement dans [url=/wiki/guide-ratio-seed]Garder un bon ratio[/url].\n\n` +
        `[b]Ta passkey : ne la partage jamais[/b]\n` +
        `Chaque fichier .torrent téléchargé depuis le site contient ta passkey (ta clé personnelle). Ne partage pas ces fichiers : télécharge toujours le tien depuis le site.\n\n` +
        `[b]Et ensuite ?[/b]\n` +
        `• Personnalise le site : [url=/wiki/guide-personnaliser]thèmes, affichages, infobulles[/url].\n` +
        `• Découvre ce que tu peux automatiser : [url=/wiki/guides]tous les guides[/url].\n` +
        `• Une question ? Le wiki, le chat Support et les billets sont là : [url=/wiki/guide-support]Obtenir de l'aide[/url].`,
    },
    {
      title: 'Télécharger un torrent pas à pas',
      slug: 'guide-telecharger',
      keywords: 'télécharger, .torrent, client, qbittorrent, jeton freeleech, lecteur, fiche, ouvrir, ajouter, dossier',
      isFaq: true,
      content:
        `Ce guide explique comment passer de la fiche d'un torrent à un fichier qui se télécharge, et ce qu'il faut savoir avant de cliquer.\n\n` +
        `[b]1. Lire la fiche[/b]\n` +
        `Ouvre un torrent depuis [url=/browse]Parcourir[/url] ou la recherche. En haut, tu vois la [b]langue[/b] (VFQ, VFF, MULTI, VOSTFR, VO…), la [b]résolution[/b], le [b]format[/b], l'audio, la [b]date de sortie[/b], le nombre de seeders, la taille. Les onglets [b]Fichiers[/b], [b]NFO[/b] et [b]Commentaires[/b] donnent le détail. Pour une série ou un film d'une saga, l'onglet [b]« Saga & épisodes »[/b] montre, pour chaque saison, combien d'épisodes sont disponibles sur Seeduction ; clique sur une saison pour voir ses épisodes. Un épisode (ou un film de la saga) qui existe en plusieurs versions affiche leur nombre (« 3 releases ») : clique dessus pour les voir avec leurs étiquettes de langue et de qualité puis la taille. Un lien « faire une demande » apparaît pour ce qui manque. L'onglet [b]Fichiers[/b] présente le contenu en [b]arborescence[/b] : chaque dossier se déplie (+) ou se replie (−), avec une icône par type de fichier, le nombre de fichiers et la taille de son contenu, et des boutons « Tout déplier / Tout replier ». Un torrent avec [b]0 seeder[/b] ne peut pas se télécharger tant que quelqu'un ne le relance pas : voir [url=/wiki/guide-reanimation]Faire revivre un torrent[/url].\n\n` +
        `[b]2. Vérifier ton ratio et ton espace[/b]\n` +
        `Ton ratio est en haut de l'écran. S'il est trop bas, les nouveaux téléchargements peuvent être refusés : [url=/wiki/comprendre-le-ratio]Comprendre le ratio[/url]. Vérifie aussi l'espace disque disponible pour la taille du torrent.\n\n` +
        `[b]3. Économiser du ratio avec un freeleech[/b]\n` +
        `Si le torrent est en [b]freeleech[/b], ou si un freeleech global est en cours, le téléchargement ne compte pas dans ton ratio. Sinon, tu peux dépenser un [b]jeton freeleech[/b] (bouton « Utiliser un jeton » sur la fiche) : voir [url=/wiki/freeleech]Freeleech, tous les types[/url].\n\n` +
        `[b]4. Télécharger le fichier .torrent[/b]\n` +
        `Clique sur [b]« Télécharger le .torrent »[/b]. Le fichier est personnalisé avec ta passkey : ne le donne à personne.\n\n` +
        `[b]5. L'ouvrir dans ton client[/b]\n` +
        `• Double-clique sur le fichier, ou dans qBittorrent : Fichier > Ajouter un fichier torrent.\n` +
        `• Choisis le dossier d'enregistrement, puis valide : le téléchargement démarre.\n` +
        `• Sur une seedbox (ruTorrent, etc.) : envoie le .torrent par l'interface web du client.\n\n` +
        `[b]6. Autre façon : regarder directement[/b]\n` +
        `Pour un film ou une série, le bouton [b]« Ouvrir dans le lecteur Seeduction »[/b] lance la lecture sans attendre la fin du téléchargement : [url=/wiki/guide-lecteur]Le lecteur Seeduction[/url]. Ça compte comme un téléchargement normal.\n\n` +
        `[b]7. Après le téléchargement : seeder[/b]\n` +
        `Garde le torrent dans ton client au moins [b]72 heures[/b] (ou jusqu'à un ratio de 1 sur ce torrent). Suivi de tes obligations : page [b]🌱 Mes seeds[/b]. Voir [url=/wiki/guide-ratio-seed]Garder un bon ratio[/url].\n\n` +
        `[b]8. Remercier et noter[/b]\n` +
        `Un clic sur [b]👍 Merci[/b] donne 1 point bonus à l'uploader. Tu peux aussi noter le contenu et commenter ([url=/wiki/notes-merci-commentaires]Notes, Merci et commentaires[/url]).\n\n` +
        `[b]Problèmes fréquents[/b]\n` +
        `• « Ratio insuffisant » ou téléchargements bloqués : [url=/wiki/comprendre-le-ratio]ratio[/url] ou [url=/wiki/guide-hit-and-run-reparer]hit & run[/url] à régulariser.\n` +
        `• Le client dit « tracker non enregistré » ou refuse le torrent : retélécharge le .torrent depuis la fiche (n'utilise pas un ancien fichier).\n` +
        `• Rien ne se télécharge : vérifie le port de ton client et qu'il y a bien au moins un seeder.\n` +
        `• Pour automatiser tes téléchargements : [url=/wiki/guide-api-et-cles]API et flux RSS[/url].`,
    },
    {
      title: 'Trouver ce que tu cherches : recherche et filtres',
      slug: 'guide-trouver',
      keywords: 'recherche, filtres, parcourir, langue, résolution, vfq, acteur, genre, tri, vue groupée, suggestions, barre de recherche',
      isFaq: true,
      content:
        `Seeduction a une recherche très complète. Ce guide t'apprend à l'utiliser vite, des plus simples aux plus précis.\n\n` +
        `[b]1. La barre de recherche du haut[/b]\n` +
        `Tape quelques lettres : le site propose des torrents, mais aussi des [b]acteurs[/b], [b]réalisateurs[/b], [b]studios[/b], [b]genres[/b], artistes, membres et catégories. Un clic ouvre la fiche correspondante (par exemple tous les films d'un acteur). Entrée affiche tous les résultats.\n\n` +
        `[b]2. Écrire comme tu parles[/b]\n` +
        `Dans Parcourir, tape par exemple « Dune 2024 4K HDR VOSTFR » : l'année, la résolution, le HDR et la langue sont reconnus tout seuls et deviennent des filtres. Tu peux ensuite les retirer d'un clic.\n\n` +
        `[b]3. Les filtres de Parcourir[/b]\n` +
        `• Choisis une catégorie (et une sous-catégorie) : la barre des catégories compte uniquement les torrents approuvés.\n` +
        `• La carte « Filtres » regroupe la période (24 h, semaine, mois), la qualité vidéo, l'audio, la langue et l'origine, le contenu, et des filtres propres à la catégorie (format de musique, console d'un jeu, langue d'un ebook…).\n` +
        `• Chaque bouton affiche le [b]nombre de résultats[/b] qu'il donnerait : tu ne cliques jamais à l'aveugle.\n` +
        `• Plusieurs valeurs d'une même ligne se combinent (« FLAC ou MP3 »).\n\n` +
        `[b]4. Comprendre les étiquettes de langue[/b]\n` +
        `• [b]VFQ[/b] : version française québécoise. [b]VFF[/b] : France. [b]VOF[/b], [b]TRUEFRENCH[/b], [b]VFI[/b] (internationale), [b]VFB[/b] (belge).\n` +
        `• [b]MULTI.VFQ[/b], [b]MULTI.VFF[/b]… : plusieurs langues, dont une piste française précisée. [b]MULTI.VF2[/b] : VFF et VFQ dans le même fichier.\n` +
        `• [b]VOSTFR[/b] : version originale avec sous-titres français. [b]VO[/b] : version originale sans sous-titres français. [b]MUET[/b] : sans parole.\n` +
        `Filtrer sur « VFQ » retrouve aussi les MULTI.VFQ et MULTI.VF2. Détail complet : [url=/wiki/guide-nommer-releases]Bien nommer et décrire une release[/url].\n\n` +
        `[b]5. Trier et afficher[/b]\n` +
        `Clique sur le titre d'une colonne pour trier (date, taille, seeders…). Les boutons en haut de la liste changent l'affichage : liste, détails, grille, affiches, compact, [b]groupé[/b] ([url=/wiki/guide-personnaliser]Personnaliser le site[/url]).\n\n` +
        `[b]6. La vue Groupé : une seule ligne par film ou série[/b]\n` +
        `Elle réunit toutes les versions d'un même contenu. Un clic dépliant montre chaque release (langue, qualité, source, taille, seeders), et pour une série le nombre d'épisodes. Quand un épisode manque, un lien « faire une demande » apparaît.\n\n` +
        `[b]7. Pagination[/b]\n` +
        `Les numéros de page sont cliquables, en haut et en bas de la liste, avec le choix du nombre de résultats par page (25 / 50 / 100).\n\n` +
        `[b]8. Quand rien n'apparaît[/b]\n` +
        `• Enlève un filtre à la fois (le compteur des boutons te guide).\n` +
        `• Cherche un seul mot, sans année.\n` +
        `• Le contenu adulte est masqué tant que tu ne l'as pas activé ([url=/wiki/vie-privee]Vie privée[/url]).\n` +
        `• Le torrent n'existe peut-être pas encore : [url=/wiki/guide-demandes]fais une demande[/url].\n\n` +
        `[b]Pour aller plus loin[/b]\n` +
        `Tu peux aussi suivre automatiquement ce qui t'intéresse (nouveaux films d'une catégorie, d'une langue…) avec un [url=/wiki/guide-rss-clients]flux RSS[/url] ou Sonarr / Radarr ([url=/wiki/guide-api-et-cles]API[/url]).`,
    },
    {
      title: 'Garder un bon ratio : le seed expliqué simplement',
      slug: 'guide-ratio-seed',
      keywords: 'ratio, seed, seeder, upload, download, freeleech, bonne pratique, conseils, bloqué, hit and run, 72 heures',
      isFaq: true,
      content:
        `Le ratio est la règle d'or des trackers privés. Ce guide l'explique avec des exemples, et te donne des habitudes simples pour ne jamais être embêté.\n\n` +
        `[b]C'est quoi, le ratio ?[/b]\n` +
        `Ratio = ce que tu envoies ÷ ce que tu télécharges. Si tu télécharges 10 Go et que tu en envoies 20 Go aux autres, ton ratio est de 2. Un ratio de 1 veut dire que tu rends autant que tu prends. C'est ce partage qui fait vivre les torrents : sans seeders, personne ne peut télécharger.\n\n` +
        `[b]Ce qui se passe si le ratio est trop bas[/b]\n` +
        `Un ratio minimum est exigé pour continuer à télécharger (visible sur ton profil). Tu as une période de grâce (le premier volume téléchargé, 5 Go par défaut). S'il est trop bas, tu ne peux plus [i]démarrer[/i] de nouveaux téléchargements — mais ton seed continue de fonctionner, et c'est en seedant que tu remontes. Détails : [url=/wiki/comprendre-le-ratio]Comprendre le ratio[/url].\n\n` +
        `[b]La règle du seed : 72 heures ou ratio 1[/b]\n` +
        `Chaque torrent que tu télécharges en entier doit être seedé [b]72 heures[/b] au total, [b]ou[/b] jusqu'à ce que tu aies envoyé 100 % de sa taille. Dès que l'une des deux conditions est remplie, c'est réglé. Si tu abandonnes avant (après 48 h de grâce), c'est un [b]hit & run[/b]. Voir [url=/wiki/hit-and-run]Hit & Run[/url] et [url=/wiki/guide-hit-and-run-reparer]comment réparer[/url].\n\n` +
        `[b]7 habitudes pour un ratio sain[/b]\n` +
        `1. [b]Laisse ton client ouvert[/b] (ou utilise une seedbox) : seeder demande d'être connecté. Mets ton client en démarrage automatique avec ton ordinateur.\n` +
        `2. [b]Ne supprime jamais un torrent avant la fin de son obligation[/b] (72 h ou ratio 1). Le suivi est dans [b]🌱 Mes seeds[/b].\n` +
        `3. [b]Ouvre le port[/b] de ton client sur ta box : tu seras connectable par plus de monde, donc tu enverras plus.\n` +
        `4. [b]Télécharge malin[/b] : privilégie les torrents bien seedés et les [b]freeleech[/b] (calendrier freeleech sur l'accueil), utilise un jeton freeleech pour les gros fichiers ([url=/wiki/freeleech]Freeleech[/url]).\n` +
        `5. [b]Seede les contenus peu seedés[/b] : un torrent avec 1 ou 2 seeders envoie beaucoup à ceux qui arrivent. Les torrents morts à relancer rapportent des points : [url=/wiki/guide-reanimation]Faire revivre un torrent[/url].\n` +
        `6. [b]Ne télécharge pas trop d'un coup[/b], surtout avec Sonarr / Radarr ou le RSS : fixe un nombre maximum de torrents actifs et des filtres serrés.\n` +
        `7. [b]Envoie du contenu[/b] : un bon torrent partagé qui est téléchargé par beaucoup de membres fait monter ton upload très vite ([url=/wiki/guide-envoyer-premier-torrent]Envoyer ton premier torrent[/url]).\n\n` +
        `[b]Tes points bonus travaillent pour toi[/b]\n` +
        `Chaque torrent que tu seedes rapporte [b]1 point par heure[/b]. Tu peux les échanger contre de l'upload, des jetons freeleech ou des invitations : [url=/wiki/guide-points-bonus]Gagner et dépenser des points bonus[/url].\n\n` +
        `[b]J'ai envoyé des torrents mais mon upload ne bouge pas : normal ?[/b]\n` +
        `L'upload mesure ce que ton client envoie réellement : tant que personne ne télécharge ta release, rien ne circule. Trois choses jouent pour toi pendant ce temps :\n` +
        `• [b]Le crédit d'envoi[/b] : quand le staff approuve ton torrent, [b]25 % de sa taille[/b] est ajouté à ton upload, même si personne ne l'a encore téléchargé (jusqu'à 25 Go par torrent et 100 Go par jour). Il faut que ton client [b]seede[/b] le torrent à ce moment-là ; sinon le crédit est versé dès que tu le seedes. Il est repris si le torrent est supprimé ou rejeté. Tu le vois dans [url=/bonus]Points bonus[/url].\n` +
        `• [b]Les points bonus[/b] : chaque torrent seedé rapporte 1 point par heure, que quelqu'un le télécharge ou non. 50 torrents en seed, c'est 1 200 points par jour, à échanger contre de l'upload dans la boutique.\n` +
        `• [b]Le vrai upload[/b] arrive ensuite, dès que des membres téléchargent : c'est ce qui fait monter ton ratio durablement.\n\n` +
        `[b]Où suivre ta situation[/b]\n` +
        `• L'en-tête de l'écran : ratio, upload, téléchargé, points, seeds (🌱) et hit & run.\n` +
        `• [b]📈 Mon activité[/b] : tout ce que tu télécharges et partages.\n` +
        `• [b]🌱 Mes seeds[/b] : ce qui est en seed, ce qui reste à terminer, ce qui est à relancer.\n` +
        `• [url=/wiki/guide-stats]Statistiques[/url] : ta place dans les classements.\n\n` +
        `[b]Je suis bloqué, que faire ?[/b]\n` +
        `1. Va dans [b]🌱 Mes seeds[/b] et relance les torrents « à relancer » (ils sont en orange ou rouge).\n` +
        `2. Utilise des freeleech pour continuer à télécharger sans baisser ton ratio.\n` +
        `3. Seede tout ce que tu peux et attends : le seed fait remonter le ratio.\n` +
        `4. Les points bonus peuvent racheter de l'upload.`,
    },
    {
      title: 'Réparer un hit & run',
      slug: 'guide-hit-and-run-reparer',
      keywords: 'hit and run, hnr, réparer, effacer, avertissement, abandon, régulariser, reprendre le seed, icône rouge',
      isFaq: true,
      content:
        `Un hit & run, c'est un torrent téléchargé en entier puis abandonné trop tôt. Pas de panique : c'est réparable, et c'est gratuit si tu reprends le seed.\n\n` +
        `[b]Comment savoir si j'en ai ?[/b]\n` +
        `En haut de l'écran, l'icône [b]🌱[/b] devient [b]rouge[/b] et la pastille [b]H&R[/b] compte les cas confirmés. La page [b]⚠️ Hit & run[/b] liste chaque torrent concerné, avec ce qu'il te reste à faire. Tu reçois aussi une notification d'avertissement.\n\n` +
        `[b]Option 1 : reprendre le seed (gratuit, la bonne méthode)[/b]\n` +
        `1. Retrouve le torrent : ouvre la page Hit & run et télécharge de nouveau son .torrent (ou ré-ajoute-le si ton client l'a gardé).\n` +
        `2. Dans ton client, pointe-le vers [b]le même dossier[/b] où se trouvent les fichiers déjà téléchargés (dans qBittorrent : clic droit > Définir l'emplacement, ou à l'ajout choisis ce dossier). Le client vérifie les fichiers puis se met à seeder, sans tout re-télécharger.\n` +
        `3. Laisse seeder jusqu'à atteindre les [b]72 heures[/b] cumulées ou un upload égal à [b]100 % de la taille[/b]. Le temps déjà seedé compte : le décompte reprend là où il en était.\n` +
        `4. Dès que la condition est remplie, l'avertissement est levé tout seul.\n\n` +
        `[b]Option 2 : effacer avec des points bonus[/b]\n` +
        `Si tu n'as plus les fichiers, ou pas le temps, tu peux effacer le hit & run contre des points (bouton sur la page Hit & run). Le prix est volontairement plus élevé que le seed : 250 points de base + 5 points par heure de seed manquante, majorés si tu en effaces souvent, avec un plafond. Le torrent est alors considéré comme régularisé. Voir [url=/wiki/hit-and-run]Hit & Run[/url] pour le détail.\n\n` +
        `[b]Que se passe-t-il si je n'en fais rien ?[/b]\n` +
        `À partir de 5 hit & run non régularisés, tes nouveaux téléchargements sont bloqués (le seed continue). Régularise-en assez pour être débloqué.\n\n` +
        `[b]Éviter qu'un hit & run se reproduise[/b]\n` +
        `• Ne supprime pas un torrent avant la fin de son obligation (suis-le dans [b]🌱 Mes seeds[/b]).\n` +
        `• Dans Sonarr / Radarr, règle « Seed Ratio » à 1 et « Seed Time » à 4320 minutes ([url=/wiki/guide-sonarr]Sonarr[/url]).\n` +
        `• Dans qBittorrent, règle les limites de partage pour arrêter après 72 h ou ratio 1, et non avant.\n` +
        `• Un client qui plante ou un PC éteint interrompt le seed : mets ton client en démarrage automatique.\n\n` +
        `Guide général : [url=/wiki/guide-ratio-seed]Garder un bon ratio[/url].`,
    },
    {
      title: 'Gagner et dépenser des points bonus',
      slug: 'guide-points-bonus',
      keywords: 'points bonus, boutique, jeton freeleech, upload, invitation, transférer, gagner des points, shop, acheter',
      isFaq: true,
      content:
        `Les points bonus sont la monnaie du site. Ils ne touchent pas ton ratio : ils servent à acheter des avantages. Ce guide montre comment en gagner beaucoup et bien les dépenser.\n\n` +
        `[b]Comment en gagner[/b]\n` +
        `• [b]Seeder[/b] : 1 point par heure et par torrent seedé (jusqu'à 200 torrents comptés par heure). Plus tu seedes de torrents longtemps, plus tu gagnes.\n` +
        `• [b]Être remercié[/b] : 1 point à chaque 👍 Merci reçu sur un de tes torrents.\n` +
        `• [b]Relancer un torrent mort[/b] : récompense proportionnelle à sa taille et au temps passé sans seeder ([url=/wiki/guide-reanimation]Faire revivre un torrent[/url]).\n` +
        `• Des récompenses ponctuelles : pluie de points du [url=/wiki/guide-pot-commun]pot commun[/url], primes de demandes ([url=/wiki/guide-demandes]Demandes[/url]).\n\n` +
        `[b]Où voir ton solde[/b]\n` +
        `En haut de l'écran (✦ points) et sur la page [b]Points bonus / Boutique[/b] du menu du compte.\n\n` +
        `[b]Ce que tu peux acheter[/b]\n` +
        `• [b]De l'upload[/b] (paquets de 5 Go ou 20 Go, le plus gros étant plus avantageux) : le plus utile pour remonter un ratio.\n` +
        `• Un [b]jeton freeleech[/b] : tu l'utilises sur un torrent précis (bouton « Utiliser un jeton » sur la fiche) : son téléchargement ne compte pas dans ton ratio pendant 7 jours. À garder pour les très gros fichiers.\n` +
        `• Une [b]invitation[/b] pour faire entrer un proche (tu es responsable de lui : [url=/wiki/creer-un-compte]Créer un compte[/url]).\n\n` +
        `[b]Transférer des points[/b]\n` +
        `Sur la page Points bonus ou sur le profil d'un membre (🎁 Transférer des points) : minimum 10 points, maximum 2 000 envoyés par 24 h, avec un petit mot facultatif. Un transfert est définitif.\n\n` +
        `[b]Conseils pour optimiser[/b]\n` +
        `• Seeder beaucoup de petits torrents gagne autant de points qu'un gros : garde longtemps ce que tu as téléchargé.\n` +
        `• Garde un petit stock de points pour un jeton freeleech avant un gros téléchargement.\n` +
        `• Donne au [url=/wiki/guide-pot-commun]pot commun[/url] : si le pot se remplit, tout le monde gagne, toi compris.\n` +
        `• Pour effacer un hit & run, seeder coûte beaucoup moins cher que payer : [url=/wiki/guide-hit-and-run-reparer]Réparer un hit & run[/url].\n\n` +
        `[b]Jouer ses points[/b] : la section [url=/jeux]Jeux[/url] (Mise-O-jeu) permet de parier des points sur les matchs du Canadien, ou de jouer gratuitement. Les points reçus par un don ne peuvent pas être misés : [url=/wiki/guide-mise-o-jeu]Jouer à Mise-O-jeu[/url].

` +
        `Référence complète : [url=/wiki/points-bonus-et-boutique]Points bonus et la boutique[/url].`,
    },
    {
      title: 'Participer au pot commun',
      slug: 'guide-pot-commun',
      keywords: 'pot commun, pot du plaisir, cagnotte, donner, don, freeleech global, paliers, mécène',
      content:
        `Le pot commun est une cagnotte que les membres remplissent ensemble avec leurs points bonus. Quand il est plein, [b]tout le monde[/b] profite d'une récompense (freeleech pour tout le site, parfois double upload, pluie de points ou jetons).\n\n` +
        `[b]Donner, en 3 étapes[/b]\n` +
        `1. Ouvre la page [url=/pot]Pot commun[/url] (ou clique sur la jauge de l'accueil).\n` +
        `2. Choisis un montant : respecte le don minimum (et le maximum / la limite du jour s'ils existent, ils sont affichés).\n` +
        `3. Clique sur « Donner ». Les points sont débités tout de suite et ne sont pas remboursables.\n\n` +
        `[b]Lire la page du pot[/b]\n` +
        `• La [b]jauge[/b] montre où en est le pot. Les repères 🎁 sont des [b]paliers[/b] : des récompenses intermédiaires se débloquent en route.\n` +
        `• L'encart [b]Participation[/b] liste les récompenses qui dépendent du nombre de membres différents qui ont donné (même un petit don compte).\n` +
        `• Les [b]meilleurs donateurs[/b] et les mécènes de tous les temps sont affichés.\n\n` +
        `[b]Quand le pot est plein[/b]\n` +
        `Une annonce prévient tout le monde. Le freeleech démarre tout de suite ou après un court délai. Un nouveau pot s'ouvre ensuite. Les donateurs peuvent recevoir un bonus et une partie de leurs points peut leur être rendue.\n\n` +
        `[b]Quand en profiter[/b]\n` +
        `Un freeleech global est le meilleur moment pour télécharger gros sans toucher à ton ratio : surveille le calendrier freeleech (accueil et page Points bonus).\n\n` +
        `Référence complète : [url=/wiki/pot-commun]Le pot commun[/url].`,
    },
    {
      title: 'Jouer à Mise-O-jeu : parier sur les matchs du Canadien',
      slug: 'guide-mise-o-jeu',
      keywords: 'mise-o-jeu, jeux, pari, gageure, mise, pronostic, canadien, canadiens, hockey, lnh, points bonus, caisse, classement',
      content:
        `[b]Mise-O-jeu[/b] te permet de parier des points bonus sur les matchs du Canadien de Montréal, ou de jouer gratuitement pour gagner quelques points. C'est dans la section [url=/jeux]Jeux[/url] du menu.

` +
        `[b]Les trois paris de chaque match[/b]
` +
        `• [b]Vainqueur[/b] : le Canadien gagne ou perd.
` +
        `• [b]Fin du match[/b] : temps réglementaire, prolongation ou tirs de barrage.
` +
        `• [b]Score exact[/b] : le score final (le plus difficile, donc le plus payant).
` +
        `Chaque pari se joue une seule fois par match. Les paris ouvrent quelques jours avant le match et [b]ferment quand il commence[/b].

` +
        `[b]Gratuit ou avec une mise[/b]
` +
        `• [b]Pronostic gratuit[/b] : aucun risque. S'il est juste, tu gagnes une petite récompense fixe (affichée sur le bouton), jusqu'à un plafond par semaine.
` +
        `• [b]Mise[/b] : tu mises des points (minimum et maximum affichés). Ils vont dans la [b]caisse[/b] de ce pari.

` +
        `[b]Comment la caisse est partagée[/b]
` +
        `Les gagnants se partagent [b]toute la caisse[/b], au prorata de leur mise. Le site ne crée aucun point pour les mises : tu gagnes les points misés par les autres. Plus un choix est risqué (peu de monde dessus), plus il rapporte. Avant de miser, la page t'indique le gain estimé, qui change selon les mises des autres joueurs.

` +
        `[b]Quand tes points te sont rendus[/b]
` +
        `• Moins de 2 joueurs différents ont misé sur ce pari.
` +
        `• Personne n'a trouvé la bonne réponse, ou tout le monde l'a trouvée.
` +
        `• Le match est reporté ou annulé.

` +
        `[b]Règlement[/b]
` +
        `Il est automatique, dès que la LNH publie le résultat officiel. Tu reçois une notification avec tes gains. Le classement de la page Jeux affiche les meilleurs gains nets.

` +
        `[b]Points de don[/b]
` +
        `Les points reçus avec un don ne peuvent pas être misés. Tu peux les dépenser normalement ailleurs (boutique, pot commun, demandes) : ils sont dépensés en premier, pour te laisser le plus de points misables possible. La page Jeux affiche tes points misables et tes points de don.

` +
        `[b]Limites et sécurité[/b]
` +
        `• Ton compte doit avoir quelques jours d'ancienneté, et il y a une limite de points misés par 24 heures.
` +
        `• Un compte famille joue avec les points du compte : les mises demandent l'autorisation de dépenser.
` +
        `• Tu peux te retirer des jeux à tout moment avec le bouton [b]Me retirer des jeux[/b] de la page.
` +
        `• Ce sont des points du site, sans valeur en argent.

` +
        `[b]Points offerts à chaque but[/b]
` +
        `Quand le Canadien marque, tous les membres en ligne reçoivent une notification et quelques points bonus (avec un plafond par jour). Tu peux couper cette notification dans Notifications > catégorie « Jeux et buts du Canadien ».

` +
        `Voir aussi : [url=/wiki/guide-points-bonus]Gagner et dépenser des points bonus[/url], [url=/wiki/guide-personnaliser]Personnaliser le site[/url] (score du Canadien en direct).`,
    },
    {
      title: 'Jouer aux machines à sous',
      slug: 'guide-machines-a-sous',
      keywords: 'machine à sous, machines à sous, slot, jeux, jeu de hasard, tour gratuit, mise, jackpot, bonus, tours gratuits, joker, thème',
      content:
        `Les [b]machines à sous[/b] sont dans la section [url=/jeux]Jeux[/url] (bouton « Machines à sous »). Six machines au choix : [b]Grand Écran[/b] (cinéma), [b]Seeduction Or[/b], [b]Rondelle d'Or[/b] (hockey), [b]Cabane à Sucre[/b], [b]Fête du Moment[/b] (elle prend l'habillage de l'événement en cours : Halloween, Noël...) et [b]Trésor des Mers[/b] (pirates). Elles se jouent toutes de la même façon : seuls les dessins et les sons changent.\n\n` +
        `[b]Comment jouer[/b]\n` +
        `1. Choisis ta mise : [b]5, 10, 25, 50 ou 100 points[/b].\n` +
        `2. Clique sur [b]Tourner[/b] ou tire le [b]levier[/b] à droite de la machine. Trois rouleaux s'arrêtent l'un après l'autre.\n` +
        `3. Si des symboles identiques sont alignés sur l'une des [b]5 lignes[/b] (3 horizontales et 2 diagonales), tu gagnes. Une [b]paire[/b] de symboles identiques à gauche (le troisième est différent) paie aussi un petit gain. Les gains de toutes les lignes s'additionnent.\n\n` +
        `[b]Les symboles spéciaux[/b]\n` +
        `• [b]Joker (WILD)[/b] : remplace n'importe quel symbole pour former une ligne.\n` +
        `• [b]Bonus[/b] : trois bonus ou plus visibles n'importe où déclenchent [b]5 tours gratuits[/b] à la même mise, dont [b]les gains sont doublés[/b]. Le bonus tombe environ une fois sur vingt.\n` +
        `• Le bouton [b]Gains[/b] de la machine montre ce que paie chaque symbole pour ta mise.\n\n` +
        `[b]Un tour gratuit par jour[/b]\n` +
        `Chaque jour, tu as un tour gratuit (bouton « Tour gratuit du jour ») : rien n'est débité, et ton gain, plafonné, est pour toi.\n\n` +
        `[b]À savoir[/b]\n` +
        `• C'est un jeu de hasard : le serveur tire le résultat, jamais ton navigateur. [b]Gagner n'est jamais garanti.[/b] Certains joueurs gagnent gros, d'autres moins, au hasard.\n` +
        `• Le [b]gros lot progressif[/b] 🏆 grossit à chaque mise de tous les membres et s'affiche en haut de la machine : il est remporté en alignant trois fois le meilleur symbole (sans joker) avec une mise de 25 points ou plus. Quand quelqu'un le gagne, tous les membres connectés sont prévenus, et il repart de sa mise de départ.\n` +
        `• Une [b]remise de fidélité[/b] 💝 te rend chaque matin une part de tes pertes de la veille (tous les jeux contre la maison), avec une notification.\n` +
        `• Les [b]points reçus par un don ne peuvent pas être misés[/b].\n` +
        `• Il y a une [b]limite de pertes par 24 heures[/b] et un [b]gain maximal par partie[/b], affichés sur la page. Un rappel s'affiche après 20 minutes de jeu.\n` +
        `• Le son peut se couper avec le bouton 🔊 de la machine. Tu peux te retirer des jeux à tout moment avec « Me retirer des jeux » sur la page Jeux.\n` +
        `• Ce sont des points du site, sans valeur en argent. Joue pour le plaisir et fais des pauses.\n\n` +
        `Voir aussi : [url=/wiki/guide-mise-o-jeu]Jouer à Mise-O-jeu[/url], [url=/wiki/guide-points-bonus]Gagner et dépenser des points bonus[/url].`,
    },
    {
      title: 'Jouer à Plus haut ou plus bas',
      slug: 'guide-plus-haut-plus-bas',
      keywords: 'plus haut ou plus bas, cartes, jeu, série, encaisser, multiplicateur, higher lower, jeux',
      content:
        `[b]Plus haut ou plus bas[/b] est un jeu de cartes rapide, dans la section [url=/jeux]Jeux[/url]. Une carte est affichée : devine si la prochaine sera plus haute ou plus basse.\n\n` +
        `[b]Comment jouer[/b]\n` +
        `1. Choisis ta mise (5 à 100 points) et clique sur [b]Distribuer[/b]. Tu peux aussi jouer ta [b]partie gratuite du jour[/b].\n` +
        `2. Clique sur [b]Plus haut[/b] ou [b]Plus bas[/b]. Les chances de chaque choix et le multiplicateur correspondant sont affichés sur les boutons : un choix risqué paie plus.\n\n` +
        `[b]Encaisser ou continuer[/b]\n` +
        `• Bonne réponse : ta série continue et ton gain augmente. Tu peux [b]encaisser[/b] à tout moment, dès la première bonne réponse, ou continuer pour viser plus gros.\n` +
        `• Mauvaise réponse : la partie est perdue. Les [b]égalités font perdre[/b], et l'as est la carte la plus haute.\n\n` +
        `[b]À savoir[/b]\n` +
        `• Les cartes sont tirées par le serveur, jamais par ton navigateur. Gagner n'est jamais garanti.\n` +
        `• Une seule partie à la fois. Une partie abandonnée est réglée d'office : remboursée si tu n'avais pas répondu, encaissée sinon.\n` +
        `• Les [b]points reçus par un don ne peuvent pas être misés[/b]. Il y a une limite de pertes par 24 heures et un gain maximal par partie.\n` +
        `• La [b]remise de fidélité[/b] te rend chaque matin une part de tes pertes de la veille.\n` +
        `• Tu peux te retirer des jeux à tout moment avec « Me retirer des jeux » sur la page Jeux. Ce sont des points du site, sans valeur en argent.\n\n` +
        `Voir aussi : [url=/wiki/guide-machines-a-sous]Jouer aux machines à sous[/url], [url=/wiki/guide-mise-o-jeu]Jouer à Mise-O-jeu[/url].`,
    },
    {
      title: 'Tourner la roue de la fortune',
      slug: 'guide-roue-de-la-fortune',
      keywords: 'roue de la fortune, roue, tour gratuit, quotidien, série, bonus, jeton, freeleech, jeux, cadeau',
      content:
        `La [b]roue de la fortune[/b] est un cadeau quotidien de la section [url=/jeux]Jeux[/url] : un tour gratuit par jour, sans rien miser et sans rien perdre.\n\n` +
        `[b]Comment jouer[/b]\n` +
        `1. Ouvre la roue depuis la page Jeux et clique sur [b]Tourner la roue[/b].\n` +
        `2. La roue tourne, ralentit, puis la languette du haut désigne ton lot. Il est ajouté tout de suite à tes points bonus.\n` +
        `3. Les lots sont des points, des [b]jetons freeleech[/b] 🎟️ ou, avec un peu de chance, un très gros lot de 500 ou 1 000 points. Tous les lots possibles sont affichés sous la roue.\n` +
        `4. Tu peux tourner la roue une fois par jour (le compteur repart à minuit, heure de Montréal). Un compte à rebours indique le prochain tour.\n\n` +
        `[b]La série de jours de suite[/b]\n` +
        `• Chaque jour de suite où tu tournes la roue améliore tes gains : [b]+5 % par jour[/b], jusqu'à +50 %.\n` +
        `• Le [b]7e jour de suite[/b], un bonus de 100 points s'ajoute à ton lot, et la semaine recommence.\n` +
        `• Si tu manques un jour, la série repart de zéro : reviens chaque jour pour la garder.\n\n` +
        `[b]À savoir[/b]\n` +
        `• Le tirage est fait par le serveur, jamais par ton navigateur : l'animation ne fait que montrer le résultat.\n` +
        `• Les gros lots sont annoncés par notification, et ceux de la semaine sont affichés sur la page de la roue.\n` +
        `• Ce sont des points du site, sans valeur en argent. Tu peux te retirer des jeux à tout moment avec « Me retirer des jeux » sur la page Jeux.\n\n` +
        `Voir aussi : [url=/wiki/guide-machines-a-sous]Jouer aux machines à sous[/url], [url=/wiki/guide-plus-haut-plus-bas]Jouer à Plus haut ou plus bas[/url], [url=/wiki/guide-quiz-quotidien]Jouer au quiz quotidien[/url].`,
    },
    {
      title: 'Jouer au quiz quotidien',
      slug: 'guide-quiz-quotidien',
      keywords: 'quiz, quiz quotidien, questions, culture, trivia, série, podium, classement, jeux, points',
      content:
        `Le [b]quiz quotidien[/b] est un jeu gratuit de la section [url=/jeux]Jeux[/url] : chaque jour, les mêmes questions pour tous les membres. Tu ne mises rien et tu ne perds rien.\n\n` +
        `[b]Comment jouer[/b]\n` +
        `1. Ouvre le quiz depuis la page Jeux et clique sur [b]Commencer le quiz[/b] : 5 questions t'attendent.\n` +
        `2. Chaque question a quatre réponses et un chrono de 20 secondes. Clique sur ta réponse : la bonne s'affiche tout de suite, avec une courte explication quand il y en a une.\n` +
        `3. Si le temps est écoulé, la question compte comme ratée et on passe à la suivante. Une seule partie par jour : le compteur repart à minuit, heure de Montréal.\n` +
        `4. Si tu quittes en cours de route, tu peux reprendre où tu étais, mais le chrono continue de tourner.\n\n` +
        `[b]Les points[/b]\n` +
        `• Chaque bonne réponse rapporte [b]10 points[/b], plus un [b]bonus de rapidité[/b] jusqu'à 5 points : plus tu réponds vite, plus il est grand.\n` +
        `• Un [b]sans-faute[/b] (5 sur 5) rapporte [b]50 points[/b] de plus.\n` +
        `• Chaque [b]jour de suite[/b] où tu joues ajoute 5 % à tes points, jusqu'à +50 %. Si tu manques un jour, la série repart de zéro.\n` +
        `• Même quand aucune réponse n'est bonne, tu reçois un [b]prix de consolation[/b] de 10 points : on ne repart jamais les mains vides.\n\n` +
        `[b]Classements et podium[/b]\n` +
        `• Le classement du jour range les joueurs par nombre de bonnes réponses, puis par temps total. Un classement de la semaine est aussi affiché.\n` +
        `• Chaque matin, les [b]trois meilleurs de la veille[/b] reçoivent 50, 30 et 20 points, avec une notification.\n\n` +
        `[b]À savoir[/b]\n` +
        `• Les bonnes réponses restent sur le serveur jusqu'à ce que tu aies répondu, et le chrono est surveillé par le serveur : la page ne fait qu'afficher.\n` +
        `• Les questions viennent d'une banque (cinéma, séries, musique, hockey, sciences, géographie, technologie…) que l'équipe enrichit avec tes idées : sur la page du quiz, ouvre « Proposer une question » (une bonne réponse et trois mauvaises, 3 propositions en attente au maximum). Le staff la vérifie, et une question acceptée entre dans la banque et te rapporte 20 points. Une erreur dans une question ? Signale-la à l'équipe.\n` +
        `• Ce sont des points du site, sans valeur en argent. Tu peux te retirer des jeux à tout moment avec « Me retirer des jeux » sur la page Jeux.\n\n` +
        `Voir aussi : [url=/wiki/guide-roue-de-la-fortune]Tourner la roue de la fortune[/url], [url=/wiki/guide-plus-haut-plus-bas]Jouer à Plus haut ou plus bas[/url], [url=/wiki/guide-pronostics-lnh]Faire ses pronostics sur la LNH[/url].`,
    },
    {
      title: 'Faire ses pronostics sur la LNH',
      slug: 'guide-pronostics-lnh',
      keywords: 'pronostics, lnh, hockey, matchs, prédictions, vainqueur, série, journée parfaite, classement, jeux, gratuit',
      content:
        `Les [b]pronostics LNH[/b] sont un jeu gratuit de la section [url=/jeux]Jeux[/url] : choisis le vainqueur des matchs de la ligue avant leur début. Tu ne mises rien et tu ne perds rien.\n\n` +
        `[b]Comment jouer[/b]\n` +
        `1. Ouvre les pronostics depuis la page Jeux : les matchs du jour s'affichent, avec la fiche de chaque équipe (victoires, défaites, derniers matchs). Les onglets du haut donnent accès à hier et aux prochains jours.\n` +
        `2. Touche l'équipe que tu penses gagnante. Tu peux changer d'avis, ou retirer ton choix en touchant l'équipe de nouveau, jusqu'au début du match.\n` +
        `3. Une fois le match commencé, ton choix est verrouillé. Dès que la LNH publie le score final, le match est réglé automatiquement et tu reçois une notification si tu as gagné.\n` +
        `4. Un match reporté ou annulé est annulé : ton pronostic ne compte pas, pour ou contre toi.\n\n` +
        `[b]Les points[/b]\n` +
        `• Chaque bonne prédiction rapporte [b]5 points[/b].\n` +
        `• Chaque bonne prédiction de suite avant celle-ci ajoute [b]1 point[/b], jusqu'à +5 : une série de 6 bonnes prédictions rapporte 10 points la suivante. Une mauvaise prédiction remet la série à zéro (un match annulé ne la casse pas).\n` +
        `• Une [b]journée parfaite[/b] (au moins 3 matchs pronostiqués ce jour-là, tous gagnés) rapporte [b]20 points[/b] de plus.\n` +
        `• Les points des bonnes prédictions sont plafonnés à 60 par jour et 250 par semaine : ton plafond restant est indiqué sur la page.\n\n` +
        `[b]Classement et prix de la semaine[/b]\n` +
        `• Le classement de la semaine (du lundi au dimanche) range les membres par nombre de bonnes prédictions, puis par pourcentage de réussite.\n` +
        `• Chaque lundi matin, les [b]trois meilleurs de la semaine précédente[/b] (au moins 5 prédictions) reçoivent 100, 60 et 40 points, avec une notification.\n\n` +
        `[b]À savoir[/b]\n` +
        `• La barre sous chaque match montre comment les autres membres ont voté.\n` +
        `• Les résultats viennent de l'API publique de la LNH. Si elle ne répond plus, l'équipe peut régler ou annuler un match à la main.\n` +
        `• Pour parier sur les matchs du Canadien avec des points, voir [url=/wiki/guide-mise-o-jeu]Mise-O-jeu[/url]. Ce sont des points du site, sans valeur en argent. Tu peux te retirer des jeux à tout moment avec « Me retirer des jeux » sur la page Jeux.\n\n` +
        `Voir aussi : [url=/wiki/guide-quiz-quotidien]Jouer au quiz quotidien[/url], [url=/wiki/guide-roue-de-la-fortune]Tourner la roue de la fortune[/url].`,
    },
    {
      title: 'Jouer au blackjack',
      slug: 'guide-blackjack',
      keywords: 'blackjack, 21, cartes, croupier, doubler, séparer, jeu, jeux, mise, points',
      content:
        `Le [b]blackjack[/b] est un jeu de cartes de la section [url=/jeux]Jeux[/url] : bats le croupier en te rapprochant de 21 sans le dépasser.\n\n` +
        `[b]Comment jouer[/b]\n` +
        `1. Choisis ta mise (5 à 100 points) et clique sur [b]Distribuer[/b]. Tu peux aussi jouer ta [b]partie gratuite du jour[/b].\n` +
        `2. Tu reçois deux cartes ; le croupier en montre une et garde l'autre cachée. Les cartes de 2 à 10 valent leur chiffre, les figures valent 10 et l'as vaut 11 ou 1.\n` +
        `3. Clique sur [b]Carte[/b] pour en tirer une autre, ou sur [b]Rester[/b] quand tu es satisfait. Si tu dépasses 21, tu perds.\n` +
        `4. Quand tu restes, la carte cachée du croupier se retourne et il tire jusqu'à avoir au moins 17. Si tu es plus proche de 21 que lui (ou s'il dépasse 21), tu gagnes.\n\n` +
        `[b]Les gains[/b]\n` +
        `• Une victoire paie [b]le double de ta mise[/b] (ta mise te revient, plus un gain égal).\n` +
        `• Un [b]blackjack[/b] (un as et une carte de 10 sur les deux premières cartes) paie [b]3 pour 2[/b] : avec une mise de 10, tu reçois 25 points.\n` +
        `• En cas d'égalité, ta mise t'est rendue. Si le croupier a un blackjack et pas toi, la partie s'arrête tout de suite.\n\n` +
        `[b]Doubler et séparer[/b]\n` +
        `• [b]Doubler[/b] : sur tes deux premières cartes, tu mises une deuxième fois la même somme et tu reçois une seule carte de plus.\n` +
        `• [b]Séparer[/b] : avec deux cartes de même valeur, tu les joues comme deux mains, avec une mise chacune. Une seule séparation par partie ; un as séparé ne reçoit qu'une carte, et un 21 obtenu après séparation n'est pas un blackjack.\n` +
        `• Doubler et séparer demandent des points misables de plus.\n\n` +
        `[b]À savoir[/b]\n` +
        `• Les cartes sont tirées par le serveur dans un sabot de plusieurs jeux, jamais par ton navigateur, et la carte cachée du croupier ne t'est envoyée qu'à la fin.\n` +
        `• Une seule partie à la fois. Une partie abandonnée est jouée d'office après un moment : tu restes sur tes mains et le croupier joue.\n` +
        `• Les [b]points reçus par un don ne peuvent pas être misés[/b]. Il y a une limite de pertes par 24 heures et un gain maximal par partie. Gagner n'est jamais garanti.\n` +
        `• Tu peux te retirer des jeux à tout moment avec « Me retirer des jeux » sur la page Jeux. Ce sont des points du site, sans valeur en argent.\n\n` +
        `Voir aussi : [url=/wiki/guide-plus-haut-plus-bas]Jouer à Plus haut ou plus bas[/url], [url=/wiki/guide-machines-a-sous]Jouer aux machines à sous[/url].`,
    },
    {
      title: 'Jouer aux dés',
      slug: 'guide-des',
      keywords: 'dés, des, lancer, doubles, total, cote, jeu, jeux, mise, points, hasard',
      content:
        `Les [b]dés[/b] sont un jeu de hasard de la section [url=/jeux]Jeux[/url] : deux dés sont lancés et tu paries sur le résultat. Plus ton pari est rare, plus la cote est grande.\n\n` +
        `[b]Comment jouer[/b]\n` +
        `1. Choisis un pari : [b]Moins que[/b] un total, [b]Plus que[/b] un total, [b]Total exact[/b], ou [b]Doubles[/b] (les deux dés montrent le même chiffre). Sous le tapis, les totaux gagnants s'allument en vert.\n` +
        `2. Chaque pari affiche sa cote (par exemple ×2,28) et ses chances. Les paris rapides (Prudent, Équilibré, Audacieux, Gros lot) te donnent un point de départ.\n` +
        `3. Choisis ta mise (5 à 100 points) et clique sur [b]Lancer[/b]. Tu peux aussi jouer ton [b]lancer gratuit du jour[/b].\n` +
        `4. Si ton pari est gagnant, tu reçois ta mise multipliée par la cote ; sinon la mise est perdue.\n\n` +
        `[b]Les cotes[/b]\n` +
        `• Il y a 36 combinaisons possibles avec deux dés. Un total de 7 sort le plus souvent (6 combinaisons), un 2 ou un 12 presque jamais (1 combinaison) : la cote d'un total de 2 ou de 12 dépasse ×34.\n` +
        `• Les paris trop faciles, dont la cote serait sous ×1,10, ne sont pas proposés.\n\n` +
        `[b]À savoir[/b]\n` +
        `• Les dés sont lancés par le serveur, jamais par ton navigateur : l'animation ne fait que montrer le résultat. Gagner n'est jamais garanti.\n` +
        `• Les [b]points reçus par un don ne peuvent pas être misés[/b]. Il y a une limite de pertes par 24 heures et un gain maximal par lancer.\n` +
        `• La [b]remise de fidélité[/b] te rend chaque matin une part de tes pertes de la veille (tous les jeux contre la maison), avec une notification.\n` +
        `• Tu peux te retirer des jeux à tout moment avec « Me retirer des jeux » sur la page Jeux. Ce sont des points du site, sans valeur en argent.\n\n` +
        `Voir aussi : [url=/wiki/guide-blackjack]Jouer au blackjack[/url], [url=/wiki/guide-machines-a-sous]Jouer aux machines à sous[/url].`,
    },
    {
      title: 'Collectionner les cartes',
      slug: 'guide-cartes',
      keywords: 'cartes, cartes à collectionner, paquet, album, éclats, rare, légendaire, collection, jeux, gratuit',
      content:
        `Les [b]cartes à collectionner[/b] sont un jeu de la section [url=/jeux]Jeux[/url] : ouvre des paquets, retourne tes cartes et complète ton album. Il n'y a rien à miser : les paquets se gagnent.\n\n` +
        `[b]Comment obtenir des paquets[/b]\n` +
        `• [b]Un paquet gratuit par jour[/b] : clique sur « Réclamer le paquet du jour » (le compteur repart à minuit, heure de Montréal).\n` +
        `• Un [b]quiz du jour sans faute[/b], [b]sept jours de suite[/b] à la roue de la fortune et une [b]journée parfaite[/b] aux pronostics LNH rapportent chacun un paquet de plus.\n` +
        `• Les [b]défis[/b] (le bonus des trois défis du jour ou de la semaine) rapportent aussi des paquets.\n` +
        `• Les paquets ne s'achètent jamais avec des points.\n\n` +
        `[b]Ouvrir un paquet[/b]\n` +
        `1. Clique sur « Ouvrir un paquet », puis touche le paquet pour le déchirer.\n` +
        `2. Chaque paquet contient 3 cartes. Touche une carte pour la retourner, ou « Tout révéler ». La dernière carte est toujours au moins [b]rare[/b].\n` +
        `3. Les cartes sont tirées par le serveur, jamais par ton navigateur. Les chances de chaque rareté (commune, rare, épique, légendaire) sont affichées sur la page.\n` +
        `4. Une carte [b]légendaire[/b] est garantie au plus tard dans 30 paquets sans en avoir eu.\n\n` +
        `[b]L'album, les éclats et les récompenses[/b]\n` +
        `• L'album compte 4 séries : les équipes de la LNH (le Canadien est légendaire), le cinéma, la musique et Seeduction. Les cartes pas encore obtenues apparaissent en silhouette.\n` +
        `• Un [b]doublon[/b] devient des [b]éclats[/b] (5 pour une commune, jusqu'à 100 pour une légendaire). Avec assez d'éclats, tu peux [b]fabriquer[/b] une carte qui te manque : touche sa silhouette dans l'album.\n` +
        `• Compléter une série rapporte des points, une seule fois (400 pour les équipes de la LNH, 150 pour le cinéma et Seeduction, 100 pour la musique), et l'album entier 1 000 points de plus.\n` +
        `• Les cartes rares brillent : passe la souris dessus pour voir le reflet.\n\n` +
        `[b]À savoir[/b]\n` +
        `• Les cartes n'ont aucune valeur en argent et ne s'échangent pas : c'est une collection.\n` +
        `• Tu peux te retirer des jeux à tout moment avec « Me retirer des jeux » sur la page Jeux.\n\n` +
        `Voir aussi : [url=/wiki/guide-quiz-quotidien]Jouer au quiz quotidien[/url], [url=/wiki/guide-roue-de-la-fortune]Tourner la roue de la fortune[/url], [url=/wiki/guide-pronostics-lnh]Faire ses pronostics sur la LNH[/url].`,
    },
    {
      title: 'Les duels entre membres',
      slug: 'guide-duels',
      keywords: 'duels, duel, défier, adversaire, invitation, quiz, pronostics, défis, consolation, récompense, jeux, gratuit',
      content:
        `Un [b]duel[/b] est un défi amical entre deux membres sur une activité [b]gratuite[/b] : personne ne mise de points. Rendez-vous sur la page [url=/jeux/duels]Duels[/url] de la section Jeux.

` +
        `[b]Lancer un duel[/b]
` +
        `• Choisis un adversaire (tape son pseudo), une activité et une durée de 3 ou 7 jours, puis envoie l'invitation. Tu peux avoir quelques invitations en attente à la fois, et tu peux en annuler une tant qu'elle n'est pas acceptée.
` +
        `• Les activités possibles : le [b]quiz[/b] (qui répond juste au plus de questions), les [b]pronostics LNH[/b] (qui réussit le plus de pronostics) et les [b]défis[/b] (qui en réussit le plus).
` +
        `• Ton adversaire reçoit une notification ; il peut accepter ou refuser. Sans réponse, l'invitation expire après 2 jours.

` +
        `[b]Pendant le duel[/b]
` +
        `• Le duel commence [b]le lendemain[/b] de l'acceptation, pour que personne n'ait d'avance. Les scores se mettent à jour tout seuls pendant que vous jouez normalement : il n'y a rien de plus à faire.

` +
        `[b]À la fin[/b]
` +
        `• Le gagnant reçoit [b]20 points[/b]. Le perdant qui a joué reçoit [b]5 points de consolation[/b]. En cas d'égalité parfaite, chacun reçoit 10 points. Si personne n'a joué, il n'y a pas de points.
` +
        `• Les duels sont réglés automatiquement après la dernière journée (les pronostics attendent la fin des matchs).

` +
        `[b]À savoir[/b]
` +
        `• Pour éviter les échanges de points entre amis ou avec de faux comptes, un membre reçoit des points pour 3 duels par jour au maximum, et une même paire de membres n'est récompensée qu'une fois tous les 7 jours (le duel compte quand même dans tes victoires).
` +
        `• Les points sont ceux du site, sans valeur en argent. Tu peux te retirer des jeux à tout moment depuis la page Jeux.

` +
        `Voir aussi : [url=/wiki/guide-defis]Relever les défis[/url], [url=/wiki/guide-quiz-quotidien]Jouer au quiz quotidien[/url], [url=/wiki/guide-pronostics-lnh]Faire ses pronostics sur la LNH[/url], [url=/wiki/guide-classements]Les classements des jeux[/url].`,
    },
    {
      title: 'Les classements des jeux',
      slug: 'guide-classements',
      keywords: 'classements, classement, meilleurs, top, rang, quiz, pronostics, roue, défis, cartes, collectionneurs, jeux, gratuit',
      content:
        `La page [url=/jeux/classements]Classements[/url] (bouton « 🏆 Classements » sur la page Jeux) montre les meilleurs membres des jeux [b]gratuits[/b].

` +
        `[b]Les six classements[/b]
` +
        `• [b]Quiz : points de la semaine[/b] — les points gagnés au quiz quotidien, du lundi au dimanche.
` +
        `• [b]Quiz : jours de suite[/b] — la plus longue série de jours avec le quiz terminé en cours.
` +
        `• [b]Pronostics LNH[/b] — le nombre de bonnes prédictions de la semaine.
` +
        `• [b]Roue de la fortune : jours de suite[/b] — la série de jours où tu as tourné la roue.
` +
        `• [b]Défis réussis[/b] — les défis quotidiens et hebdomadaires réussis ces 30 derniers jours.
` +
        `• [b]Collectionneurs[/b] — le nombre de cartes différentes dans l'album.

` +
        `[b]Comment grimper[/b]
` +
        `• Fais le quiz chaque jour pour les points et la série, tourne la roue sans jamais sauter une journée, et fais tes pronostics avant le début des matchs.
` +
        `• Les défis et l'ouverture de paquets de cartes font monter les deux derniers classements.

` +
        `[b]À savoir[/b]
` +
        `• Chaque classement affiche le top 10 ; si tu n'y es pas, ton propre rang s'affiche en dessous. Ta ligne est surlignée quand tu y figures.
` +
        `• Une série de jours se garde si tu as joué aujourd'hui ou hier : joue aujourd'hui pour ne pas la perdre.
` +
        `• Aucun classement ne dépend de mises : ils ne comptent que les activités gratuites.

` +
        `Voir aussi : [url=/wiki/guide-defis]Relever les défis[/url], [url=/wiki/guide-quiz-quotidien]Jouer au quiz quotidien[/url], [url=/wiki/guide-cartes]Collectionner les cartes[/url].`,
    },
    {
      title: 'Relever les défis',
      slug: 'guide-defis',
      keywords: 'défis, défi quotidien, défi hebdomadaire, objectifs, bonus, série, récompenses, jeux, gratuit',
      content:
        `Les [b]défis[/b] sont de petits objectifs de la section [url=/jeux]Jeux[/url] : chaque défi réussi rapporte des points, et les réussir tous rapporte un bonus.\n\n` +
        `[b]Comment ça marche[/b]\n` +
        `• Chaque jour, tous les membres ont les [b]mêmes trois défis du jour[/b] : un facile, un moyen et un difficile. Ils changent à minuit, heure de Montréal.\n` +
        `• Chaque semaine (du lundi au dimanche), trois [b]défis de la semaine[/b] plus longs et mieux récompensés.\n` +
        `• Ta progression s'affiche sur la page des défis et se met à jour toute seule pendant que tu joues. Le bouton « Y aller » t'amène au bon jeu.\n\n` +
        `[b]Les récompenses[/b]\n` +
        `• Un défi réussi rapporte des [b]points[/b] tout de suite (de 5 à 25 points pour un défi du jour, de 25 à 70 pour un défi de la semaine), et parfois un paquet de cartes.\n` +
        `• Réussir les [b]trois défis du jour[/b] rapporte un bonus de 15 points et un [b]paquet de cartes[/b] ; les trois défis de la semaine, 60 points et 2 paquets.\n` +
        `• Chaque jour où tu réussis tous tes défis allonge ta [b]série[/b] 🔥.\n\n` +
        `[b]Ce qui compte[/b]\n` +
        `• Les défis portent sur des [b]activités gratuites[/b] : la roue de la fortune, le quiz quotidien, les pronostics LNH, les cartes à collectionner et les [b]parties gratuites du jour[/b] (machines à sous, Plus haut ou plus bas, blackjack, dés).\n` +
        `• Aucun défi ne te demande de miser des points, et les parties payantes ne comptent pas.\n` +
        `• « Jeux différents » compte les jeux que tu as essayés dans la période.\n\n` +
        `[b]À savoir[/b]\n` +
        `• Chaque défi n'est payé qu'une fois. Les récompenses sont des points du site, sans valeur en argent.\n` +
        `• Tu peux te retirer des jeux à tout moment avec « Me retirer des jeux » sur la page Jeux.\n\n` +
        `Voir aussi : [url=/wiki/guide-cartes]Collectionner les cartes[/url], [url=/wiki/guide-quiz-quotidien]Jouer au quiz quotidien[/url], [url=/wiki/guide-roue-de-la-fortune]Tourner la roue de la fortune[/url].`,
    },
    {
      title: 'Faire revivre un torrent mort (Réanimation)',
      slug: 'guide-reanimation',
      keywords: 'réanimation, torrent mort, 0 seeder, reseed, relancer, récompense, demander un reseed, je le relance',
      isFaq: true,
      content:
        `Un torrent sans seeder ne peut plus être téléchargé. En le relançant, tu rends service à tout le monde — et tu gagnes des points.\n\n` +
        `[b]Quand un torrent est-il « mort » ?[/b]\n` +
        `Quand il reste à 0 seeder pendant 48 heures (un court délai de grâce évite les fausses alertes).\n\n` +
        `[b]Étape 1 : trouver quoi relancer[/b]\n` +
        `Ouvre la page [b]Réanimation[/b] (menu). La pastille rouge indique combien de torrents sans seeder [b]tu[/b] as déjà téléchargés : tu en as peut-être encore les fichiers. Les lignes avec un cadre vert sont ceux que tu as téléchargés. Tu peux trier (plus téléchargés, morts depuis longtemps, plus gros, meilleure récompense), chercher, filtrer par catégorie.\n\n` +
        `[b]Étape 2 : relancer[/b]\n` +
        `1. Clique sur [b]« ⬇ Je le relance »[/b] : le .torrent est téléchargé.\n` +
        `2. Ouvre-le dans ton client en pointant vers le dossier où sont tes fichiers (si tu les as encore). Le client vérifie puis seede.\n` +
        `3. Laisse seeder : la récompense est confirmée quand un [b]autre membre finit de le télécharger[/b] grâce à toi (ou, à défaut, quand tu tiens le seed 72 heures).\n\n` +
        `[b]Étape 3 : ou demander de l'aide[/b]\n` +
        `Tu n'as plus les fichiers ? Le bouton [b]« 🔁 Demander un reseed »[/b] prévient (une fois par semaine par torrent) tous ceux qui l'ont déjà téléchargé.\n\n` +
        `[b]Combien ça rapporte ?[/b]\n` +
        `Un montant de points affiché sur chaque ligne, selon la taille et le temps passé mort (avec un plafond). Pas de récompense si tu seedais déjà le torrent juste avant sa mort. La page affiche aussi les [b]réanimateurs du mois[/b].\n\n` +
        `Référence : [url=/wiki/torrents-morts-et-reseed]Torrents morts et récompense de reseed[/url]. Utiliser les points : [url=/wiki/guide-points-bonus]Points bonus[/url].`,
    },
    {
      title: 'Faire une demande (bounty)',
      slug: 'guide-demandes',
      keywords: 'demande, requête, bounty, récompense, contenu manquant, épisode manquant, saison, faire une demande',
      content:
        `Tu cherches un film, une série, un album ou un logiciel qui n'est pas sur Seeduction ? Fais une demande : les membres peuvent y mettre des points bonus en récompense, et celui qui la remplit les gagne.\n\n` +
        `[b]Étape 1 : vérifier que ce n'est pas déjà là[/b]\n` +
        `Cherche dans [url=/browse]Parcourir[/url] (essaie un seul mot, sans l'année) : [url=/wiki/guide-trouver]Trouver ce que tu cherches[/url].\n\n` +
        `[b]Étape 2 : publier la demande[/b]\n` +
        `Ouvre la page [b]Demandes[/b] (menu) et crée une demande : titre précis (avec l'année), catégorie, et si possible la langue ou la qualité souhaitée. Tu peux y ajouter des points bonus de ta poche pour la rendre attractive (si ton profil famille t'y autorise).\n\n` +
        `[b]Raccourci : les épisodes ou saisons manquants[/b]\n` +
        `Dans la vue [b]Groupé[/b] d'une série, un lien [b]« faire une demande »[/b] apparaît à côté de chaque épisode manquant (la demande est pré-remplie, par exemple « Série S13E05 »), et pour une saison incomplète pour demander la saison complète.\n\n` +
        `[b]Étape 3 : suivre et remercier[/b]\n` +
        `Tu retrouves tes demandes dans [b]Mes demandes[/b]. Quand quelqu'un envoie le torrent et le lie à ta demande, tu es prévenu : n'oublie pas de le remercier avec un 👍.\n\n` +
        `[b]Remplir une demande (pour gagner les points)[/b]\n` +
        `Envoie le torrent demandé ([url=/wiki/guide-envoyer-premier-torrent]Envoyer ton premier torrent[/url]) puis lie-le à la demande : la récompense te revient.\n\n` +
        `Référence : [url=/wiki/demandes]Demandes (bounties)[/url].`,
    },
    {
      title: 'Le lecteur Seeduction : regarder sans attendre',
      slug: 'guide-lecteur',
      keywords: 'lecteur, desktop, vlc, regarder, streaming, installer, smartscreen, reprendre, ouvrir dans le lecteur',
      content:
        `Le lecteur Seeduction permet de [b]regarder un film ou une série pendant qu'il se télécharge[/b], sans limite de format. C'est un vrai client BitTorrent avec une copie de VLC incluse.\n\n` +
        `[b]Installer (une seule fois)[/b]\n` +
        `1. Ouvre la page [url=/player]Le lecteur Seeduction[/url] et télécharge l'installateur pour ton système.\n` +
        `2. Lance-le. Windows peut afficher un avertissement SmartScreen (logiciel récent) : clique sur « Informations complémentaires » puis « Exécuter quand même ».\n` +
        `3. L'installation inclut tout (VLC compris). Le logiciel se lance aussi avec Windows et reste dans la zone de notification.\n\n` +
        `[b]Regarder quelque chose[/b]\n` +
        `1. Ouvre la fiche d'un film ou d'une série.\n` +
        `2. Clique sur [b]🖥️ « Ouvrir dans le lecteur Seeduction »[/b].\n` +
        `3. Ton navigateur demande la permission d'ouvrir le logiciel : coche « Toujours autoriser » pour ne plus avoir à confirmer.\n` +
        `4. La lecture démarre pendant que le fichier se télécharge.\n\n` +
        `[b]Ce qui se passe en coulisses[/b]\n` +
        `• Le fichier est enregistré dans [b]Téléchargements/Seeduction[/b] (modifiable dans les paramètres du lecteur).\n` +
        `• Le torrent [b]continue de seeder après la lecture[/b] : il est soumis aux mêmes règles que n'importe quel client (ratio, 72 h ou ratio 1 : [url=/wiki/guide-ratio-seed]Garder un bon ratio[/url]).\n` +
        `• Fermer puis rouvrir le logiciel reprend tes sessions.\n` +
        `• Dans la fenêtre « Client Seeduction » (icône de la zone de notification) : progression, ouvrir le dossier, arrêter ou supprimer un fichier, limiter la vitesse. Un fichier dont le temps de partage n'est pas terminé ne peut pas être supprimé.\n\n` +
        `[b]Reprendre là où tu t'étais arrêté[/b]\n` +
        `Le bouton [b]▶ Reprendre[/b] repart quelques secondes avant ta dernière position. Pendant que tu regardes, ton statut affiche « 🎬 Regarde … » (jamais pour du contenu adulte). Voir [url=/wiki/reprise-et-statut-en-train-de-regarder]Reprise et statut[/url].\n\n` +
        `[b]Continuer à regarder (accueil)[/b]\n` +
        `• Sur l'accueil, la rangée [b]▶️ Continuer à regarder[/b] montre ce que tu as commencé sans finir : l'affiche (avec une barre de progression), le titre, l'épisode et où tu t'es arrêté. Clique sur l'affiche pour [b]reprendre[/b] directement dans le lecteur Seeduction ; clique sur le titre pour ouvrir la fiche ; le ✕ (au survol) retire le titre de la liste.\n` +
        `• Pour une série, une seule ligne : le dernier épisode vu. Quand tu as [b]fini[/b] un épisode (ou presque), la carte [b]Épisode suivant[/b] te propose le suivant s'il est déjà sur Seeduction (ou le premier de la saison suivante), dans la même qualité et la même langue si possible.\n` +
        `• Seul ce qui a été regardé dans le lecteur Seeduction compte ; le contenu adulte n'y apparaît jamais.\n\n` +
        `[b]Un pack avec beaucoup de fichiers[/b]\n` +
        `• La fenêtre « Quel fichier regarder ? » défile et ne montre que les vidéos (un bouton affiche aussi les images et sous-titres) ; au-delà de 8 fichiers, un champ [b]Filtrer[/b] (ex : S01E05) retrouve vite le bon épisode.\n\n` +
        `[b]Sous-titres partagés[/b]\n` +
        `• Sur la fiche d'un torrent vidéo (onglet Fichiers), le cadre [b]💬 Sous-titres[/b] liste les sous-titres envoyés par les membres, par langue : [b]⬇ .srt[/b] pour les télécharger, [b]＋ Ajouter des sous-titres[/b] pour partager les tiens (fichier .srt ou .vtt, 600 Ko au plus ; l'encodage est corrigé tout seul).\n` +
        `• Le [b]lecteur Seeduction[/b] les charge automatiquement quand tu regardes ce torrent : ils sont dans le menu Sous-titres de VLC (touche [b]V[/b] pour passer de l'un à l'autre, le français est préféré).\n` +
        `• Pour un pack de saison, choisis l'épisode (le fichier) auquel les sous-titres vont. [b]Synchronisation[/b] : si les sous-titres arrivent trop tôt ou trop tard, l'auteur (ou l'équipe) les décale de 0,5 s avec les boutons −0,5 s / +0,5 s, et tout le monde en profite, y compris dans le lecteur. Dans VLC, [b]G[/b] et [b]H[/b] règlent aussi le décalage pour toi seulement.\n` +
        `• Tu peux supprimer les tiens ; l'équipe peut retirer un sous-titre mauvais ou déplacé. Limites : 30 envois par jour, 8 sous-titres par langue et par fichier.\n\n` +
        `[b]Quand utiliser le lecteur ?[/b]\n` +
        `Pour regarder vite, sur un ordinateur de bureau. Pour des téléchargements en masse ou une seedbox, préfère un client classique ([url=/wiki/guide-telecharger]Télécharger un torrent[/url]).\n\n` +
        `Références : [url=/wiki/installer-le-lecteur]Installer le lecteur[/url], [url=/wiki/fonctionnement-du-lecteur]Comment fonctionne le lecteur[/url].`,
    },
    {
      title: 'Personnaliser le site : thèmes, affichages, infobulles',
      slug: 'guide-personnaliser',
      keywords: 'thème, couleur, accent, affichage, vue, grille, liste, compact, infobulle, info-bulle, préférences, profil, compte',
      content:
        `Tu peux adapter l'apparence de Seeduction à tes goûts. Tous ces réglages se trouvent dans [b]Profil > Compte[/b] et te suivent sur tous tes appareils.\n\n` +
        `[b]Décors de saison[/b]\n` +
        `À certaines dates, le site se met aux couleurs de la fête : [b]Saint-Valentin[/b] (cœurs et lettres d'amour), [b]Pâques[/b] (lapin, poussin, œufs et tulipes), [b]Saint-Jean-Baptiste[/b] (fleur de lys et feu de joie), [b]fête du Canada[/b] (feuilles d'érable et feux d'artifice), [b]Halloween[/b] (citrouilles, fantômes, chauves-souris) [b]Noël[/b] (sapin, bonhomme de neige, flocons) et le [b]Jour de l'An[/b] (champagne, confettis, horloge de minuit). Tu verras une guirlande et une mascotte en haut des pages, de petites icônes dans le menu et le forum, et des particules animées qui flottent à l'écran. Tout se règle dans la fenêtre [b]🎨[/b] en haut à droite, sous « Décors de saison » : [b]Complets[/b] (avec animations), [b]Sans animation[/b] ou [b]Désactivés[/b], et une case pour garder ou non les couleurs de l'événement. Le choix est mémorisé sur cet appareil, et les animations s'arrêtent d'elles-mêmes si ton appareil est réglé sur « réduire les animations ». Les dates sont réglées par les administrateurs (Admin > Événements).\n\n` +
        `[b]Compte à rebours du Jour de l'An et score des Canadiens[/b]\n` +
        `• Chaque année, une pastille [b]🎆[/b] apparaît en haut de page environ 30 jours avant minuit et compte les jours, les heures et les minutes jusqu'au 1er janvier. Dans les dernières 24 heures elle affiche aussi les secondes, les dix dernières secondes s'affichent en grand au milieu de l'écran, et à minuit pile : « Bonne année ! » et des confettis (avec les décors en mode « Complets »).\n` +
        `• Une pastille [b]🏒[/b] donne le score des [b]Canadiens de Montréal[/b] à chaque match : en direct (score, période et temps restant, avec « BUT ! » quand le Canadien marque), le résultat final ensuite, puis l'heure du prochain match. Les logos des deux équipes sont affichés ; sur téléphone la pastille a sa propre ligne, avec les logos et le score. Le chrono du match avance en direct, seconde par seconde. Clique dessus pour voir les tirs au but, la chaîne de télé, les 5 derniers résultats et les 3 prochains matchs. Les données viennent de la LNH et se mettent à jour toutes les 10 secondes pendant un match.\n` +
        `• La [b]sirène de but[/b] est [b]désactivée par défaut[/b]. Pour l'activer (elle retentit alors quand le Canadien marque, si ton navigateur l'autorise : il faut avoir cliqué sur la page au moins une fois), coche « Sirène quand le Canadien marque » soit dans la fenêtre du match (clique sur la pastille du score), soit dans la fenêtre [b]🎨[/b]. Tu peux aussi l'écouter depuis la fenêtre 🎨.\n` +
        `• Ces deux pastilles se masquent : le compte à rebours avec « Désactivés » dans les décors de saison, le score des Canadiens avec la case [b]Score des Canadiens en direct[/b] de la fenêtre 🎨. Les administrateurs peuvent aussi les couper pour tout le site (Admin > Événements > Autres animations).\n\n` +
        `[b]Thèmes et couleur d'accent[/b]\n` +
        `Choisis le thème (clair ou sombre, selon ceux proposés) et une couleur d'accent : elle colore les boutons et les éléments actifs. Voir [url=/wiki/themes-et-accents]Thèmes et couleurs d'accent[/url].\n\n` +
        `[b]Affichage des listes de torrents[/b]\n` +
        `Six façons de voir les torrents : [b]Liste[/b] (tableau complet), [b]Détails[/b] (grandes lignes avec affiche et synopsis), [b]Grille[/b] (cartes), [b]Affiches[/b] (grandes images), [b]Compact[/b] (une ligne fine) et [b]Groupé[/b] (une ligne par film ou série).\n` +
        `• Ton affichage par défaut se règle dans Profil > Compte (« Affichage des listes de torrents »).\n` +
        `• Les boutons en haut d'une liste changent l'affichage de cette page, dans ce navigateur.\n\n` +
        `[b]Icônes du haut de l'écran[/b]\n` +
        `En haut à droite, chaque icône ouvre un petit cadre qui reste toujours dans l'écran, même sur téléphone : 🎨 la couleur d'accent, 🌱 les seeds à terminer (le temps de seed restant de chaque torrent), 🔔 les notifications, ✉️ tes [b]messages privés[/b] récents (non lus en évidence, avec la présence de l'interlocuteur, « Tout marquer lu », « Nouveau message » et le lien « Voir tous mes messages ») et 👫 les [b]amis en ligne[/b] (leur statut, un bouton 💬 pour leur écrire, le rappel des demandes d'ami en attente et le lien « Voir tous mes amis »).\n\n` +
        `[b]Alléger l'accueil[/b]\n` +
        `Chaque section de la page d'accueil (calendrier freeleech, raccourcis, nouvelles, forum, classements, torrents populaires...) a une petite icône [b]−[/b] en haut à droite : un clic la réduit en une fine barre avec son nom, et un clic sur la barre (＋) la rouvre. Les boutons « Tout réduire » et « Tout afficher » en haut de l'accueil agissent sur toutes les sections d'un coup. Ton choix est mémorisé sur cet appareil.\n\n` +
        `[b]Infobulles des torrents[/b]\n` +
        `Au survol d'un titre ou d'une affiche, une infobulle montre le détail. 4 styles : [b]Affiche[/b], [b]Cinéma[/b], [b]Classique[/b], [b]Minimal[/b], ou aucune. Un aperçu de chacun est affiché dans Profil > Compte.\n\n` +
        `[b]Tags sous les titres[/b]\n` +
        `Sous chaque release, des pastilles résument l'essentiel : la date de sortie en premier, la langue ensuite, puis résolution, source, codec, et le codec audio à la fin. Pour une série, la saison et l'épisode sont indiqués.\n\n` +
        `[b]Vie privée et contenu adulte[/b]\n` +
        `Le contenu adulte est masqué par défaut. Tu peux l'activer (et régler qui peut t'écrire, ton statut…) : [url=/wiki/vie-privee]Vie privée[/url].\n\n` +
        `[b]Statut de présence[/b]\n` +
        `Clique sur ta carte (avatar + nom) en haut du menu pour choisir En ligne, Absent, Occupé ou Apparaître hors ligne, et écrire un petit message : [url=/wiki/statut-de-presence]Statut de présence[/url].`,
    },
    {
      title: 'Favoris, collections et « Ma liste »',
      slug: 'guide-favoris-collections',
      keywords: 'favoris, collection, ma liste, à télécharger plus tard, liste, étoile, organiser, watchlist',
      content:
        `Pour retrouver un torrent plus tard sans le chercher de nouveau, Seeduction propose trois outils.\n\n` +
        `[b]Ma liste et les favoris (★)[/b]\n` +
        `Sur la fiche d'un torrent, les boutons [b]★ Ma liste[/b] (et l'étoile des favoris) gardent le torrent de côté. Tu les retrouves dans le menu : [b]Favoris[/b]. C'est une liste rapide, idéale pour « à regarder plus tard ».\n\n` +
        `[b]Collections[/b]\n` +
        `Une collection est une liste thématique que tu organises toi-même : une saga, une sélection, des films à voir un soir… Sur une fiche, clique sur [b]« Collection »[/b] pour ajouter le torrent à l'une des tiennes (ou en créer une). Chaque collection a sa page, que tu peux partager.\n\n` +
        `[b]Pourquoi c'est utile[/b]\n` +
        `Tes favoris et tes collections servent aussi à te proposer des torrents qui te plaisent (« Tu pourrais aimer ») : plus tu les remplis, plus les suggestions sont pertinentes. Voir [url=/wiki/affichages-et-recommandations]Affichages et offres personnalisées[/url].\n\n` +
        `Référence : [url=/wiki/favoris-et-collections]Favoris et collections[/url].`,
    },
    {
      title: 'Alertes de recherche : être prévenu des nouveautés',
      slug: 'guide-alertes',
      keywords: 'alerte, alertes, recherche enregistrée, notification, nouveau torrent, prévenir, telegram, veille, série, épisode',
      isFaq: true,
      content:
        `Ne cherche plus chaque jour : laisse Seeduction te prévenir quand ce que tu attends arrive.\n` +
        `\n` +
        `[b]Créer une alerte[/b]\n` +
        `1. Dans [b]Parcourir[/b], fais ta recherche : des mots (« Dune 2024 »), une catégorie, une qualité, une langue, la taille… tous les filtres comptent.\n` +
        `2. Clique sur [b]🔔 Alerte[/b] (à côté des vues Liste / Grille). Le panneau te dit combien de torrents correspondent déjà ; tu seras prévenu des [i]prochains[/i].\n` +
        `3. Donne un nom si tu veux, choisis [b]la cloche du site[/b] et/ou [b]Telegram[/b], puis [b]Créer l'alerte[/b].\n` +
        `\n` +
        `[b]Comment tu es prévenu[/b]\n` +
        `• Toutes les 5 minutes, le site cherche les torrents apparus (ou approuvés) depuis la dernière vérification. Si un torrent correspond, une notification arrive dans la cloche, avec le lien du torrent. Plusieurs nouveautés de la même alerte sont regroupées.\n` +
        `• Par Telegram : relie d'abord ton compte sur la page [url=/wiki/guide-telegram]Telegram[/url] ; le robot t'envoie alors un message privé avec les liens.\n` +
        `• Le contenu adulte n'est signalé que si tu as activé cette option dans ton compte, comme dans Parcourir.\n` +
        `\n` +
        `[b]Gérer tes alertes[/b]\n` +
        `La page [b]Mes alertes[/b] (menu de ton compte) liste tes alertes : couper la cloche ou Telegram, [b]Voir les résultats[/b], [b]Vérifier maintenant[/b], mettre en pause ou supprimer. Tu peux en avoir 20. Les notifications d'alertes se règlent aussi dans la page Notifications (catégorie « Alertes de recherche »).\n` +
        `\n` +
        `[b]Astuces[/b]\n` +
        `• Plus l'alerte est précise (titre + qualité + langue), moins tu reçois de bruit.\n` +
        `• Une série : crée l'alerte avec son titre seulement, tu seras prévenu de chaque nouvel épisode.`,
    },
    {
      title: 'Badges et réalisations : tout ce qui se gagne',
      slug: 'guide-badges',
      keywords: 'badge, badges, réalisations, succès, progression, ancienneté, mentor, gardien, irréprochable, sous-titreur, hall of fame, rareté',
      isFaq: true,
      content:
        `Les badges récompensent ce que tu fais pour la communauté. Ils se gagnent tout seuls : rien à demander.\n` +
        `\n` +
        `[b]Où les voir[/b]\n` +
        `• [b]Mes réalisations[/b] (menu de ton compte) : tous les badges, ceux que tu as (avec la date), ta progression vers les autres (une barre et « 320 / 500 h »), et leur rareté (« 12 % des membres l'ont »). Les trois plus proches de l'obtention sont mis en avant.\n` +
        `• Sur un profil, la section Badges montre ceux d'un membre. Le [url=/hall-of-fame]Hall of Fame[/url] classe les membres les plus décorés.\n` +
        `\n` +
        `[b]Les familles de badges[/b]\n` +
        `• [b]📦 Envoi[/b] : premiers torrents approuvés (1, 10, 50).\n` +
        `• [b]🌾 Partage et seed[/b] : volume envoyé (500 Go, 2 To), ratio d'or (5,0), [b]heures de seed cumulées[/b] (Gardien : 500 h, Sentinelle : 5000 h), torrents dont le partage obligatoire est rempli (Bon élève : 25, Exemplaire : 100), et [b]Irréprochable[/b] (50 torrents terminés et aucun hit & run en cours).\n` +
        `• [b]🤝 Entraide[/b] : parrainer (3, 10 membres), [b]Mentor[/b] (3 parrainés devenus de vrais membres, au-delà du rang « Nouveau »), demandes comblées, [b]sous-titres partagés[/b] (5, 30).\n` +
        `• [b]💬 Communauté[/b] : messages du forum, commentaires sur des torrents, points bonus accumulés.\n` +
        `• [b]⏳ Ancienneté[/b] : 3 mois, 1 an, 2 ans, 3 ans.\n` +
        `\n` +
        `[b]Quand sont-ils attribués ?[/b]\n` +
        `Tout de suite après une action qui compte (torrent approuvé, sous-titres envoyés, message posté, parrainage…), et chaque nuit pour ce qui évolue seul (heures de seed, ancienneté, ratio). Tu reçois une notification pour chaque nouveau badge.\n` +
        `\n` +
        `[b]Astuces[/b]\n` +
        `• Les heures de seed comptent sur tous tes torrents terminés : garde-les en partage, c'est aussi bon pour ton ratio ([url=/wiki/guide-ratio-seed]Ratio et seed[/url]).\n` +
        `• Un hit & run en cours bloque « Irréprochable » ; il revient dès que tu l'as régularisé ([url=/wiki/guide-hit-and-run-reparer]Réparer un hit & run[/url]).`,
    },
    {
      title: 'Parrainage : inviter et être récompensé',
      slug: 'guide-parrainage',
      keywords: 'parrainage, invitation, inviter, code, lien, prime, points, invité, recruteur, mentor, quota',
      isFaq: true,
      content:
        `Inviter, c'est faire grandir Seeduction avec des gens de confiance, et être remercié quand ils s'installent.\n` +
        `\n` +
        `[b]Inviter quelqu'un[/b]\n` +
        `1. Ouvre [b]Parrainage[/b] (menu de ton compte) et clique sur [b]＋ Créer une invitation[/b] : le lien est copié, envoie-le à ton invité. Il est valable 7 jours et ne sert qu'une fois.\n` +
        `2. Le nombre d'invitations ouvertes en même temps dépend de ton rang (Power User : 2, Élite : 5, Vétéran : 10, plus celles des dons). Tu peux aussi en acheter dans la [url=/bonus]boutique bonus[/url]. Tu retires une invitation non utilisée avec 🗑️.\n` +
        `\n` +
        `[b]La prime de parrainage[/b]\n` +
        `• Quand ton invité devient un vrai membre (par défaut : [b]14 jours[/b] d'ancienneté et le rang [b]Membre[/b]), tu reçois des [b]points bonus[/b] (500 par défaut), une seule fois par invité. Tu es prévenu dans la cloche.\n` +
        `• Les conditions exactes sont affichées en haut de la page Parrainage. Tu peux recevoir au plus quelques primes par mois (5 par défaut) : les suivantes attendent le mois d'après.\n` +
        `• Pas de prime si l'invité utilise la même adresse IP que toi (comptes multiples), ni pour un code distribué par l'équipe.\n` +
        `\n` +
        `[b]Suivre tes invités[/b]\n` +
        `Le tableau montre pour chacun : date d'inscription, rang, ratio, volume envoyé, dernière visite, et où il en est (« encore 6 jours », « rang Membre à atteindre », « 🎁 prime reçue »). Tu restes responsable de la conduite de tes invités : [url=/wiki/guide-premiers-pas]aide-les à bien démarrer[/url] et partage-leur le [url=/wiki]Wiki[/url].\n` +
        `\n` +
        `[b]Badges liés[/b]\n` +
        `Recruteur (3 parrainés), Patriarche (10) et [b]Mentor[/b] (3 parrainés devenus de vrais membres) : voir [url=/wiki/guide-badges]Badges et réalisations[/url].`,
    },
    {
      title: 'Application installable et notifications push',
      slug: 'guide-notifications-push',
      keywords: 'application, installer, pwa, notifications, push, téléphone, android, iphone, ios, écran d\'accueil, cloche, alertes, appareil',
      isFaq: true,
      content:
        `Seeduction s'installe comme une application (téléphone, tablette, ordinateur) et peut te prévenir même quand le site est fermé.\n` +
        `\n` +
        `[b]Installer l'application[/b]\n` +
        `• [b]Android et ordinateur (Chrome, Edge)[/b] : va dans la cloche → Notifications → ⚙️ Préférences, puis clique sur [b]⬇ Installer l'application[/b] (ou utilise « Installer Seeduction » dans le menu du navigateur / l'icône dans la barre d'adresse).\n` +
        `• [b]iPhone et iPad (Safari)[/b] : touche [b]Partager[/b] puis [b]« Sur l'écran d'accueil »[/b]. C'est obligatoire pour recevoir des notifications sur iOS (version 16.4 ou plus).\n` +
        `• L'application s'ouvre sans barre d'adresse, avec raccourcis (Parcourir, Messages, Notifications) par un appui long sur l'icône.\n` +
        `\n` +
        `[b]Activer les notifications sur un appareil[/b]\n` +
        `1. Ouvre [b]Notifications → ⚙️ Préférences[/b], section [b]📲 Application et notifications push[/b].\n` +
        `2. Clique sur [b]🔔 Activer les notifications sur cet appareil[/b] et accepte la demande du navigateur.\n` +
        `3. [b]Envoyer un essai[/b] vérifie que tout fonctionne. Tu peux abonner jusqu'à 5 appareils (téléphone, ordinateur…) et les retirer un à un.\n` +
        `\n` +
        `[b]Qu'est-ce qui est envoyé ?[/b]\n` +
        `• Les mêmes notifications que la cloche, selon les catégories que tu as gardées : messages privés et mentions quand tu es hors ligne, buts du Canadien, torrents approuvés, [url=/wiki/guide-alertes]alertes de recherche[/url], réponses du support, nouvelles du site…\n` +
        `• Si le site est déjà ouvert devant toi, rien n'est affiché en double. Un clic sur la notification ouvre directement la bonne page.\n` +
        `• Les messages passent chiffrés par le service de notification de ton navigateur (Google, Mozilla, Apple ou Microsoft) ; le contenu reste court.\n` +
        `\n` +
        `[b]Si ça ne marche pas[/b]\n` +
        `• Notifications [b]bloquées[/b] : clique sur le cadenas à gauche de l'adresse, autorise les notifications pour Seeduction, puis réactive-les ici.\n` +
        `• Plus rien depuis un moment : coupe puis réactive les notifications sur l'appareil (le navigateur peut avoir renouvelé son abonnement).\n` +
        `• Chaque profil d'un compte famille a ses propres appareils abonnés.`,
    },
    {
      title: 'Lire tes statistiques et les classements',
      slug: 'guide-stats',
      keywords: 'statistiques, stats, classement, mon activité, mes seeds, top, records, ratio, graphique',
      content:
        `Seeduction te montre ta situation et celle du site de plusieurs façons.\n\n` +
        `[b]Pour toi[/b]\n` +
        `• L'[b]en-tête[/b] : ratio, upload, téléchargé, points bonus, ton différentiel (upload moins téléchargé), tes seeds 🌱 et tes hit & run.\n` +
        `• [b]📈 Mon activité[/b] (menu du compte) : tes torrents en seed, tes téléchargements en cours avec leur progression, l'historique de tes téléchargements et de tes envois.\n` +
        `• [b]🌱 Mes seeds[/b] : ce que tu seedes, depuis combien de temps, ton ratio sur chaque torrent, et l'état de ton obligation (terminée ✅, en cours ⏳, à relancer 🟠, hit & run 🔴).\n` +
        `• Ton profil : le graphique de l'évolution de ton ratio.\n\n` +
        `[b]Pour tout le site : la page Stats[/b]\n` +
        `Onglets Aperçu, Membres, Torrents, Communauté et Économie : classements (meilleurs ratios, plus gros uploadeurs, plus longs seeders…), torrents les plus populaires, santé du réseau, records et tendances sur 7, 30 ou 90 jours. Le ratio n'est classé que pour les membres qui ont téléchargé au moins 1 Go. Les classements se mettent à jour toutes les 5 minutes.\n\n` +
        `[b]Astuces[/b]\n` +
        `• Les torrents « les plus difficiles à obtenir » (un seul seeder) sont d'excellents candidats pour seeder et gagner des points.\n` +
        `• Le classement des plus assidus récompense la régularité.\n\n` +
        `Référence : [url=/wiki/statistiques-et-classements]Statistiques et classements[/url].`,
    },
    {
      title: 'Messenger : discuter, groupes, appels et GIF',
      slug: 'guide-messenger',
      keywords: 'messenger, chat, discussion, groupe, canal, appel, vidéo, message vocal, gif, sticker, ami, notification, épingler',
      content:
        `Le Messenger est la messagerie de Seeduction : discussions privées, groupes et canaux publics. Ce guide montre les gestes essentiels.\n\n` +
        `[b]Ouvrir le Messenger[/b]\n` +
        `Clique sur [b]Chat[/b] dans le menu : la liste de tes conversations est à gauche, en deux onglets : [b]Privées[/b] (1 à 1 et groupes) et [b]Publiques[/b] (canaux). Sur ordinateur, des [b]bulles[/b] sur le côté gauche du site, juste à droite du menu, te montrent tes conversations sur n'importe quelle page : les canaux publics d'abord, puis les conversations privées, avec leurs messages non lus. Un clic ouvre la conversation dans une fenêtre. Tu peux les désactiver dans Profil > Compte > « Bulles de discussion ». Passe la souris sur une bulle pour faire apparaître une petite [b]croix[/b] en haut à droite : elle retire la bulle sans fermer la conversation, et elle revient dès qu'un nouveau message arrive (le bouton « ↺ » en bas les réaffiche toutes). Les fenêtres de discussion se [b]déplacent[/b] (glisse l'en-tête vers la gauche ou la droite), s'[b]agrandissent[/b] avec 🗖 et le bouton ⤢ ouvre la conversation dans le grand chat. La pastille de couleur sur la photo indique le statut : vert en ligne, jaune absent, rouge occupé, gris hors ligne. La bulle de la conversation ouverte est entourée d'un cercle blanc et doré bien visible. Quand tu remontes dans une conversation, une [b]flèche ↓[/b] apparaît en bas à droite des messages : un clic te ramène au dernier message.\n\n` +
        `[b]Écrire à quelqu'un[/b]\n` +
        `Ouvre le profil du membre et clique sur le bouton de message, ou cherche-le dans le Messenger. Par défaut, tout le monde peut t'écrire ; tu peux réserver ça à tes amis dans Profil > Compte.\n\n` +
        `[b]Créer un groupe[/b]\n` +
        `Un groupe réunit jusqu'à 50 personnes de ta liste d'[b]amis[/b]. Donne-lui un nom et une image. Le créateur est propriétaire et peut nommer des administrateurs. Pour ajouter quelqu'un, il doit d'abord être ton ami (page [b]Amis[/b] ou bouton « Ajouter en ami » sur un profil).\n\n` +
        `[b]Envoyer plus que du texte[/b]\n` +
        `• Émojis, photos, [b]GIF animés[/b] (10 Mo max) et fichiers (20 Mo max) : trombone, copier-coller d'une image ou glisser-déposer.\n` +
        `• [b]Message vocal[/b] : bouton 🎤 quand le champ est vide (5 minutes maximum).\n` +
        `• Bouton 😀 : émojis, autocollants et GIF (recherche dans une grande bibliothèque).\n` +
        `• Bouton 🎬 : partager la fiche d'un torrent avec son affiche et ses seeders.\n` +
        `• @pseudo : mentionne quelqu'un (il est prévenu).\n\n` +
        `[b]Appeler[/b]\n` +
        `Dans une conversation privée, 📞 lance un appel audio et 🎥 un appel vidéo (si l'autre est en ligne). Tu peux couper ton micro, activer la caméra, partager ton écran.\n\n` +
        `[b]S'organiser[/b]\n` +
        `[b]Mise en forme, sondages, recherche et mentions[/b]\n` +
        `• [b]Mise en forme en direct[/b] : ce que tu écris s'affiche déjà mis en forme dans la zone de saisie, sans codes à lire. Sélectionne un mot puis clique sur le bouton [b]Aa[/b] à côté de la saisie : [b]B[/b] gras, [i]I[/i] italique, S barré, code, spoiler (un clic le révèle dans le message) ou citation. Raccourcis : Ctrl+B, Ctrl+I, Ctrl+Maj+X (barré) et Ctrl+E (code). Les habitués peuvent aussi taper les marqueurs (**gras**, *italique*, ~~barré~~, un mot entre accents graves, ||spoiler||) : ils se transforment dès que tu les refermes. Pour un bloc de code, tape trois accents graves avant et après le texte. Maj+Entrée fait un retour à la ligne, Entrée envoie.\n` +
        `• [b]Sondages[/b] : le bouton 📊 crée une question avec 2 à 8 choix (un ou plusieurs votes, durée facultative) ; chacun vote en un clic et peut changer d'avis, les résultats s'affichent en barres en direct, et l'auteur ou la modération peut le terminer. Dans un canal public, seule la modération en crée.\n` +
        `• [b]Transférer[/b] un message (menu ⋯) dans une autre conversation ; [b]recherche dans tous tes messages[/b] : tape 3 lettres ou plus dans la zone de recherche de la liste, un clic sur un résultat t'amène au message ; [b]aperçu des liens[/b] (titre et description, sans image) récupéré par le serveur, désactivable.\n` +
        `• [b]Présentation[/b] (🔔 de la liste, réglage de cet appareil) : bulles ou [b]lignes compactes[/b] (par défaut dans les canaux publics), taille du texte, avatars. Les pseudos du staff sont colorés avec une étiquette (ADMIN, MOD...) et les brouillons sont gardés même après un rechargement.\n` +
        `• [b]@pseudo[/b] : en tapant @ puis quelques lettres, une liste propose les membres ; la personne est notifiée (catégorie « Messages et mentions »). Ça marche aussi dans le [b]forum, les commentaires, les nouvelles et les suggestions[/b], où le @pseudo devient un lien vers le profil.\n\n` +
        `[b]Mettre un membre en sourdine, signaler, bannir[/b]\n` +
        `Le menu ⋯ d'un message ouvre trois actions. [b]🔇 Mettre en sourdine[/b] : pour la durée de ton choix, tu ne vois plus les messages de ce membre (il n'est pas prévenu) ; tu les réactives dans Profil > Compte > « Membres en sourdine ». [b]🚩 Signaler[/b] : le message part au staff avec ton motif. [b]🚫 Bannir du chat[/b] (modération) : raison, durée, ce canal ou tous les canaux ; le membre voit la raison et la date de fin. Dans le panneau ⓘ d'un canal, les membres en ligne sont classés par rang.\n\n` +
        `Le menu ⋯ d'une conversation permet de l'épingler, de la mettre en sourdine ou de l'archiver. Les messages importants peuvent être épinglés (25 maximum par conversation).\n\n` +
        `[b]Les canaux publics[/b]\n` +
        `Des salons ouverts à toute la communauté (« Général » est le principal). Lis le message du jour en haut du canal : il rappelle ses règles.\n\n` +
        `Référence complète : [url=/wiki/messenger]Messenger : discussions, groupes et canaux[/url].`,
    },
    {
      title: 'Telegram : rejoindre le groupe et relier ton compte',
      slug: 'guide-telegram',
      keywords: 'telegram, groupe, robot, bot, lier, compte, code, /lier, annonces, freeleech, chat, discussion',
      content:
        `Seeduction a un groupe Telegram : tu peux y discuter avec les autres membres et y recevoir les annonces du site. Ce guide explique comment le rejoindre et, si tu veux, relier ton compte pour que ton chat Telegram et le Messenger du site ne fassent qu'un.\n\n` +
        `[b]Rejoindre le groupe[/b]\n` +
        `Clique sur le [b]logo Telegram[/b] en haut du site (à côté des notifications), ou ouvre [b]Telegram[/b] dans le menu de ton compte (la tuile Telegram de l'accueil fonctionne aussi) : la page propose [b]Rejoindre sur Telegram[/b]. Le groupe est privé : le lien est réservé aux membres de Seeduction, ne le partage pas. L'équipe peut valider chaque entrée.\n\n` +
        `[b]Ce que tu reçois dans le groupe[/b]\n` +
        `• Les [b]nouvelles[/b] du site, le début de chaque [b]freeleech global[/b] et, si l'équipe l'a activé, les [b]nouveaux torrents[/b] (jamais le contenu adulte).\n` +
        `• Le chat : ce que tu écris dans le groupe peut apparaître dans le canal « Telegram » du Messenger, et inversement.\n\n` +
        `[b]Relier ton compte (facultatif)[/b]\n` +
        `Sans lien, tu lis et tu écris sur Telegram normalement, mais tes messages ne sont pas transmis au site. Avec le lien, ils arrivent dans le Messenger sous ton pseudo Seeduction, avec tes vrais droits (si tu es banni ou en mode lent, ça s'applique aussi).\n` +
        `1. Page [b]Telegram[/b] > [b]Générer mon code[/b] (valable 15 minutes, utilisable une seule fois).\n` +
        `2. Clique sur [b]Ouvrir Telegram et lier[/b] : le robot s'ouvre, appuie sur « Démarrer ». Ou envoie-lui toi-même en message privé : [b]/lier TONCODE[/b].\n` +
        `3. Le robot confirme « Compte lié ». La page se met à jour toute seule.\n` +
        `Tu peux aussi envoyer la commande dans le groupe : le robot supprime ton message pour ne pas montrer le code. Le plus discret reste le message privé.\n\n` +
        `[b]Ce qui est copié, ce qui ne l'est pas[/b]\n` +
        `• Copiés : texte, images (et GIF du site), réponses, modifications et suppressions.\n` +
        `• Pas copiés : fichiers, messages vocaux, vidéos et autocollants (le site indique seulement qu'il y en avait un).\n` +
        `• Un torrent adulte partagé dans le chat n'est jamais détaillé sur Telegram.\n\n` +
        `[b]Ta vie privée[/b]\n` +
        `Quand tu écris dans le canal « Telegram » du Messenger, ton message part dans le groupe Telegram, qui est un service extérieur à Seeduction. N'y écris rien que tu ne dirais pas dans un groupe. Ton pseudo Telegram n'est visible que de l'équipe (page d'administration), pas des autres membres du site. Tu peux retirer le lien à tout moment depuis la page Telegram.\n\n` +
        `[b]Ça ne marche pas ?[/b]\n` +
        `• « Code invalide ou expiré » : génère un nouveau code et envoie-le sans le modifier (il n'y a ni 0, ni O, ni 1, ni I, pour éviter les confusions).\n` +
        `• « Déjà lié à un autre compte » : ce compte Telegram est relié à un autre compte Seeduction. Demande à l'équipe de retirer l'ancien lien.\n` +
        `• Tes messages n'arrivent pas : vérifie que tu as bien relié ton compte, et lis la réponse du robot dans le groupe (mode lent, compte limité...).\n` +
        `• Le robot ne répond pas en privé : écris-lui d'abord /start depuis son profil.`,
    },
    {
      title: 'Suggestions : proposer une idée et voter',
      slug: 'guide-suggestions',
      keywords: 'suggestion, idée, amélioration, voter, vote, proposer, demande de fonctionnalité, retour, feedback, à l\'étude, planifiée',
      content:
        `La page [b]Suggestions[/b] (menu du haut) sert à améliorer Seeduction ensemble : un membre propose une idée, les autres votent. Plus une suggestion a de votes, plus elle monte dans la liste et plus elle a de chances d'être réalisée.\n\n` +
        `[b]Proposer une suggestion[/b]\n` +
        `1. Clique sur [b]+ Proposer une suggestion[/b].\n` +
        `2. Donne un titre court et clair, choisis la catégorie (site, torrents, messagerie, lecteur, communauté, bonus...) et explique ton idée : ce qui manque ou te gêne, comment l'améliorer, pourquoi ce serait utile aux autres.\n` +
        `3. Pendant que tu écris, le site te montre les [b]suggestions qui ressemblent à la tienne[/b] : si l'idée existe déjà, vote pour elle plutôt que d'en créer une nouvelle (les votes comptent plus quand ils sont regroupés).\n` +
        `Tu peux proposer 3 suggestions par jour et en avoir 15 en cours. Un [b]bug[/b] ? Utilise plutôt le forum « Bugs et problèmes » ou le [url=/wiki/guide-support]Support[/url].\n\n` +
        `[b]Voter[/b]\n` +
        `Clique sur le bouton ▲ à gauche d'une suggestion. Un compte = un vote, que tu peux retirer en recliquant. Ta propre suggestion compte pour un premier vote. Les votes sont fermés quand une suggestion est réalisée, refusée ou en doublon.\n\n` +
        `[b]Ce que deviennent les suggestions[/b]\n` +
        `• 💡 [b]Proposée[/b] : elle attend des votes. Une barre montre où elle en est.\n` +
        `• 🔎 [b]À l'étude[/b] : elle passe ici [b]toute seule[/b] quand elle atteint le nombre de votes réglé par les administrateurs (10 par défaut), et l'équipe est prévenue.\n` +
        `• 🗓️ [b]Planifiée[/b], 🛠️ [b]En cours[/b], ✅ [b]Réalisée[/b] : l'équipe la fait avancer, avec un message pour expliquer ce qui est prévu. Une suggestion planifiée ou en cours apparaît automatiquement dans la section [b]« À venir »[/b] de la page [url=/roadmap]Roadmap[/url], avec son nombre de votes, jusqu'à ce qu'elle soit réalisée : elle en disparaît alors toute seule et le changement se retrouve dans le journal des modifications.\n` +
        `• ⛔ [b]Refusée[/b] : l'équipe explique pourquoi.\n` +
        `• 🔁 [b]Doublon[/b] : elle est regroupée avec une autre suggestion, et [b]tes votes sont transférés[/b] sur celle-ci.\n` +
        `Tu reçois une [b]notification[/b] à chaque changement de statut d'une suggestion pour laquelle tu as voté (ou que tu as proposée), et quand quelqu'un commente la tienne.\n\n` +
        `[b]Commenter, modifier, supprimer[/b]\n` +
        `Sous chaque suggestion, tu peux ajouter un avis ou un cas d'usage. Tu peux modifier ta suggestion tant qu'elle est « proposée », et la supprimer tant qu'elle n'a ni vote des autres ni commentaire.\n\n` +
        `[b]Retrouver tes suggestions[/b]\n` +
        `Les filtres de la page permettent de ne voir que [b]mes suggestions[/b] ou celles [b]où j'ai voté[/b], de chercher par mot, de filtrer par catégorie et de trier par votes, nouveautés ou commentaires. L'onglet « Réalisées » montre ce qui a déjà été fait grâce à vous.`,
    },
    {
      title: 'Forum, nouvelles et commentaires',
      slug: 'guide-forum-nouvelles',
      keywords: 'forum, nouvelles, annonces, commentaires, réactions, sujet, répondre, éditeur, mise en forme, correction automatique',
      content:
        `Pour échanger avec la communauté et suivre l'actualité du site.\n\n` +
        `[b]Les nouvelles[/b]\n` +
        `La page [b]Nouvelles[/b] annonce ce qui change : 📯 nouveautés, 🆕 mises à jour, 🎉 événements, 🛠️ maintenances et ⚠️ informations importantes. Une pastille rouge dans le menu compte celles que tu n'as pas lues. Tu peux filtrer par type, chercher un mot, [b]réagir[/b] avec un émoji (une seule réaction par nouvelle) et [b]commenter[/b]. Détails : [url=/wiki/les-nouvelles]Les nouvelles[/url].\n\n` +
        `[b]Le forum[/b]\n` +
        `1. Ouvre [b]Forum[/b] dans le menu et choisis une catégorie, puis un forum.\n` +
        `2. Pour répondre, ouvre un sujet et écris dans la zone en bas. Pour lancer une discussion, clique sur le bouton de nouveau sujet.\n` +
        `3. Les sujets [b]épinglés[/b] en haut sont importants (règles, annonces). Un sujet [b]verrouillé[/b] n'accepte plus de réponses.\n` +
        `4. Dans un forum d'entraide (✅), l'auteur du sujet marque la réponse qui l'a aidé avec « C'est la solution » : le sujet devient [b]Résolu[/b]. Le bouton [b]🔔 Suivre[/b] te prévient de chaque réponse ; la pastille rouge de « Forums » compte les sujets non lus, et « ✓ Marquer comme lu » les efface. Certains forums sont réservés à un rang, aux uploaders, aux donateurs ou au 18+ : la page dit toujours pourquoi tu ne peux pas y écrire.\n\n` +
        `[b]Écrire avec l'éditeur[/b]\n` +
        `Tous les champs de texte (forum, commentaires, messages, nouvelles) utilisent le même éditeur : gras, italique, listes, citations, images. Le français est [b]corrigé pendant que tu écris[/b] (accents courants, majuscules, guillemets « », espace avant ? et !) : voir [url=/wiki/notes-merci-commentaires]Notes, Merci et commentaires[/url].\n\n` +
        `[b]Commenter un torrent[/b]\n` +
        `Sur la fiche, l'onglet [b]Commentaires[/b] sert à poser une question, signaler un souci avec le fichier ou remercier. Tu peux aussi noter (étoiles) et dire merci (👍).\n\n` +
        `[b]Bonnes manières[/b]\n` +
        `Respecte le [url=/wiki/reglement-general]règlement[/url]. Un message inapproprié ? Utilise le bouton de signalement ([url=/wiki/signaler-un-probleme]Signaler un problème[/url]) plutôt que de répondre.`,
    },
    {
      title: 'Rejoindre ou suivre une Team',
      slug: 'guide-teams',
      keywords: 'team, équipe, postuler, candidature, chef, officier, recrutement, release group',
      content:
        `Une team est un groupe de membres (souvent des releasers) avec un chef et des officiers. Ce guide montre comment en rejoindre une.\n\n` +
        `[b]Étape 1 : explorer les teams[/b]\n` +
        `Ouvre la page [b]Teams[/b] (menu) : chaque team affiche son chef, ses membres, son upload cumulé et si elle [b]recrute[/b].\n\n` +
        `[b]Étape 2 : postuler[/b]\n` +
        `1. Ouvre la page de la team et lis ce qu'elle attend de ses candidats.\n` +
        `2. Écris un message de présentation et envoie ta candidature.\n` +
        `3. Tu peux avoir 3 candidatures en attente et la retirer à tout moment. Tu es prévenu de la réponse.\n\n` +
        `[b]Règles à connaître[/b]\n` +
        `• Un compte ne peut appartenir qu'à [b]une seule team[/b] : quitte la tienne avant d'en rejoindre une autre.\n` +
        `• Le chef et ses officiers acceptent ou refusent les candidatures. Ta team s'affiche sur ton profil.\n\n` +
        `[b]Les teams détectées automatiquement[/b]\n` +
        `Quand une release est partagée, le site lit le nom de la team à la fin du titre (« …x264-TOXIC ») et crée sa page, sans propriétaire. Si tu en fais vraiment partie, ouvre la page de la team pour en demander la reprise. Dans la vue groupée, un badge d'équipe n'apparaît que si toutes les versions affichées viennent de la même.\n\n` +
        `Référence : [url=/wiki/teams]Teams[/url].`,
    },
    {
      title: 'Obtenir de l\'aide : wiki, chat Support et billets',
      slug: 'guide-support',
      keywords: 'aide, support, billet, ticket, assistant, contacter le staff, signaler, wiki, question, problème',
      isFaq: true,
      content:
        `Besoin d'un coup de main ? Voici comment obtenir une réponse le plus vite possible.\n\n` +
        `[b]1. Cherche dans le wiki (2 minutes)[/b]\n` +
        `La barre de recherche du [url=/wiki]wiki[/url] renvoie les articles les plus proches de ta question. Les [url=/wiki/guides]guides[/url] expliquent pas à pas les grandes fonctions. Beaucoup de réponses y sont déjà : ratio, hit & run, envoi, lecteur, compte…\n\n` +
        `[b]2. Pose ta question à l'assistant[/b]\n` +
        `Dans le Messenger, le canal [b]#Support[/b] est tenu par l'assistant Seeduction, qui répond tout de suite en s'appuyant sur le wiki. Sous sa réponse : « ✅ Ça règle mon problème » ou « 🙋 Demander l'aide de l'équipe ».\n\n` +
        `[b]3. Parle à l'équipe[/b]\n` +
        `Clique sur « Demander l'aide de l'équipe » (ou écris que tu veux parler à quelqu'un) : l'équipe est prévenue et te répond dans le canal.\n\n` +
        `[b]4. Ouvre un billet pour un suivi privé[/b]\n` +
        `Un billet est une conversation privée avec l'équipe. Choisis une catégorie, donne un titre clair et décris le problème avec le plus de détails possible (captures d'écran acceptées, 4 maximum). Tu es prévenu quand l'équipe répond. Une fois résolu, tu peux noter le support.\n\n` +
        `[b]Un bon message de support contient[/b]\n` +
        `• ce que tu essayais de faire, ce qui s'est passé, le message d'erreur exact ;\n` +
        `• le torrent concerné (lien) ;\n` +
        `• ton client torrent et sa version, ou l'outil utilisé (Sonarr, Prowlarr…) ;\n` +
        `• ce que tu as déjà essayé. Ne donne jamais ton mot de passe, ta passkey ni ta clé API.\n\n` +
        `[b]Signaler un contenu ou un membre[/b]\n` +
        `Utilise le bouton de signalement (sur un torrent, un message, un profil) : le staff est prévenu avec le lien et le motif ([url=/wiki/signaler-un-probleme]Signaler un problème[/url]).\n\n` +
        `Référence : [url=/wiki/support-chat-et-billets]Support : chat en direct et billets[/url].`,
    },
    {
      title: 'Sécuriser ton compte : 2FA, mot de passe, courriel',
      slug: 'guide-compte-securite',
      keywords: 'sécurité, 2fa, double authentification, totp, authenticator, codes de secours, mot de passe, courriel, passkey, clé api',
      isFaq: true,
      content:
        `Ton compte porte ton ratio, tes points et ta passkey : ça vaut la peine de le protéger. Compte 5 minutes.\n\n` +
        `[b]1. Choisir un bon mot de passe[/b]\n` +
        `Un mot de passe long et unique (une phrase). Ne le réutilise pas sur un autre site. Un gestionnaire de mots de passe aide beaucoup.\n\n` +
        `[b]2. Activer la double authentification (2FA)[/b]\n` +
        `1. Installe une application d'authentification (Google Authenticator, Authy, Microsoft Authenticator…).\n` +
        `2. Va dans [b]Profil > Sécurité[/b] et lance l'activation de la 2FA : un code QR s'affiche.\n` +
        `3. Scanne-le avec l'application, puis saisis le code à 6 chiffres qu'elle affiche pour valider.\n` +
        `4. [b]Garde précieusement les codes de secours[/b] affichés à l'activation (imprime-les ou mets-les dans ton gestionnaire) : ils te permettent de te reconnecter si tu perds ton téléphone. Le staff ne peut pas désactiver ta 2FA sans une procédure de vérification d'identité.\n\n` +
        `[b]3. Changer ton mot de passe ou ton courriel[/b]\n` +
        `Depuis Profil > Sécurité, il faut ton mot de passe actuel (et ton code 2FA) puis un code à 6 chiffres reçu par courriel. Pour un nouveau courriel, le code part vers la [i]nouvelle[/i] adresse et l'[i]ancienne[/i] reçoit une alerte. Un changement que tu n'as pas fait ? Préviens le staff tout de suite.\n\n` +
        `[b]4. Mot de passe oublié[/b]\n` +
        `Sur la page de connexion, « Mot de passe oublié » envoie un lien par courriel (usage unique, durée limitée).\n\n` +
        `[b]5. Protéger ta passkey et tes clés API[/b]\n` +
        `• Ta passkey est dans chaque fichier .torrent que tu télécharges : ne partage pas ces fichiers.\n` +
        `• Tes clés API (Profil > Développeur) permettent à des outils de télécharger en ton nom : donne-leur le minimum de portées, une clé par outil, et révoque celles que tu n'utilises plus ([url=/wiki/guide-api-et-cles]Comprendre l'API[/url]).\n\n` +
        `[b]6. Surveiller[/b]\n` +
        `Si tu vois des téléchargements que tu n'as pas faits (page Mon activité), change ton mot de passe, révoque tes clés et contacte le staff ([url=/wiki/guide-support]Obtenir de l'aide[/url]).\n\n` +
        `Référence : [url=/wiki/connexion-et-securite]Connexion, mot de passe oublié et 2FA[/url].`,
    },
    {
      title: 'Compte famille : profils et PIN',
      slug: 'guide-compte-famille',
      keywords: 'famille, profil, pin, enfant, parent, contrôle parental, droits, supervision, qui est-ce',
      content:
        `Le compte famille permet à plusieurs personnes d'utiliser Seeduction avec un seul compte, chacune avec son profil. Pratique pour des enfants, un conjoint ou des colocs, avec un contrôle parental.\n\n` +
        `[b]Activer et créer des profils[/b]\n` +
        `1. Dans le menu, clique sur [b]👨‍👩‍👧 Famille[/b] (visible depuis le profil principal).\n` +
        `2. Choisis un [b]PIN à 4 chiffres[/b] pour toi.\n` +
        `3. Crée jusqu'à 4 profils en tout (le tien compris) : nom, avatar, PIN.\n\n` +
        `[b]Utiliser les profils[/b]\n` +
        `À chaque connexion, après le mot de passe, l'écran [b]« Qui est-ce ? »[/b] demande le profil et son PIN. Pour changer de profil : [b]↔ Changer de profil[/b]. Après 5 PIN erronés, le profil est verrouillé 10 minutes.\n\n` +
        `[b]Régler les droits de chaque profil[/b]\n` +
        `Avec le bouton [b]🔑 Droits[/b], le profil principal décide pour chacun : contenu adulte, envoi de torrents, dépense des points, téléchargement, messagerie, commentaires et forum.\n\n` +
        `[b]Ce qui est commun et ce qui est personnel[/b]\n` +
        `• Commun : ratio, upload, seed, hit & run, passkey, points, invitations, mot de passe, 2FA, courriel, clés API (seul le profil principal y touche).\n` +
        `• Propre à chaque profil : messagerie et amis, favoris, collections, commentaires, notes, notifications, affichage et recommandations.\n\n` +
        `[b]Superviser[/b]\n` +
        `Le profil principal voit un journal d'activité (connexions, téléchargements, recherches, commentaires…) et peut lire les conversations de chaque profil. Préviens les membres de ta famille. Un profil peut être bloqué puis débloqué.\n\n` +
        `Référence : [url=/wiki/compte-famille]Compte famille : profils et codes PIN[/url].`,
    },
  ],
};
