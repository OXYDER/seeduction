import type { WikiSeedCategory } from './wiki-seed';

/**
 * Guides « partager des torrents » (envoi d'un torrent, noms et langues, fiches, envoi multiple depuis son client) et guides du staff.
 * IMPORTANT : comme tout le wiki (voir wiki-seed.ts), ces guides doivent rester à jour avec le site. Si le formulaire d'envoi, l'envoi multiple
 * (frontend/src/components/MemberImport.tsx, backend/src/importer/member-import.service.ts), les règles de langue (backend/src/common/utils/language.ts)
 * ou l'import du staff changent, mets ces articles à jour dans le même commit.
 */
export const GUIDES_SHARE: WikiSeedCategory = {
  name: 'Guides : partager des torrents',
  slug: 'guides-partager',
  icon: '📤',
  articles: [
    {
      title: 'Envoyer ton premier torrent',
      slug: 'guide-envoyer-premier-torrent',
      keywords: 'envoyer, upload, uploader, premier torrent, créer un torrent, nfo, mediainfo, catégorie, fiche, modération, anonyme',
      isFaq: true,
      content:
        `Partager un torrent est le meilleur moyen de faire monter ton ratio et de gagner des points. Ce guide te mène de la préparation à la publication.\n\n` +
        `[b]Avant de commencer[/b]\n` +
        `• Vérifie que le contenu n'est [b]pas déjà sur le site[/b] ([url=/browse]Parcourir[/url]) : un même torrent (même empreinte) est refusé, et une autre version (autre langue ou qualité) doit être clairement différente.\n` +
        `• Lis le [url=/wiki/reglement-general]règlement[/url].\n` +
        `• Prépare un fichier [b]NFO[/b] ou un rapport [b]MediaInfo[/b] : il est [b]obligatoire[/b] (il décrit la qualité, l'audio et les langues). Pour obtenir un MediaInfo : installe le logiciel MediaInfo, ouvre ta vidéo, choisis la vue « Texte », puis copie le rapport.\n\n` +
        `[b]Étape 1 : créer le fichier .torrent[/b]\n` +
        `Dans ton client (qBittorrent : Outils > Créateur de torrent), choisis le dossier ou le fichier à partager et valide. Tu n'as pas besoin de mettre l'adresse du tracker : Seeduction nettoie le fichier (trackers étrangers retirés, torrent privé) et te donnera le bon à utiliser après l'envoi.\n\n` +
        `[b]Étape 2 : ouvrir la page Envoyer[/b]\n` +
        `Menu > [b]Envoyer[/b], puis « Un seul torrent ». Le formulaire avance par étapes : les étapes suivantes se débloquent quand la précédente est terminée.\n\n` +
        `[b]Étape 3 : déposer le .torrent et le NFO[/b]\n` +
        `Dépose ton fichier .torrent et ajoute le NFO (fichier .nfo ou texte collé). Le site détecte tout seul ce qu'il peut : titre, qualité, langue d'après le nom et le MediaInfo, saison et épisode… Les valeurs trouvées s'affichent avec un « ✓ » que tu peux corriger.\n\n` +
        `[b]Étape 4 : choisir la catégorie[/b]\n` +
        `Choisis une [b]sous-catégorie[/b] précise (les grandes catégories ne sont que des regroupements). Pour un jeu, des boutons proposent la plateforme (Windows, Switch, PS5…).\n\n` +
        `[b]Étape 5 : choisir la fiche[/b]\n` +
        `Le site cherche la fiche du film, de la série, de l'album, du livre ou du jeu (affiche, synopsis, distribution). Clique sur la bonne, ou corrige la recherche. Détails : [url=/wiki/guide-fiches]Les fiches[/url].\n\n` +
        `[b]Étape 6 : vérifier la langue[/b]\n` +
        `La langue doit être exacte (VFQ, VFF, MULTI.VFQ, VOSTFR, VO…). Règles complètes : [url=/wiki/guide-nommer-releases]Bien nommer une release[/url].\n\n` +
        `[b]Étape 7 : description, étiquettes et envoi[/b]\n` +
        `Ajoute une description (elle peut être générée à partir de la fiche) et des tags si tu veux. L'option [b]Upload anonyme[/b] cache ton pseudo aux autres membres. Clique sur [b]Uploader[/b].\n\n` +
        `[b]Étape 8 : le plus important, remettre le torrent en seed[/b]\n` +
        `Après l'envoi, une bannière te l'explique : [b]télécharge le .torrent de Seeduction[/b] (il contient ta passkey) et ajoute-le à ton client en choisissant [b]le même dossier[/b] que tes fichiers. Le client vérifie les fichiers et se met à seeder. Sans seeder, personne ne peut télécharger ton torrent. Pour automatiser tout ça avec plusieurs torrents : [url=/wiki/guide-envoyer-plusieurs]Envoyer plusieurs torrents depuis ton client[/url].\n\n` +
        `[b]Étape 9 : la modération[/b]\n` +
        `Ton torrent est en attente de validation par le staff. Tous tes envois sont dans [url=/mes-envois]Mes envois[/url] (lien aussi en haut de la page Envoyer, et icône 📦 en haut de l'écran à côté des messages : une bulle rouge avec un nombre apparaît quand l'équipe te demande de corriger un torrent, et le menu « Envoyer » affiche la même bulle) : tu y vois leur état et tu peux ouvrir la fiche pour les corriger.\n` +
        `• [b]Modifier un torrent pas encore approuvé[/b] : ouvre sa fiche (depuis Mes envois, bouton « ✏️ Modifier ») puis « Modifier mon torrent » : nom, catégorie, langue, fiche, présentation, NFO...\n` +
        `• [b]Si l'équipe te demande une correction[/b] (pas de seed, erreur dans la description, mauvais NFO, mauvaise fiche...), tu reçois une notification avec les motifs et son message ; le torrent est mis en suspens. Corrige-le, puis clique sur [b]« J'ai corrigé : renvoyer en validation »[/b] sur sa fiche (tu peux laisser un petit message à l'équipe). Il revient alors dans la file de modération.\n` +
        `• [b]Torrent rejeté[/b] : le motif est affiché sur sa fiche et dans Mes envois. Une fois corrigé, il repart automatiquement en validation.\n` +
        `• Garde le torrent [b]en seed[/b] dans ton client : sans seeder, il ne peut pas être approuvé. Tu es prévenu de l'approbation (ou du rejet, avec le motif).\n\n` +
        `[b]Et après ?[/b]\n` +
        `Chaque membre qui le télécharge te fait gagner de l'upload ; les 👍 Merci te rapportent des points. Garde-le en seed.\n\n` +
        `Référence : [url=/wiki/envoyer-un-torrent]Envoyer un torrent[/url].`,
    },
    {
      title: 'Bien nommer et décrire une release : langues, qualité, NFO',
      slug: 'guide-nommer-releases',
      keywords: 'nom, nommage, langue, vfq, vff, vof, truefrench, multi, vf2, vostfr, vo, muet, résolution, source, codec, nfo, mediainfo, team, tags',
      isFaq: true,
      content:
        `Un bon nom et de bonnes informations aident tout le monde à trouver ta release, et accélèrent sa validation. Voici les règles, avec des exemples.\n\n` +
        `[b]La forme d'un bon nom de release[/b]\n` +
        `[code]Titre.Annee.LANGUE.Resolution.Source.Codec-TEAM[/code]\n` +
        `Exemples : [code]Dune.Part.Two.2024.MULTi.VFQ.1080p.WEB.H264-GRP[/code] ou [code]Ma.Serie.S02E05.FRENCH.1080p.WEB-GRP[/code]. Des points entre les mots, le nom de la team à la fin après un tiret. Pas d'extension de fichier (.mkv…) dans le titre : le site la retire.\n\n` +
        `[b]Noms de release standardisés[/b]\n` +
        `Un nom mal fait (« Sword Art Online MULTI 1080P - TARDiS ») dérange les listes. Quand le nom n'est pas conforme, le site attend que le [b]NFO / MediaInfo[/b] soit ajouté, puis propose sous le champ du nom des [b]noms standards[/b] construits d'après le nom, les [b]fichiers[/b] du torrent et le [b]NFO / MediaInfo[/b] : Titre.Année.S01E03.LANGUE.1080p.WEB.H265-TEAM (sans espaces ni accents, résolution en « p » minuscule, source WEB / BluRay, codec H264 / H265 pour un WEB et x264 / x265 pour un encodage). Une team écrite à la fin avec un point ou un espace (« …x264.GHT ») est reconnue et remise après un tiret (« …x264-GHT »), et une plage d'années comme (2014-2018) est gardée telle quelle. Le nom doit [b]toujours finir par une team[/b] (« -CHiLL ») : si elle est introuvable, le site met [b]-NoTaG[/b]. Si le nom est déjà correct avec toutes les informations (langue précise, résolution, source, codec, team, année ou saison / épisode), [b]aucun choix n'est proposé[/b]. Un clic sur « Utiliser » remplace le nom ; une proposition peut aussi ajouter le codec audio ou reprendre le titre de la fiche choisie. Ce qui n'a pas pu être lu (langue, source, codec, team) est indiqué : à toi de l'ajouter. Les propositions existent aussi dans « Modifier mon torrent » (et pour l'équipe). L'[b]import automatique[/b] applique lui-même le nom standard quand le nom d'origine est mal formé (l'ancien nom est noté dans le journal de l'import) ; tu peux le modifier ensuite sur la fiche.\n\n` +
        `[b]Les étiquettes de langue (obligatoires et précises)[/b]\n` +
        `• [b]Une seule piste audio française[/b] : VOF (version officielle), TRUEFRENCH ou VFF (France), VFI (internationale), VFB (belge), VFQ (québécoise).\n` +
        `• [b]Plusieurs langues avec une piste française[/b] : MULTI + la précision, obligatoire : MULTI.VFQ, MULTI.VFF, MULTI.VOF, MULTI.TRUEFRENCH, MULTI.VFI, MULTI.VFB. MULTI n'est valable que s'il y a une piste française.\n` +
        `• [b]VFF et VFQ dans le même fichier[/b] : MULTI.VF2.\n` +
        `• [b]Aucune piste française, avec sous-titres français complets[/b] : VOSTFR.\n` +
        `• [b]Version originale sans piste française ni sous-titres français[/b] (un film anglais ou japonais, par exemple) : VO.\n` +
        `• [b]Piste muette[/b] : MUET (MUET.VOSTFR avec sous-titres).\n\n` +
        `Le site lit la langue dans le nom et dans le MediaInfo. Il ne devine jamais d'après le nom de la team. S'il n'est pas sûr, la langue reste « ? » : choisis-la toi-même dans la liste.\n\n` +
        `[b]Résolution, source, codec, audio[/b]\n` +
        `• Résolution : 480p, 720p, 1080p, 2160p (4K).\n` +
        `• Source : WEB-DL, WEBRip, BluRay, Remux, HDTV, DVDRip, CAM…\n` +
        `• Codec vidéo : x264, x265 (HEVC), AV1…\n` +
        `• Audio : AAC, AC3, E-AC3, DTS, TrueHD, Atmos, Opus, FLAC pour la musique…\n` +
        `Ces informations sont lues dans le nom et dans le NFO / MediaInfo, et servent aux filtres de recherche.\n\n` +
        `[b]Séries : saison et épisode[/b]\n` +
        `Écris S01E02 (saison 1, épisode 2). Une saison complète : S01 ou « S01.COMPLETE ». Le site affiche « Saison 1 / Épisode 2 » sur la fiche.\n\n` +
        `[b]Le NFO ou le MediaInfo : obligatoire[/b]\n` +
        `Il décrit réellement ce que contient le fichier (pistes audio, langues, sous-titres, qualité). Pour un film : colle le rapport MediaInfo. Pour des logiciels ou jeux : le .nfo de la release. Un NFO illisible ou trop court (moins de 20 caractères) est refusé.\n\n` +
        `[b]Les erreurs les plus fréquentes[/b]\n` +
        `• « FRENCH » seul : trop vague, précise la variante (VFQ, VFF…).\n` +
        `• MULTI sans précision : écris MULTI.VFQ, MULTI.VFF…\n` +
        `• VOSTFR sans sous-titres français complets : utilise VO (ou corrige les sous-titres).\n` +
        `• Mauvaise sous-catégorie (un film dans « Séries », une scène adulte dans « Films »).\n` +
        `• Titre avec l'extension du fichier : le site l'efface, mais évite-le.\n\n` +
        `Référence complète : [url=/wiki/envoyer-un-torrent]Envoyer un torrent[/url]. Pour choisir la fiche : [url=/wiki/guide-fiches]Les fiches[/url].`,
    },
    {
      title: 'Les fiches : TMDB, Deezer, livres, jeux et ThePornDB',
      slug: 'guide-fiches',
      keywords: 'fiche, métadonnées, tmdb, deezer, rawg, google books, openlibrary, theporndb, xxx, studio, pack, scène, synopsis, pochette, affiche, modifier la fiche',
      content:
        `La fiche est la carte d'identité d'un torrent : affiche, synopsis, distribution, genres, date de sortie. Elle vient d'une base de données externe, choisie selon le type de contenu.\n\n` +
        `[b]D'où vient la fiche ?[/b]\n` +
        `• [b]Films et séries[/b] : TMDB.\n` +
        `• [b]Musique[/b] : Deezer. [b]Livres[/b] : Google Books et Open Library. [b]Jeux[/b] : RAWG.\n` +
        `• [b]Adulte (XXX)[/b] : ThePornDB (scènes, films et studios), si le site est configuré pour.\n\n` +
        `[b]Choisir la bonne fiche à l'envoi[/b]\n` +
        `1. Le site cherche automatiquement avec le titre du torrent. Les résultats s'affichent avec leur affiche.\n` +
        `2. Clique sur la bonne. Si la recherche ne trouve rien : corrige le titre (titre original, sans l'année), ou colle l'adresse de la fiche TMDB.\n` +
        `3. Pas de fiche qui convienne ? Choisis « Sans fiche » : le torrent est publié sans.\n\n` +
        `[b]Les sous-titres[/b]\n` +
        `Le site lit tout seul les [b]langues de sous-titres[/b] de ta release : les pistes « Text » du MediaInfo, les lignes « Sous-titres : … » d'un NFO texte, et à défaut le nom (VOSTFR = sous-titres français). Il regarde aussi la [b]liste des fichiers du torrent[/b] : des fichiers .srt, .ass, .sub, .idx ou .sup livrés à côté de la vidéo (« Film.French.srt », « Subs/2_English.srt », « Film.fr.forced.srt ») ajoutent leur langue, lue dans leur nom ou leur dossier ; un fichier de sous-titres dont la langue est introuvable est ignoré. Elles apparaissent sur la page du torrent (étiquette « Sous-titres ») et dans les étiquettes des listes, par exemple « ST FR·EN ». Un astérisque ou « forcés » indique des sous-titres forcés, « SDH » des sous-titres pour sourds et malentendants, « FR-CA » du français canadien. Les torrents déjà en ligne sont rattrapés automatiquement par lots. Une erreur ? « Modifier mon torrent » > « Sous-titres » (codes séparés par des virgules : FR, EN, FR forcés...).\n\n` +
        `[b]Un pack de plusieurs films[/b]\n` +
        `Ton torrent contient plusieurs films (une saga, une collection) ? Dans le générateur de description, clique sur [b]« 📦 Pack de plusieurs films »[/b] : les résultats ont maintenant une case à cocher. Coche chaque film (relance la recherche avec un autre titre pour en ajouter) ou clique sur [b]« ➕ Ajouter toute la saga »[/b] pour ajouter d'un coup tous les films de la saga du film choisi. Puis [b]« ✨ Générer la description du pack »[/b] : la description contient un sommaire et un bloc par film (affiche, date de sortie, genre, distribution, synopsis), rangés [b]par date de sortie[/b] quel que soit l'ordre où tu les as cochés, puis les informations du torrent une seule fois. L'étoile ★ désigne le film dont la fiche est rattachée au torrent (affiche et filtres) : par défaut le plus ancien. Douze films au maximum ; ensuite, tu peux tout modifier dans l'éditeur.\n\n` +
        `[b]Un pack d'un même studio (adulte)[/b]\n` +
        `Quand ta release contient plusieurs films ou scènes d'un même studio, ne choisis pas un film au hasard : dans les résultats ThePornDB, le [b]🏢 Studio[/b] est proposé en premier. Choisis-le : la release est rattachée au studio (avec son logo et sa description).\n\n` +
        `[b]Que fait le site tout seul ?[/b]\n` +
        `• Quand le résultat est clair (même titre et même année, ou même site, même jour et mêmes interprètes), il rattache la fiche tout seul. Sinon il te la propose.\n` +
        `• Pour une série déjà présente sur le site avec sa fiche, les nouveaux épisodes reprennent la même fiche.\n` +
        `• Il retient les choix déjà faits pour des releases qui ressemblent (même série, même film, même site).\n\n` +
        `[b]Les images[/b]\n` +
        `L'affiche et le fond sont enregistrés sur Seeduction, jamais lus chez un service externe. Elles sont [b]compressées automatiquement[/b] (redimensionnées et converties en WebP) : même une image très lourde est acceptée.\n\n` +
        `[b]Corriger une fiche après coup[/b]\n` +
        `Sur la fiche de ton torrent, le panneau [b]« Modifier mon torrent »[/b] (visible de toi et du staff) te permet de [b]tout corriger[/b], à tout moment, même après l'approbation : le nom, la catégorie, la langue, la fiche (changer ou retirer celle de TMDB, Deezer, livres, jeux...), la pochette, le synopsis, la description, l'année et la date de sortie, la résolution, la source, les codecs, le format, la saison et l'épisode, les genres, les mots-clés, le NFO / MediaInfo et l'envoi anonyme. Seuls le statut, le freeleech et le double upload restent réservés au staff. Quelques règles : l'adresse d'une pochette doit venir d'un téléversement sur Seeduction ; une catégorie pour adultes demande d'avoir activé le contenu adulte dans ton profil ; le NFO reste obligatoire. Un torrent [b]rejeté[/b] que tu corriges repart automatiquement en validation. Tu peux supprimer ton torrent tant qu'il est en attente ou rejeté ; une fois en ligne, demande son retrait au staff (Support). Toutes tes modifications sont inscrites dans le journal du staff : corrige librement tes erreurs, mais ne change pas un torrent en autre chose.\n\n` +
        `[b]Adulte[/b]\n` +
        `Le contenu adulte est masqué tant qu'un membre ne l'a pas activé ([url=/wiki/vie-privee]Vie privée[/url]).\n\n` +
        `Voir aussi : [url=/wiki/guide-envoyer-premier-torrent]Envoyer ton premier torrent[/url].`,
    },
    {
      title: 'Envoyer plusieurs torrents depuis ton client',
      slug: 'guide-envoyer-plusieurs',
      keywords: 'envoyer plusieurs, multi, lot, seedbox, qbittorrent, transmission, rutorrent, ftp, import, analyser, vert, orange, tous les reconnus, catégorie seeduction, remise en seed',
      isFaq: true,
      content:
        `Tu as des dizaines de releases dans ton qBittorrent, ton Transmission ou ton ruTorrent ? Plus besoin de les envoyer une par une : Seeduction lit ton client, reconnaît tes releases, et les remet en seed pour toi, sur les mêmes fichiers. Aucun dossier à choisir, donc aucune erreur possible.\n\n` +
        `[b]Ce qu'il faut avoir[/b]\n` +
        `• Un client torrent [b]joignable depuis Internet[/b] : en pratique une [b]seedbox[/b] (Appbox, Seedhost, Ultra.cc…) avec son interface web (qBittorrent 4.5 ou plus récent, Transmission ou ruTorrent). Un client chez toi, derrière ta box, n'est pas joignable : utilise l'envoi d'un seul torrent.\n` +
        `• Un [b]accès FTP[/b] à tes fichiers (obligatoire) : le site y lit le NFO de chaque release, sans rien télécharger d'autre. Idéalement un compte FTP en lecture seule.\n` +
        `• Un compte qui a le droit d'envoyer des torrents ([url=/wiki/guide-compte-famille]profil principal[/url]).\n\n` +
        `[b]Étape 1 : connecter ton client[/b]\n` +
        `1. Menu > [b]Envoyer[/b] puis [b]« Plusieurs torrents (depuis mon client) »[/b].\n` +
        `2. Choisis ton [b]client[/b] (qBittorrent, Transmission bêta ou ruTorrent bêta) et entre l'adresse de son interface web, ton identifiant et ton mot de passe. Pour ruTorrent, l'adresse ressemble à https://ton-hote/rutorrent.\n` +
        `3. Entre l'adresse, le port, l'identifiant et le mot de passe de ton [b]FTP[/b] (« FTP sur TLS » coché en général).\n` +
        `4. Facultatif : une catégorie (qBittorrent) ou une étiquette à analyser, pour ne regarder qu'une partie de ton client.\n` +
        `5. Clique sur [b]« Enregistrer et tester »[/b]. Un message confirme la connexion (« X torrents terminés · FTP : connexion réussie ») ou donne la raison de l'échec.\n\n` +
        `Tes mots de passe sont [b]chiffrés[/b] sur le serveur, jamais réaffichés ni visibles du staff. Le bouton « Supprimer mes accès » efface tout.\n\n` +
        `[b]Étape 2 : analyser[/b]\n` +
        `Clique sur [b]« Analyser mon client »[/b]. Le site liste tes releases terminées et tente de trouver, pour chacune : la catégorie, la fiche, la langue et le NFO. [b]Il ne modifie rien dans ton client à cette étape.[/b] Les torrents du client qui existent déjà sur Seeduction sont rangés à part.\n\n` +
        `[b]Étape 3 : vert, orange, rouge[/b]\n` +
        `• [b]✓ Reconnus (vert)[/b] : tout est sûr. La ligne est cochée d'office.\n` +
        `• [b]⚠ À corriger (orange)[/b] : il manque la catégorie, une fiche sûre ou le NFO. Corrige directement sur la carte : choisis la fiche proposée (ou cherche-la, ou colle l'adresse TMDB, ou « Sans fiche »), la catégorie, la langue, ou colle le NFO. Dès que tout est complet, la ligne passe en vert. Si une suggestion 💡 apparaît, un clic sur « Utiliser » la valide.\n` +
        `• [b]Déjà sur Seeduction[/b] : la même release existe : elle n'est pas envoyée.\n\n` +
        `Un bouton [b]🔄 Ré-analyser[/b] efface une ligne et la refait tout de suite (utile si le serveur FTP était en panne, ou après une amélioration du site).\n\n` +
        `[b]Étape 4 : choisir ce qui part[/b]\n` +
        `Décoche ce que tu ne veux pas envoyer, ou clique sur « Écarter » (les écartés ne sont plus proposés, et se retrouvent dans l'onglet « Écartés »). Seul ce qui est coché part.\n` +
        `• [b]🚀 Envoyer N torrents sur Seeduction[/b] : les lignes cochées (30 au maximum à la fois).\n` +
        `• [b]🚀 Tous les reconnus (N)[/b] : toutes les lignes vertes d'un coup, par lots enchaînés automatiquement, dans la limite de 100 par jour via ton client (le reste attend demain).\n\n` +
        `[b]Étape 5 : la remise en seed, automatique[/b]\n` +
        `Dès l'envoi, le site ajoute la version Seeduction dans [b]ton client[/b], sur les mêmes fichiers, avec la catégorie (ou l'étiquette) [b]« Seeduction »[/b] créée à ce moment-là (dans ton client, pas sur le tracker). Tes torrents d'origine ne sont jamais modifiés. Ton client vérifie les fichiers puis seede : la modération voit ainsi ton seed avant d'approuver. L'onglet [b]« Envoyés »[/b] suit chaque torrent (en seed, en attente de validation, approuvé, refusé). Le bouton « 🌱 Remettre en seed maintenant » force un nouvel essai si l'ajout a échoué.\n\n` +
        `[b]Étape 6 : la modération[/b]\n` +
        `Comme tout torrent de membre, il est validé par le staff. Tu es notifié à l'approbation. Si le staff refuse un torrent, retire-le de ton client.\n\n` +
        `[b]Ce que le site apprend avec le temps[/b]\n` +
        `Chaque torrent accepté par la modération ajoute du poids au choix fait (catégorie et fiche) pour ce genre de release. Dès le premier, le choix t'est suggéré en un clic ; après plusieurs acceptations par des membres différents, les releases qui ressemblent sont rangées toutes seules. Moins tu cherches, plus vite ça va.\n\n` +
        `[b]Transmission et ruTorrent (bêta)[/b]\n` +
        `Ces deux clients ne donnent pas le fichier .torrent d'un torrent existant : le site le lit sur ton FTP (dossier de configuration de Transmission, dossier de session de rTorrent). Leurs fichiers sont aussi re-vérifiés à l'ajout (plus long sur une grosse bibliothèque). Si quelque chose ne marche pas, un message l'explique : [url=/wiki/guide-envoi-multiple-depannage]dépannage[/url].\n\n` +
        `[b]Et la sécurité ?[/b]\n` +
        `• Seules les adresses accessibles depuis Internet sont acceptées : le site refuse les adresses privées (192.168.x.x, localhost…).\n` +
        `• Les .torrent d'origine peuvent venir d'autres trackers : le site retire leurs adresses et leur clé avant de publier. Vérifie toutefois les règles de ces trackers avant de repartager leurs contenus.\n\n` +
        `Référence : [url=/wiki/envoyer-plusieurs-torrents]Envoyer plusieurs torrents depuis mon client[/url].`,
    },
    {
      title: "Envoi multiple : dépannage",
      slug: 'guide-envoi-multiple-depannage',
      keywords: 'envoi multiple, erreur, ftp, connexion refusée, nfo introuvable, mediainfo, orange, torrent n\'apparaît pas, seedbox, qbittorrent, ruTorrent, transmission, dépannage',
      isFaq: true,
      content:
        `Un souci avec l'envoi de plusieurs torrents ? Voici les cas les plus fréquents et leur remède.\n\n` +
        `[b]« Adresse introuvable » ou « réseau privé »[/b]\n` +
        `L'adresse du client ou du FTP doit être accessible depuis Internet. Les adresses internes (192.168…, localhost, noms en .local) sont refusées par sécurité. Utilise l'adresse publique de ta seedbox.\n\n` +
        `[b]« Identifiant ou mot de passe incorrect »[/b]\n` +
        `Vérifie-les dans l'interface web de ton client. Attention : qBittorrent bannit une adresse après 5 mots de passe ratés : si tu vois « 403 », attends environ une heure ou redémarre l'application chez ton hébergeur.\n\n` +
        `[b]« FTP : connexion refusée / hôte introuvable »[/b]\n` +
        `Contrôle l'hôte, le port (souvent 21), l'identifiant, le mot de passe et la case « FTP sur TLS » (essaie de la décocher ou de la cocher). Un certificat non reconnu ? Coche « Accepter un certificat non reconnu ».\n\n` +
        `[b]Une release reste orange : « NFO / MediaInfo introuvable »[/b]\n` +
        `• Le site cherche le .nfo dans le dossier de la release, même très loin dans l'arborescence FTP. S'il n'y en a pas, il calcule le MediaInfo à partir du début (et de la fin, pour les MP4) de la plus grosse vidéo.\n` +
        `• Si ça échoue (format non pris en charge), colle toi-même le MediaInfo ou le NFO dans la zone prévue puis clique sur « Enregistrer le NFO ».\n` +
        `• Ton compte FTP voit-il bien le dossier des fichiers ? Le message d'erreur indique combien de dossiers ont été parcourus.\n` +
        `• Après avoir corrigé la cause, clique sur « 🔄 Ré-analyser » sur la carte.\n\n` +
        `[b]« Aucune fiche sûre »[/b]\n` +
        `Le titre ne correspond pas exactement à une fiche : choisis-la dans les suggestions, cherche avec un autre titre, colle l'adresse TMDB, ou « Sans fiche ». Pour un pack adulte : choisis le studio ([url=/wiki/guide-fiches]Les fiches[/url]).\n\n` +
        `[b]« Langue ? »[/b]\n` +
        `Le nom et le NFO ne disent pas la langue : choisis-la dans la liste (VFQ, MULTI.VFF, VOSTFR, VO…). Règles : [url=/wiki/guide-nommer-releases]Bien nommer une release[/url].\n\n` +
        `[b]Le torrent n'apparaît pas dans mon client après l'envoi[/b]\n` +
        `• Regarde le texte de la ligne dans l'onglet « Envoyés » : une erreur « seed : … » dit pourquoi l'ajout a échoué.\n` +
        `• Clique sur « 🌱 Remettre en seed maintenant ».\n` +
        `• Dans ruTorrent et Transmission, l'ajout peut mettre quelques minutes. Le torrent apparaît avec l'étiquette « Seeduction », puis le client vérifie les fichiers.\n` +
        `• Après un échec, le site attend 30 minutes avant de réessayer tout seul (pour ne pas faire bannir son adresse). « Remettre en seed maintenant » ou enregistrer à nouveau ta connexion relance tout de suite.\n\n` +
        `[b]« Transmission n'exporte pas le .torrent » / « .torrent introuvable sur le FTP »[/b]\n` +
        `Transmission et ruTorrent ne donnent pas le .torrent d'origine : le site le lit sur ton FTP. Le compte FTP doit pouvoir lire le dossier de configuration de Transmission (« torrents ») ou le dossier de session de rTorrent. Sur de nombreuses seedbox, c'est un dossier caché à la racine : vérifie son accès.\n\n` +
        `[b]« Limite de 100 torrents par jour »[/b]\n` +
        `Le reste de la liste attend demain : « 🚀 Tous les reconnus » reprendra là où il s'est arrêté.\n\n` +
        `[b]Analyse impossible : « Une opération est déjà en cours »[/b]\n` +
        `Patiente quelques instants. Deux analyses d'affilée sont séparées d'au moins une minute (sauf « Ré-analyser » une release).\n\n` +
        `[b]Je veux tout supprimer[/b]\n` +
        `« Supprimer mes accès » efface ta connexion, tes mots de passe et la liste d'analyse. Les torrents déjà publiés restent sur Seeduction.\n\n` +
        `Toujours bloqué ? Ouvre un billet au [url=/wiki/support-chat-et-billets]Support[/url] avec le message affiché (sans mots de passe) et ton client.\n\n` +
        `Guide principal : [url=/wiki/guide-envoyer-plusieurs]Envoyer plusieurs torrents depuis ton client[/url].`,
    },
  ],
};

export const GUIDES_STAFF: WikiSeedCategory = {
  name: 'Guides du staff',
  slug: 'guides-staff',
  icon: '🛡️',
  articles: [
    {
      title: 'Modérer : traiter la file des torrents',
      slug: 'guide-staff-moderation',
      keywords: 'modération, file, approuver, rejeter, torrents à valider, seeders, signalements, billets, modérateur, motif, freeleech, double upload',
      content:
        `Ce guide s'adresse aux modérateurs. Il décrit comment traiter la file des torrents à valider rapidement et équitablement. Les règles générales sont dans [url=/wiki/roles-du-staff]Rôles du staff[/url].\n\n` +
        `[b]Où se trouve la file ?[/b]\n` +
        `Menu [b]Modération[/b] (la pastille rouge compte ce qui attend). L'onglet « Torrents à valider » liste les torrents du plus ancien au plus récent, avec l'affiche, l'envoyeur, un extrait de description, la catégorie, la taille et le nombre de fichiers.\n\n` +
        `[b]Ce qu'il faut vérifier avant d'approuver[/b]\n` +
        `• [b]Un seeder est présent[/b] : un badge « 🌱 N seeders » s'affiche sur chaque ligne. Un torrent envoyé par un membre depuis son client est remis en seed dès l'envoi : vérifie qu'il y a bien un seeder avant d'approuver.\n` +
        `• Le nom suit les règles ([url=/wiki/guide-nommer-releases]langues, qualité[/url]) et la catégorie est la bonne.\n` +
        `• La fiche correspond au contenu, la pochette est bonne. Tu peux corriger via « Modifier ».\n` +
        `• Le NFO / MediaInfo est présent et cohérent avec ce qui est annoncé.\n` +
        `• Pas de doublon : une autre version est acceptable seulement si elle est clairement différente (langue, qualité).\n` +
        `• Rien d'interdit au [url=/wiki/reglement-general]règlement[/url].\n\n` +
        `[b]Ce que montre chaque torrent à valider[/b]\n` +
        `Chaque carte rassemble de quoi décider sans ouvrir la fiche : les [b]étiquettes[/b] de la release (date de sortie, langue, saison / épisode, qualité, source, codec, audio), la catégorie complète, la taille, le nombre de fichiers et la team ; des [b]contrôles automatiques[/b] (pochette, NFO / MediaInfo, langue renseignée, fiche rattachée, description, seeders) qui passent en orange quand il manque quelque chose ; l'[b]envoyeur[/b] (ancienneté du compte avec un ⚠ s'il date de moins de 7 jours, ratio, volumes, nombre de torrents approuvés et rejetés) ; les [b]doublons possibles[/b] (même fiche ou même nom, déjà en ligne ou aussi en attente) ; l'origine de l'envoi (envoi multiple depuis le client du membre, avec son contrôle vert ou orange). « Détails » déplie la description, le NFO et la liste des fichiers. L'accueil affiche le plus ancien torrent en attente avec les mêmes informations et un lien « Voir tout (N en attente) ».\n\n` +
        `[b]Suggestions des membres[/b]\n` +
        `La page [url=/wiki/guide-suggestions]Suggestions[/url] fonctionne avec des votes. En tant que modérateur tu fais avancer chaque suggestion (bloc « Équipe » en bas de la page de la suggestion, avec un éditeur pour mettre ta réponse en forme : gras, listes, liens, images) : à l'étude, planifiée, en cours, réalisée, refusée (une explication est obligatoire) ou doublon (choisis celle qui la remplace : les votes sont transférés sans double vote). L'auteur et tous ceux qui ont voté sont notifiés. Une suggestion qui atteint le seuil de votes passe seule « à l'étude » et le staff est prévenu ; les administrateurs règlent ce seuil avec « Changer le seuil » (2 à 500). Les administrateurs peuvent aussi ajouter une structure de forum de départ (Admin > Forum > « Ajouter les forums suggérés ») sans rien modifier de l'existant.\n\n` +
        `[b]Listes de membres (tuiles « La communauté »)[/b]\n` +
        `Sur l'accueil, les tuiles de « La communauté » sont cliquables pour l'équipe : [b]membres[/b] ouvre la liste de tous les comptes (recherche par pseudo, filtres par rôle et statut, tri par inscription, dernière visite, upload, téléchargement ou points ; clic sur un pseudo = profil et outils de modération), [b]en ligne[/b] liste les membres connectés en ce moment (rafraîchie toute seule ; ceux qui ont choisi « Apparaître hors ligne » y figurent, marqués « invisible », visibles de l'équipe seulement), [b]seeders[/b] liste les membres qui seedent avec le nombre de torrents, le volume et le dernier contact, et [b]échangés[/b] ouvre les statistiques. La tuile [b]torrents[/b] mène à la liste des torrents, ouverte à tous les membres, comme la tuile [b]Telegram[/b]. Pour les autres membres, les autres tuiles restent de simples compteurs.\n\n` +
        `[b]Torrents modifiés par leur envoyeur[/b]\n` +
        `Les envoyeurs corrigent eux-mêmes leurs torrents (nom, catégorie, langue, fiche, description, NFO, caractéristiques) ; chaque modification apparaît dans Admin > Journal (« Torrent modifié par son envoyeur »). Un torrent rejeté qui est corrigé repart dans la file de validation. Le statut, le freeleech et le double upload restent à toi.\n\n` +
        `[b]Voir les peers d'un torrent[/b]\n` +
        `Sur la fiche d'un torrent, l'onglet [b]Peers[/b] (visible de l'équipe seulement) liste chaque peer connu du tracker : le membre, son type (seeder ou leecher), son [b]client BitTorrent[/b] (reconnu d'après le peer_id : qBittorrent, Transmission, µTorrent...), son adresse IP et son port, sa progression, les volumes envoyés et reçus sur ce torrent, son ratio général et son dernier contact. Un [b]⚠[/b] rouge à côté d'une adresse signale qu'elle est utilisée par plusieurs membres sur ce torrent (comptes multiples ?). Le bouton « Actualiser » recharge la liste. Ces informations sont confidentielles : n'en fais pas état hors de l'équipe.\n\n` +
        `[b]Décider[/b]\n` +
        `• [b]✓ Approuver[/b] : le torrent devient visible, l'envoyeur est notifié. Tu peux approuver plusieurs torrents d'un coup (sélection).\n` +
        `• [b]✕ Rejeter[/b] : écris un motif clair, il est envoyé au membre. Un bon motif dit quoi corriger.\n` +
        `• [b]✏️ Modifier[/b] : corrige la catégorie, la fiche, la langue, le titre avant d'approuver, plutôt que de rejeter pour un détail.\n\n` +
        `[b]Sur la fiche d'un torrent[/b]\n` +
        `Une barre de modération (visible du staff) permet : approuver / rejeter / retirer, marquer mort, activer le [b]freeleech[/b] ou le [b]double upload[/b], modifier, et voir les signalements ouverts.\n\n` +
        `[b]Les signalements et les billets[/b]\n` +
        `Les onglets « Signalements » et « 🎫 Billets de support » regroupent le reste du travail. Réponds aux billets avec les réponses types, ajoute des notes internes, et assigne-les. Voir [url=/wiki/support-chat-et-billets]Support[/url].\n\n` +
        `[b]Bonnes pratiques[/b]\n` +
        `• Traite d'abord les plus anciens (ils sont marqués en retard).\n` +
        `• Sois cohérent d'une personne à l'autre : un motif de rejet précis évite les disputes.\n` +
        `• Pour un doute, demande l'avis d'un collègue plutôt que de laisser vieillir.`,
    },
    {
      title: 'Import automatique (Admin > Import)',
      slug: 'guide-staff-import',
      keywords: 'import, importer, qbittorrent, ftp, seedbox, robot, à vérifier, mémoire, interférence, source, administrateur, choix appris',
      content:
        `Ce guide s'adresse aux administrateurs. L'import automatique lit un qBittorrent (et son FTP), publie les releases terminées au nom du robot « Seeduction », les approuve et les remet en seed. Il utilise la même intelligence que l'envoi multiple des membres.\n\n` +
        `[b]Ajouter une source[/b]\n` +
        `Admin > Import > nouvelle source : l'adresse de l'interface web de qBittorrent (4.5 ou plus récent), l'identifiant et le mot de passe, la catégorie ou l'étiquette à surveiller, l'accès FTP (hôte, port, identifiant, mot de passe, TLS) et les réglages. Les mots de passe sont chiffrés. Le bouton « Tester » vérifie la connexion, le FTP et montre ce que le site comprend de quelques releases.\n\n` +
        `[b]Ce que fait le robot, passe après passe[/b]\n` +
        `Chaque passe (intervalle réglable) : pour chaque release terminée non traitée, le site détecte la catégorie (règles, nom, flux RSS, fiche TMDB), la fiche, la langue et lit le NFO (ou calcule le MediaInfo). Si tout est sûr, la release est publiée et approuvée, puis la version Seeduction est ajoutée au client sur les mêmes fichiers. Sinon elle va dans [b]« À vérifier »[/b].\n\n` +
        `[b]« À vérifier »[/b]\n` +
        `Pour chaque release non sûre : choisis la catégorie, cherche la fiche (TMDB pour les films et séries, ThePornDB pour l'adulte, Deezer, livres, RAWG), ou « Importer sans fiche », puis valide. La [b]langue[/b] affichée est lue dans le nom ET dans le NFO / MediaInfo (pistes audio) : si elle reste « langue ? », ni l'un ni l'autre ne la donne (un « MULTi » seul ne dit pas quelle version française) et tu la choisis dans la liste « Langue » de la carte (VO, VFF, VFQ, VOSTFR...), elle passe avant la détection. Les animés nommés « Titre.E19.MULTi.1080p… » (numéro d'épisode sans saison) sont reconnus comme des séries. Une case [b]« Se souvenir pour les releases qui ressemblent »[/b] (cochée par défaut) mémorise ton choix : la prochaine release de la même série, du même film ou du même site sera rangée toute seule.\n\n` +
        `[b]Comment la langue est trouvée[/b]\n` +
        `Le site cherche la langue par étapes, dans cet ordre : 1) les étiquettes du nom (VOF, VFF, VFQ, MULTI.VF2, VOSTFR...) ; 2) le [b].nfo[/b] ; 3) le [b]MediaInfo de la vidéo[/b], lu sur ta seedbox [b]même quand un .nfo existe[/b] mais ne décrit pas les pistes audio (le début du fichier seulement est lu) : une piste « French (Canada) » donne VFQ, deux pistes françaises MULTI.VF2, une piste sans langue est reconnue par son titre (« Français », « VFF »...) ; 4) en dernier recours seulement, un nom qui dit « FRENCH » sans variante devient [b]VFF[/b] et « MULTi » devient [b]MULTI.VFF[/b], selon la convention de nommage. Dans ce cas la langue est marquée [b](supposée)[/b] dans « À vérifier » et notée dans le journal : corrige-la sur la fiche si c'est en réalité du québécois, par exemple. Une contradiction (nom français mais pistes audio toutes dans une autre langue) ne donne jamais de langue inventée.\n` +
        `Le panneau [b]« 🔤 Langues manquantes »[/b] de l'onglet Import reprend les torrents déjà importés sans langue (import staff et envoi multiple des membres) avec ces mêmes étapes, en arrière-plan. Il ne modifie jamais une langue déjà renseignée ni un torrent envoyé à la main par un membre.\n\n` +
        `[b]Choix mémorisés et choix appris des membres[/b]\n` +
        `Le panneau « 🧠 Choix mémorisés » liste tes choix (avec « Retirer » si l'un est faux) et, dessous, ce que les membres ont appris au site : chaque torrent accepté ajoute du poids à un choix. Dès 1 : suggéré ; dès 3 acceptations par 2 membres différents (ou 6 d'un seul) : appliqué tout seul. Un désaccord n'applique rien. Ta mémoire de staff passe toujours avant. Retire tout choix qui te semble faux.\n\n` +
        `[b]Interférences[/b]\n` +
        `Si une release existe déjà sur Seeduction, elle n'est pas envoyée et apparaît en rouge en haut de la page (une notification est envoyée aux administrateurs). Résous-la (garde une version) puis « Retenter », ou « Ignorer ».\n\n` +
        `[b]Après la publication[/b]\n` +
        `Le torrent Seeduction est ajouté dans le client (catégorie « seeduction »). Surveille le robot : le panneau de statistiques du robot montre ses torrents, son upload et ses seeders.\n\n` +
        `[b]Bon à savoir[/b]\n` +
        `• Les noms perdent leur extension (.mkv…) ; l'import lit la langue seulement dans les étiquettes du nom et dans le MediaInfo / NFO, jamais d'après le nom de la team.\n` +
        `• La version de qBittorrent doit permettre l'export des .torrent (4.5+).\n` +
        `• Les membres ont leur propre version : [url=/wiki/guide-envoyer-plusieurs]Envoyer plusieurs torrents depuis ton client[/url].`,
    },
    {
      title: 'Santé du site et économie des points (staff)',
      slug: 'guide-staff-sante-economie',
      keywords: 'santé, monitoring, alertes, jwt, secret, économie, points, journal, gains, abus, staff, administration',
      content:
        `Deux écrans de l'administration aident à garder le site en bonne santé et l'économie des points sous contrôle.\n\n` +
        `[b]Santé du site (Admin > Monitoring)[/b]\n` +
        `• Le panneau du haut liste des contrôles avec une pastille : 🟢 normal, 🟠 à surveiller, 🔴 problème à régler. Il vérifie la base de données, la sécurité du secret des sessions, les tâches planifiées (pronostics, Mise-O-jeu, podium du quiz, remise de fidélité, parties abandonnées), l'API de la LNH, la mémoire, les erreurs serveur et l'envoi de courriels.\n` +
        `• Toutes les 5 minutes, le site se contrôle seul. Quand un problème apparaît, les administrateurs reçoivent une [b]notification système[/b] (elle ne peut pas être coupée dans les préférences) ; le même problème n'est rappelé qu'après 12 heures, et un message annonce son rétablissement. Tu peux désactiver ces alertes avec la case du panneau.\n` +
        `• Une tâche en échec affiche son message d'erreur. Si l'API de la LNH ne répond plus, règle ou annule les matchs à la main dans Admin > Jeux > Pronostics LNH.\n\n` +
        `[b]Sécurité des comptes et de la configuration[/b]\n` +
        `• Un membre [b]banni[/b], un compte désactivé ou une personne de l'équipe [b]rétrogradée[/b] perd ses droits en quelques secondes, même si sa session est encore ouverte (le rôle est relu dans la base, pas lu dans le jeton). Un changement de mot de passe [b]coupe toutes les sessions ouvertes avant lui[/b] : il faut se reconnecter.\n` +
        `• Le contrôle « Sécurité : configuration » du panneau de santé passe à l'orange si le mot de passe de la base (POSTGRES_PASSWORD) est resté à une valeur par défaut, ou si [b]CORS_ORIGIN[/b] n'est pas défini dans backend/.env : mets-y l'adresse de ton site (ex. https://seeduction.org). L'API a aussi un plafond général par adresse IP (1500 requêtes par minute, réglable avec API_RATE_LIMIT), qui ne gêne pas un usage normal.\n` +
        `• Admin > Monitoring contient aussi « Sécurité : connexions suspectes » : force brute, arrosage de comptes (une adresse qui essaie beaucoup de comptes), compte ciblé depuis plusieurs adresses, et connexion d'un membre de l'équipe depuis une adresse jamais vue. Les administrateurs sont notifiés (une fois par jour par constat). Le blocage d'une adresse se fait dans ton proxy. Dessous, la liste des infractions de la politique de sécurité du navigateur (CSP, en mode test) indique ce qui serait bloqué avant de la rendre obligatoire.
\n` +
        `[b]Compte complet d'un membre et réinitialisation obligatoire (administrateurs)[/b]\n` +
        `• Sur le profil d'un membre, le cadre [b]🔎 Compte complet[/b] liste ses téléchargements, ses envois, ses seeds et peers, ses hit & run, ses amis et ses messages du forum.\n` +
        `• Les onglets [b]Messagerie, Messages privés et Chat[/b] montrent le contenu des conversations : il faut saisir de nouveau ton mot de passe (et ton code 2FA), valable 15 minutes, seulement pour un membre de rang inférieur au tien. [b]Chaque déverrouillage et chaque page consultée sont inscrits dans le journal d'audit.[/b] N'utilise ces onglets que pour la modération (signalement, fraude, piratage) ; les membres sont informés de cette possibilité dans la page « Vie privée » du Wiki.\n` +
        `• Le bouton [b]🔑 Exiger la réinitialisation du mot de passe[/b] ferme tout de suite toutes les sessions du compte, envoie un courriel avec un lien (valable 24 h) et rend le compte inutilisable tant que le membre n'a pas choisi un nouveau mot de passe. Si le courriel n'est pas configuré, le lien s'affiche pour que tu le transmettes toi-même. « Lever la réinitialisation obligatoire » annule l'exigence sans toucher au mot de passe.\n\n` +
        `[b]Dons automatiques (Admin > Dons)[/b]\n` +
        `• Ko-fi et Buy Me a Coffee peuvent prévenir le site à chaque don. Dans Admin > Dons, « Dons automatiques » donne l'adresse à coller chez la plateforme et demande le jeton (Ko-fi) ou le secret de signature (Buy Me a Coffee). Les secrets ne sont jamais réaffichés.\n` +
        `• Le membre est reconnu par le pseudo écrit dans le message du don : « @pseudo », « pseudo : xyz », ou un message qui ne contient que le pseudo. Un pseudo noyé dans une phrase est seulement proposé : le don attend que tu l'attribues. Un paiement n'est jamais crédité deux fois.\n` +
        `• Un don dans une autre devise que celle du site, ou sans pseudo clair, attend dans la liste « Dons reçus » : écris le pseudo et clique « Attribuer ». Un remboursement te prévient mais ne retire pas les avantages. Tu peux couper le crédit automatique : tout attendra alors ton attribution.\n` +
        `• Le format de Buy Me a Coffee n'a pas pu être testé avec un vrai compte : fais un petit don d'essai après l'avoir branché et vérifie qu'il apparaît dans la liste.\n\n` +
        `[b]Courriel : lire et envoyer depuis le site (équipe)[/b]\n` +
        `• Le lien [b]📬 Courriel[/b] se trouve dans le [b]menu de ton compte[/b] (clique sur ton nom et ton avatar en haut du menu de gauche, avec une pastille de courriels non lus). Il n'apparaît que si une boîte a été configurée pour toi. C'est une boîte de réception complète : dossiers, recherche, pièces jointes, réponse, transfert, archivage et corbeille. Le site parle à ta boîte chez ton hébergeur (Purelymail, etc.) : rien n'est copié sur le site, tout reste chez l'hébergeur.\n` +
        `• Un [b]administrateur[/b] ajoute ses boîtes dans [b]Admin > Courriel[/b] : identifiant et mot de passe de la boîte (chiffré, jamais réaffiché), puis la liste des [b]alias[/b]. Un bouton [b]Tester la connexion[/b] vérifie la lecture et l'envoi. Il règle ses boîtes et choisit quels [b]membres de l'équipe[/b] (modérateurs, super-modérateurs, administrateurs) y ont accès : ils peuvent lire et écrire, mais seul celui qui a ajouté la boîte la règle. Personne ne voit les boîtes d'un autre sans autorisation.\n` +
        `• Pour écrire, tu utilises le [b]même éditeur que sur le reste du site[/b] : gras, couleurs, tailles, listes, citations, liens, emojis, et tu peux [b]coller ou glisser une image[/b] dans le message. Le courriel part en HTML avec une version texte. Les [b]suggestions d'adresses[/b] apparaissent en tapant dans À, Cc ou Cci (les gens déjà croisés dans la boîte). Tu peux glisser des fichiers sur la fenêtre pour les joindre (20 Mo au total). Tu choisis l'[b]alias expéditeur[/b] dans « De ».\n` +
        `• Le message est [b]enregistré automatiquement[/b] dans Brouillons toutes les 25 secondes ; fermer la fenêtre (Échap) le garde, et il se rouvre depuis le dossier Brouillons. Après [b]Envoyer[/b], tu as [b]10 secondes pour annuler[/b]. Ctrl+Entrée envoie, Ctrl+S enregistre.\n` +
        `• Dans la liste : cases à cocher pour [b]agir sur plusieurs courriels[/b] (lu, non lu, suivi, archiver, indésirable, supprimer, déplacer). Dans un courriel : imprimer (🖨️) et télécharger le message complet en [b].eml[/b]. [b]Raccourcis clavier[/b] (touche ? pour la liste) : j / k naviguer, Entrée ouvrir, x cocher, c écrire, r répondre, a répondre à tous, f transférer, e archiver, # supprimer, ! indésirable, u non lu, s suivi, / rechercher.\n` +
        `• Quand tu réponds, l'alias qui a reçu le courriel est choisi automatiquement. La colonne de gauche permet de [b]filtrer la réception par alias[/b]. Chez l'hébergeur, l'alias doit être autorisé à envoyer avec le compte de la boîte ; sinon l'envoi est refusé.\n` +
        `• Les courriels reçus sont [b]nettoyés[/b] avant d'être affichés : pas de scripts, liens limités à http, https et mailto, et les [b]images venant d'Internet sont bloquées[/b] (elles peuvent révéler que tu as lu le message) tant que tu ne cliques pas sur « Afficher les images ». Ne télécharge pas une pièce jointe inattendue.\n` +
        `• Chaque envoi est inscrit au journal d'audit (sans le contenu), et il y a une limite de 40 courriels par heure et par membre de l'équipe. Si tu changes le JWT_SECRET, les mots de passe des boîtes sont à ressaisir.\n\n` +
        `[b]Le secret des sessions (JWT_SECRET)[/b]\n` +
        `• Le fichier [b]backend/.env[/b] doit contenir un [b]JWT_SECRET[/b] long et aléatoire (au moins 24 caractères). S'il manque ou garde la valeur d'exemple, le panneau de santé le signale en rouge : n'importe qui pourrait alors fabriquer une session administrateur.\n` +
        `• Pour le changer : écris le nouveau secret dans backend/.env et redémarre le site. Tous les membres seront déconnectés, et les mots de passe de seedbox enregistrés et le jeton Telegram sont à ressaisir (ils sont chiffrés avec ce secret). Garde une copie du fichier .env : sans lui, une restauration ne pourrait pas relire ces données.\n\n` +
        `[b]Économie des points (Admin > Jeux)[/b]\n` +
        `• Chaque changement de points d'un membre est noté dans un journal central, regroupé par membre, source et heure (le journal garde 120 jours). Rien ne peut y échapper, même les points créés par du code non étiqueté : ils apparaissent dans « Autres ».\n` +
        `• L'écran affiche les [b]points créés[/b] par les sources gratuites (roue, quiz, pronostics, cartes, défis, remise de fidélité, buts du Canadien), le [b]résultat de la maison[/b] aux jeux (positif : le site gagne des points aux membres), le détail par source sur 24 heures, 7 jours et la période choisie, et un graphique par jour.\n` +
        `• Les [b]plus gros gagnants[/b] (24 heures et 7 jours) servent à repérer un abus possible, par exemple plusieurs comptes d'une même personne. Le partage de torrents, les dons et les échanges sont exclus de ce classement.\n` +
        `• Fixe un [b]seuil d'alerte[/b] (1 500 points par défaut) : si un membre le dépasse en 24 heures avec les jeux et les récompenses gratuites, la santé du site passe à 🟠 et les administrateurs sont prévenus. Mets 0 pour couper l'alerte.\n\n` +
        `Voir aussi : [url=/wiki/guide-staff-outils]Autres outils du staff[/url], [url=/wiki/fair-play-anti-triche]Fair-play et anti-triche[/url].`,
    },
    {
      title: 'Autres outils du staff',
      slug: 'guide-staff-outils',
      keywords: 'staff, administration, wiki, nouvelles, pot, catégories, invitations, support, réglages, admin',
      content:
        `Un tour d'horizon des outils du staff, avec les liens vers la documentation détaillée.\n\n` +
        `[b]Gérer le wiki et les guides[/b]\n` +
        `Admin > Wiki permet d'écrire et de corriger les articles. Le contenu de départ est dans le code du site : les articles non retouchés se mettent à jour tout seuls avec chaque nouvelle version. Un article que tu as modifié n'est plus écrasé. Les guides suivent la même logique et doivent rester à jour avec le site.\n\n` +
        `[b]Annoncer[/b]\n` +
        `Les [url=/wiki/les-nouvelles]Nouvelles[/url] servent à annoncer mises à jour, événements et maintenances (avec bannières automatiques).\n\n` +
        `[b]Catégories[/b]\n` +
        `Admin > Catégories : crée les sous-catégories (seuls les envois dans une sous-catégorie sont possibles), marque une catégorie « adulte » pour la masquer par défaut, ajoute des filtres propres à la catégorie.\n\n` +
        `[b]Points, pot commun et freeleech[/b]\n` +
        `Les prix de la boutique, la règle des hit & run, le [url=/wiki/pot-commun]pot commun[/url] (montants, paliers, durées) et les freeleech globaux se règlent dans Admin > Paramètres et Admin > Pot.\n\n` +
        `[b]Quiz quotidien et jeux[/b]\n` +
        `Admin > Jeux regroupe les réglages de chaque jeu et l'[url=/wiki/guide-staff-sante-economie]économie des points[/url]. Pour le quiz : valide ou refuse les [b]questions proposées par les membres[/b] (une question acceptée entre dans la banque et rapporte des points à son auteur), ajoute des questions en lot en collant des lignes « catégorie ; question ; bonne réponse ; trois mauvaises ; explication » (un bouton « Vérifier » montre le résultat sans rien écrire, les doublons sont écartés) et corrige ou désactive les questions de la banque. Les [b]duels entre membres[/b] ont leurs propres réglages (points, plafonds anti-abus) dans le même onglet.\n\n` +
        `[b]Invitations et rôles[/b]\n` +
        `Admin > Invitations crée des codes génériques. Les rôles et leurs droits sont décrits dans [url=/wiki/roles-du-staff]Rôles du staff[/url].\n\n` +
        `[b]Support[/b]\n` +
        `Le staff reçoit les demandes d'aide du canal Support et les billets : [url=/wiki/support-chat-et-billets]Support[/url]. Les réponses types, l'assistant et les délais se règlent dans Staff > Support.\n\n` +
        `[b]API et Torznab[/b]\n` +
        `Les membres brancheront leurs outils avec la page « API & flux RSS » : [url=/wiki/guide-api-et-cles]Comprendre l'API[/url]. Les clés sont individuelles et révocables.\n\n` +
        `[b]Quand tu changes le site[/b]\n` +
        `Chaque nouvelle fonction ou règle modifiée doit être reflétée dans le wiki et dans les guides concernés : c'est ce qui les garde fiables.`,
    },
    {
      title: 'Telegram : robot, groupe et pont avec le chat (Admin > Telegram)',
      slug: 'guide-staff-telegram',
      keywords: 'telegram, robot, bot, botfather, groupe, pont, canal, annonces, freeleech, jeton, lier, administration',
      content:
        `Ce guide s'adresse à toute l'équipe (modérateurs et plus : l'onglet [b]Admin > Telegram[/b] leur est ouvert). Il relie un groupe Telegram au chat du site et publie des annonces automatiques. Les membres voient la page [url=/wiki/guide-telegram]Telegram[/url] de leur compte.\n\n` +
        `[b]Comment ça marche[/b]\n` +
        `Un robot Telegram (créé avec @BotFather) est ajouté à ton groupe. Le site interroge lui-même Telegram toutes les quelques secondes : il n'y a rien à ouvrir sur le NAS, seulement l'accès sortant vers api.telegram.org. Le jeton du robot est chiffré en base et n'est jamais réaffiché.\n\n` +
        `[b]Mise en place (5 étapes)[/b]\n` +
        `1. Sur Telegram, écris à [b]@BotFather[/b] : /newbot, un nom, un identifiant qui finit par « bot ». Copie le [b]jeton[/b].\n` +
        `2. Toujours avec @BotFather : /setprivacy > ton robot > [b]Disable[/b]. Sans ça, le robot ne voit pas les messages ordinaires du groupe.\n` +
        `3. Crée le groupe (privé), ajoute le robot et nomme-le [b]administrateur[/b] (il doit pouvoir écrire et supprimer des messages). Le lien d'invitation peut demander ton approbation pour chaque entrée.\n` +
        `4. Admin > Telegram : colle le jeton, coche « Telegram activé », colle le lien d'invitation, enregistre. Écris un message dans le groupe : il apparaît dans la liste « Groupe Telegram » où tu le choisis. « Tester la connexion » envoie un message d'essai.\n` +
        `5. Pour le chat : coche « Relier le groupe à un canal » et choisis un canal ouvert à tous, ou clique « Créer le canal Telegram ».\n\n` +
        `[b]Le pont avec le chat[/b]\n` +
        `• Seuls les membres qui ont [b]lié leur compte[/b] sont recopiés sur le site : leurs messages arrivent sous leur vrai pseudo et suivent leurs vrais droits (bannissement, mode lent du canal). Les autres lisent et écrivent sur Telegram sans être transmis ; le robot le leur rappelle une fois.\n` +
        `• Dans l'autre sens, tout message écrit dans le canal relié part sur Telegram sous la forme « Pseudo : texte ». Garde donc un canal dédié.\n` +
        `• Réponses, modifications et suppressions suivent des deux côtés. Les fichiers et vocaux ne sont pas copiés. Un torrent adulte n'est jamais détaillé. Les images ne partent que si SITE_URL est en https.\n` +
        `• Le canal Support et les canaux réservés au staff ne peuvent pas être reliés.\n` +
        `• Un message de plus de 10 minutes (après une panne) n'est pas recopié. Les envois vers Telegram respectent sa limite d'environ 20 messages par minute et sont mis en file.\n\n` +
        `[b]Annonces automatiques[/b]\n` +
        `Nouvelles du site, début d'un freeleech global (programmé ou récompense du pot commun) et, en option, nouveaux torrents approuvés hors catégories adultes. Activer une annonce ne rejoue pas l'historique. Tu peux envoyer les annonces vers un autre groupe ou canal (l'identifiant numérique, robot administrateur).\n\n` +
        `[b]Comptes liés[/b]\n` +
        `Le tableau en bas liste les liens (pseudo du site, pseudo Telegram). « Retirer » coupe le lien d'un membre, par exemple si son compte Telegram a changé de main. Un membre banni ou désactivé n'est plus recopié.\n\n` +
        `[b]Dépannage[/b]\n` +
        `• « Non connecté » + « Jeton refusé » : jeton copié incomplet ou régénéré dans @BotFather.\n` +
        `• Le groupe n'apparaît pas dans la liste : écris [b]/id[/b] dans le groupe, le robot répond avec son identifiant (même sans pouvoir lire les messages) : colle-le dans la case « Identifiant du groupe ». Si tu as changé /setprivacy après avoir ajouté le robot, retire-le du groupe puis ajoute-le de nouveau. La ligne « Ce que Telegram a transmis au robot » indique combien d'événements sont réellement arrivés. Un groupe converti en supergroupe change d'identifiant.\n` +
        `• « Message d'essai refusé » : le robot n'est pas dans le groupe, ou n'a pas le droit d'écrire.\n` +
        `• Rien ne part du site vers Telegram : vérifie « Relier le groupe » et le canal choisi ; le dernier message d'erreur d'envoi s'affiche à côté de l'état.\n` +
        `• Après un changement de JWT_SECRET, le jeton est à ressaisir (il est chiffré avec).`,
    },
  ],
};
