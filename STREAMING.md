# Ouvrir dans le lecteur Seeduction (streaming sans client torrent)

Le bouton **🖥️ Ouvrir dans le lecteur Seeduction** sur la fiche d'un torrent lance la lecture directement sur le
PC du membre, sans qu'il ait besoin d'ouvrir manuellement un client BitTorrent — voir [desktop-player/](desktop-player/README.md)
pour le logiciel lui-même. Il n'apparaît que sur du contenu vidéo (Films, Séries, Animes, XXX... voir plus bas),
pas sur les catégories audio/logiciels/jeux/livres où « regarder » n'a pas de sens.

Il a remplacé un premier essai, **« ▶ Visualiser en ligne »** (lecture dans le navigateur, relayée par le NAS),
retiré du site : il était limité aux formats lisibles nativement par un `<video>` (`.mp4`/`.webm`), ratait donc la
plupart des releases actuelles en `.mkv`/x265, et chargeait le NAS pour rien alors que le lecteur desktop fait mieux
sur les deux plans. Le code de ce premier essai (`backend/src/stream/stream.service.ts` → `getFile()`, la route
`GET /api/stream/:torrentId`) reste dans le backend au cas où, mais n'est plus appelé par le site.

## Comment ça marche

Un navigateur ne peut pas rejoindre un swarm BitTorrent lui-même (il ne parle que WebRTC, les clients comme
qBittorrent ou Transmission ne parlent que TCP/uTP classique — les deux mondes ne se comprennent pas directement).
Le lecteur desktop est un vrai client BitTorrent (comme qBittorrent), sans cette limite :

1. Un clic sur le bouton demande au serveur un **jeton de lecture à usage unique** (`POST /api/stream/session`,
   `StreamService.createPlaySession`), puis ouvre `seeduction://stream/<jeton>` — un lien qui ouvre automatiquement
   le logiciel installé sur le PC du membre (comme un lien Zoom ou Spotify).
2. Le logiciel échange ce jeton contre le **même `.torrent` personnalisé** (announce Seeduction + passkey du
   membre) qu'un téléchargement classique (`GET /api/stream/session/:token`, à usage unique, expire après 2 min) —
   mais avec `?stream=1` ajouté à l'announce.
3. Il rejoint le swarm **directement depuis le PC du membre** (aucune charge sur le NAS), télécharge dans l'ordre
   uniquement le fichier demandé, le sert sur un petit serveur local, et lance **Seeduction VLC** (une copie de VLC
   incluse dans l'installateur — voir `desktop-player/scripts/fetch-vlc.js`) dessus.

Aucun format n'est restreint : VLC lit à peu près tout, y compris `.mkv` et x265/HEVC.

## Le ratio compte, pas le hit & run

Le `?stream=1` de l'announce (`viaStream` dans `TrackerService.announce`) fait que le téléchargement/envoi compte
normalement pour le ratio du membre, **mais** :

- **Aucun `Snatch` n'est créé** à la fin de la lecture : comme personne ne laisse le lecteur tourner pour seeder une
  fois la vidéo fermée, créer une obligation « hit & run » à chaque lecture punirait les membres pour rien.
- **`completedCount`** (« X complétés » sur la fiche) n'est **pas** incrémenté par une lecture menée à terme — un
  compteur séparé, **`streamCompletedCount`** (« X lectures complétées »), l'est à la place, pour ne pas fausser la
  statistique de popularité en téléchargement du torrent.
- Un `Snatch` **déjà existant** (un vrai téléchargement antérieur, pas régularisé) peut en revanche se régulariser
  grâce au temps de seed accumulé pendant une lecture — ça ne peut qu'aider le membre.

## Quelles catégories affichent le bouton

`frontend/src/pages/TorrentDetail.tsx` (`VIDEO_KINDS`) affiche le bouton quand le type de contenu de la catégorie
(`resolveContentKind`, avec repli sur la catégorie principale) est `FILM`, `SERIE`, `XXX` ou `DOCUMENT` — donc Films,
Séries, Animes (rangés en FILM/SERIE), XXX, et les formations/documentaires vidéo s'il y en a. Musique, logiciels,
jeux et livres n'ont pas ce bouton.

## Fichiers concernés

- `backend/src/stream/` — module NestJS (`StreamService` gère le client WebTorrent, le cache des sessions de
  lecture navigateur (dormant) et les jetons à usage unique du lecteur desktop ; `StreamController` expose les deux).
- `frontend/src/components/WatchOnlineButton.tsx` — bouton + sélecteur de fichier (réutilise la modale de bande-annonce).
- `frontend/nginx/site.conf.template` — bloc `location /api/stream/` dédié (tampon désactivé, délais longs), utile
  pour `POST /api/stream/session` comme pour l'ancien flux vidéo.
- `desktop-player/` — le logiciel lui-même (voir son propre README).

## Stockage

Le cache de lecture navigateur (dormant) est stocké dans `STREAM_STORAGE_DIR` (par défaut `./storage/stream-cache`
dans le conteneur backend) — un cache jetable, pas besoin de le sauvegarder. Le lecteur desktop, lui, télécharge
sur le PC du membre, jamais sur le NAS.
