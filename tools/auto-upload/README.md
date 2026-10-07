# De qBittorrent à Seeduction, automatiquement

Une fois installé (une seule fois), **tu n'as plus rien à faire** : dès qu'une release de ton qBittorrent est **terminée**, l'outil

1. récupère son `.torrent` dans qBittorrent ;
2. trouve son **NFO** : le fichier `.nfo` de la release, sinon un **MediaInfo** généré à partir du début de la vidéo (quelques Mo lus sur la seedbox, jamais le fichier entier) ;
3. l'envoie sur Seeduction : mêmes règles que le formulaire (NFO obligatoire, doublons refusés). **Si la clé API est celle d'un compte du staff, le torrent est approuvé directement** ; pour un autre membre, il attend la validation du staff ;
4. ajoute dans qBittorrent la version de Seeduction (avec ton passkey) **sur les mêmes fichiers**, sans revérifier : tu seedes aussi sur Seeduction ;
5. repasse toutes les 10 minutes, pour toujours. Chaque torrent n'est traité qu'une fois. Il ne supprime rien et ne déplace aucun fichier.

## Ce qui est automatique, et le seul geste qui reste

Il n'agit que sur les torrents d'une **catégorie qBittorrent** (par défaut `a-publier`) : c'est ton choix de ce qui part sur Seeduction, fait **une seule fois**, quand tu ajoutes la release dans qBittorrent
(fenêtre « Ajouter un torrent » > Catégorie). Ça évite de publier par erreur autre chose que tes releases.
Si ton qBittorrent ne contient que tes propres releases, tu peux supprimer la ligne `"qbitCategory"` de `config.json` : **tout** ce qui se termine est alors publié, sans aucun geste.

## Installation (une seule fois)

Il te faut :

- **Une clé API de ton site Seeduction** : Profil > Développeur, portées `torrents:upload` et `torrents:read` (affichée une seule fois). Utilise-la avec un compte du staff pour que les envois soient approuvés automatiquement.
- **Tes accès Appbox** (dans AppBox Manager) : identifiant et mot de passe de l'interface web de qBittorrent, et ceux du **FTP** (application Pure-FTPd, `ftp.<ton-compte>.appboxes.co`).
- **qBittorrent 4.5 ou plus récent** (le tien est en 5.x : parfait).

Choisis **où l'outil tourne** (il doit être allumé en permanence pour être automatique) :

### Option 1 — sur ton NAS, avec Docker (recommandé : il est toujours allumé)

Ton dépôt est déjà sur le NAS (`git pull`). Dans `tools/auto-upload` :

```bash
cp cles.exemple.env cles.env && nano cles.env             # tes clés (clé Seeduction, qBittorrent, FTP)
cp config.appbox.example.json config.json && nano config.json   # l'adresse de ton qBittorrent et de ton FTP, tes catégories
docker compose up -d
docker compose logs -f                                    # pour voir ce qu'il fait
```

Il redémarre tout seul avec le NAS. MediaInfo et le module FTP s'installent au premier démarrage.

### Option 2 — sur ton PC Windows (il faut que le PC reste allumé)

1. Installe **Node.js** (version LTS) : https://nodejs.org et **MediaInfo en ligne de commande** : https://mediaarea.net/fr/MediaInfo/Download (version « CLI »).
2. Copie `cles.exemple.bat` en `cles.bat`, ouvre-le avec le Bloc-notes et remplis tes clés.
3. Double-clique **`1-voir-la-source.bat`** : il crée `config.json`. Adapte-le (adresse de qBittorrent, hôte FTP, catégories du site : `0-voir-mes-categories.bat` les liste).
4. `1-voir-la-source.bat` de nouveau : il liste tes releases de `a-publier` et dit, pour chacune, si son NFO est trouvé. Rien n'est envoyé.
5. `2-essai-sans-envoyer.bat` (essai), puis **`3-lancer-en-continu.bat`**. Laisse la fenêtre ouverte.

### Option 3 — directement sur la seedbox, si tu as un accès SSH

Voir la fin de ce guide (« Sur la seedbox en SSH »). Appbox ne propose pas toujours l'accès SSH : le FTP des options 1 et 2 suffit.

## Le NFO

Seeduction exige un NFO ou un MediaInfo. L'outil cherche, dans l'ordre :

1. un fichier `.nfo` dans le dossier de la release (lu par FTP) ;
2. `nfoDir` (facultatif) : un dossier à toi où le fichier s'appelle `<nom de la release>.nfo` ;
3. le **MediaInfo du plus gros fichier vidéo**, calculé sur ses premiers Mo (`headMB`, 16 par défaut). Le nom et la taille réels du fichier sont remis dans le rapport, et le débit global et la taille des pistes (faux sur un fichier partiel) en sont retirés.
   Marche bien pour les `.mkv`. Pour certains `.mp4` dont les informations sont à la fin du fichier, l'outil le dit et la release attend un `.nfo`.

Sans NFO, la release attend : ajoute un `.nfo` dans son dossier et elle partira à la passe suivante.

## Configuration (`config.json`)

| Champ | Rôle |
|---|---|
| `site` | adresse de ton site Seeduction |
| `maxPerRun`, `delaySeconds` | au plus 5 envois par passe, avec 30 s de pause entre deux |
| `intervalMinutes` | fréquence des passes (10 minutes) |
| `defaultCategory`, `categoryRules` | catégorie de ton site selon le nom de la release (expressions régulières, la première qui correspond gagne) |
| `description` | texte ajouté à la description (vide par défaut) |

Dans `sources` (type `qbittorrent`) :

| Champ | Rôle |
|---|---|
| `url`, `username`, `password` | l'interface web de qBittorrent. `${QBIT_USER}` / `${QBIT_PASS}` sont lus dans `cles.env` ou `cles.bat` : ne les écris pas dans ce fichier |
| `qbitCategory` / `qbitTag` | quelles releases publier (catégorie et/ou étiquette). Sans ces deux champs : tout ce qui se termine |
| `ftp` | accès aux fichiers de la seedbox : `host`, `port` (21), `username`, `password` (`${FTP_USER}`, `${FTP_PASS}`), `secure` (`true` = FTP sur TLS, `false` = FTP simple), `headMB`, `searchDepth` (3). L'outil retrouve **tout seul** le dossier de chaque release sur le FTP, même si son chemin n'est pas le même que dans qBittorrent |
| `mediainfo` | `true` si le programme `mediainfo` est installé là où l'outil tourne (il l'est dans Docker). Un chemin complet, ou une liste `["programme", "argument"]`, marche aussi |
| `pathMap`, `nfoDir` | pour des fichiers visibles directement (dossier réseau) au lieu du FTP ; `nfoDir` : NFO déposés à la main |
| `seedOnSeeduction`, `seedCategory`, `skipChecking`, `doneTag` | ajout du torrent de Seeduction dans qBittorrent (`true`, catégorie `seeduction`, sans revérification) ; étiquette `seeduction-envoye` posée sur ta release |
| `include`, `exclude`, `maxAgeHours`, `minSizeGb`, `maxSizeGb` | filtres facultatifs |

## Commandes (si tu préfères le terminal)

```bash
node auto-upload.mjs --config config.json --inspect         # ce que l'outil voit, NFO compris (rien n'est envoyé)
node auto-upload.mjs --config config.json --dry-run         # essai sans rien envoyer ni ajouter
node auto-upload.mjs --config config.json                   # une passe
node auto-upload.mjs --config config.json --watch           # en continu
node auto-upload.mjs --config config.json --list-categories # les catégories de ton site
node auto-upload.mjs --config config.json --retry-skipped   # retente ce qui avait été mis de côté
```

## Bon à savoir

- `state.json` garde la mémoire de ce qui est envoyé, en doublon, refusé ou déjà ajouté pour le seed. Supprime-le pour tout recommencer.
- Une erreur temporaire (qBittorrent éteint, FTP injoignable, site indisponible) n'est pas mémorisée : on réessaie à la passe suivante.
- Une clé sans la bonne portée, ou dont le compte est banni, arrête l'outil avec un message clair. Révoque la clé dans Profil > Développeur au moindre doute.
- Le torrent de Seeduction n'a pas le même identifiant que l'original (Seeduction retire les trackers externes et force le mode privé) : il apparaît comme un second torrent dans qBittorrent, sur les mêmes fichiers.
- Ne publie que des contenus que tu as le droit de partager.

## Sur la seedbox en SSH (si ton hébergeur en donne un)

`./lancer-seedbox.sh` lance l'outil sur la machine qui héberge qBittorrent : les fichiers sont sur place (aucun FTP ni `pathMap`) et MediaInfo les lit directement.
Il faut Node.js 18 ou plus (sans droits administrateur : `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash`, puis `. ~/.nvm/nvm.sh && nvm install --lts`) et, pour les releases sans `.nfo`, `mediainfo`.
Copie ce dossier sur la seedbox, `cp cles.exemple.env cles.env` et remplis-le, lance `./lancer-seedbox.sh --inspect` (il crée `config.json` d'après `config.seedbox.example.json` : mets l'adresse locale de qBittorrent dans `url`), puis
`nohup ./lancer-seedbox.sh --watch > import.log 2>&1 &` pour qu'il continue quand tu fermes SSH ; `pkill -f auto-upload.mjs` l'arrête.
