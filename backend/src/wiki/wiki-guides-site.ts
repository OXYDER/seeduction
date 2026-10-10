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
        `Ouvre un torrent depuis [url=/browse]Parcourir[/url] ou la recherche. En haut, tu vois la [b]langue[/b] (VFQ, VFF, MULTI, VOSTFR, VO…), la [b]résolution[/b], le [b]format[/b], l'audio, la [b]date de sortie[/b], le nombre de seeders, la taille. Les onglets [b]Fichiers[/b], [b]NFO[/b] et [b]Commentaires[/b] donnent le détail. Un torrent avec [b]0 seeder[/b] ne peut pas se télécharger tant que quelqu'un ne le relance pas : voir [url=/wiki/guide-reanimation]Faire revivre un torrent[/url].\n\n` +
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
        `[b]Thèmes et couleur d'accent[/b]\n` +
        `Choisis le thème (clair ou sombre, selon ceux proposés) et une couleur d'accent : elle colore les boutons et les éléments actifs. Voir [url=/wiki/themes-et-accents]Thèmes et couleurs d'accent[/url].\n\n` +
        `[b]Affichage des listes de torrents[/b]\n` +
        `Six façons de voir les torrents : [b]Liste[/b] (tableau complet), [b]Détails[/b] (grandes lignes avec affiche et synopsis), [b]Grille[/b] (cartes), [b]Affiches[/b] (grandes images), [b]Compact[/b] (une ligne fine) et [b]Groupé[/b] (une ligne par film ou série).\n` +
        `• Ton affichage par défaut se règle dans Profil > Compte (« Affichage des listes de torrents »).\n` +
        `• Les boutons en haut d'une liste changent l'affichage de cette page, dans ce navigateur.\n\n` +
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
        `Clique sur [b]Chat[/b] dans le menu : la liste de tes conversations est à gauche. Des bulles flottantes en bas à droite te permettent aussi de discuter depuis n'importe quelle page.\n\n` +
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
        `Le menu ⋯ d'une conversation permet de l'épingler, de la mettre en sourdine ou de l'archiver. Les messages importants peuvent être épinglés (25 maximum par conversation).\n\n` +
        `[b]Les canaux publics[/b]\n` +
        `Des salons ouverts à toute la communauté (« Général » est le principal). Lis le message du jour en haut du canal : il rappelle ses règles.\n\n` +
        `Référence complète : [url=/wiki/messenger]Messenger : discussions, groupes et canaux[/url].`,
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
        `3. Les sujets [b]épinglés[/b] en haut sont importants (règles, annonces). Un sujet [b]verrouillé[/b] n'accepte plus de réponses.\n\n` +
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
