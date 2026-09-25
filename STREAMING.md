# Visualiser en ligne (streaming sans client)

Le bouton **▶ Visualiser en ligne** sur la fiche d'un torrent lance la lecture directement dans le navigateur,
sans qu'un membre ait besoin d'installer ou de configurer un client BitTorrent.

## Comment ça marche

Un navigateur ne peut pas rejoindre un swarm BitTorrent lui-même (il ne parle que WebRTC, les clients comme
qBittorrent ou Transmission ne parlent que TCP/uTP classique — les deux mondes ne se comprennent pas directement).
Le NAS fait donc le pont :

1. Quand un membre clique sur « Visualiser en ligne », le **backend rejoint le swarm comme un peer normal**
   (`backend/src/stream/stream.service.ts`, via la librairie `webtorrent` en Node.js) — avec le **même** fichier
   `.torrent` personnalisé (announce Seeduction + passkey du membre) qu'un téléchargement classique. Le visionnage
   compte donc comme un peer normal pour le ratio et le suivi hit & run, exactement comme s'il avait téléchargé le
   fichier avec un client.
2. Il télécharge **uniquement le fichier demandé**, dans l'ordre (les autres fichiers d'un pack de plusieurs
   épisodes ne sont pas touchés).
3. Il relaie les octets au navigateur au fur et à mesure, via une requête HTTP à plages (`Range`) — le même
   mécanisme que n'importe quel site vidéo. Un `<video>` HTML peut donc jouer le fichier avant qu'il soit
   complètement téléchargé.
4. Si plusieurs membres regardent le même contenu en même temps, ils **partagent la même session de téléchargement**
   côté serveur (un seul swarm, pas un par spectateur).
5. Une session sans requête depuis 20 minutes est fermée automatiquement et son cache disque supprimé.

Aucun transcodage n'est fait : les octets du fichier sont relayés tels quels.

## Limite volontaire de cette version

**Seuls les fichiers déjà dans un format lisible nativement par un navigateur** peuvent être visualisés ainsi :
`.mp4`, `.m4v`, `.webm`, `.ogv` (liste dans `PLAYABLE_EXTENSIONS`, backend et frontend). Le bouton n'apparaît tout
simplement pas pour les autres formats — notamment **`.mkv` et le codec x265/HEVC, très répandus sur les releases
actuelles**, qu'aucun navigateur ne sait lire directement.

Étendre ça à n'importe quel torrent demanderait de transcoder à la volée avec `ffmpeg` (ré-encoder la vidéo en
direct), ce qui est beaucoup plus lourd pour le CPU du NAS — surtout avec plusieurs lectures simultanées ou du
contenu 4K. Ce n'est pas fait pour l'instant ; voir avec l'utilisateur avant de s'y lancer.

## Fichiers concernés

- `backend/src/stream/` — module NestJS (`StreamService` gère le client WebTorrent et le cache des sessions,
  `StreamController` sert le flux vidéo par plages).
- `frontend/src/components/WatchOnlineButton.tsx` — bouton + lecteur (réutilise la modale de bande-annonce).
- `frontend/src/lib/streaming.ts` / `backend/src/stream/stream.service.ts` (`PLAYABLE_EXTENSIONS`) — liste des
  extensions lisibles ; à garder identique des deux côtés.
- `frontend/nginx/site.conf.template` — bloc `location /api/stream/` dédié (tampon désactivé, délais longs) pour
  que le flux vidéo ne soit pas retardé ou coupé par nginx.

## Stockage

Le cache de lecture est stocké dans `STREAM_STORAGE_DIR` (par défaut `./storage/stream-cache` dans le conteneur
backend). C'est un cache jetable : il n'a pas besoin d'être sauvegardé, et peut être vidé sans risque.

## Authentification du flux vidéo

Une balise `<video>` fait une simple requête `GET` et ne peut pas envoyer l'en-tête `Authorization` du reste du
site. Le flux est donc identifié par la **passkey** du membre dans l'URL (`/api/stream/:torrentId?file=0&passkey=...`),
exactement comme les announces du tracker et les téléchargements de `.torrent` le font déjà.
