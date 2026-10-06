# De qBittorrent à Seeduction, automatiquement

Tu marques une release dans qBittorrent (catégorie `a-publier`). Quand elle est **terminée**, l'outil :

1. récupère son `.torrent` dans qBittorrent et son **NFO** (un fichier `.nfo` dans le dossier de la release, sinon le MediaInfo du fichier vidéo) ;
2. l'envoie sur Seeduction, qui le garde **en attente de validation** : le staff valide comme pour n'importe quel envoi (mêmes règles : NFO obligatoire, doublons refusés) ;
3. dès que le staff a validé, ajoute dans qBittorrent la version de Seeduction (avec ton passkey) **sur les mêmes fichiers**, sans revérifier : tu seedes aussi sur Seeduction.

Il n'agit que sur les torrents de la catégorie choisie, et qu'une seule fois par torrent. Il ne supprime rien et ne déplace aucun fichier.

## Ce qu'il te faut

- **qBittorrent 4.5 ou plus récent**, avec l'interface web activée : *Outils > Options > Interface Web*, coche « Interface utilisateur Web », note le port, choisis un nom d'utilisateur et un mot de passe.
- **Node.js** (version LTS) sur la machine qui lance l'outil : https://nodejs.org
- **Accès aux fichiers des releases** depuis cette machine (pour lire le NFO). Deux cas :
  - l'outil tourne sur ton PC : le dossier de téléchargement du NAS doit être un lecteur réseau (par exemple `Z:`) ;
  - l'outil tourne sur le NAS (Docker) : il voit directement les mêmes dossiers.

  Dans les deux cas, `pathMap` dit à l'outil comment traduire le chemin vu par qBittorrent en chemin vu par l'outil (voir plus bas).
- **Une clé API de ton site Seeduction** : Profil > Développeur, portées `torrents:upload` et `torrents:read`. Elle n'est affichée qu'une fois.

## Mise en route (Windows)

1. Dans qBittorrent, crée la catégorie **`a-publier`** (clic droit sur un torrent > Catégorie > Nouvelle).
2. Dans ce dossier, copie `cles.exemple.bat` en **`cles.bat`**, ouvre-le avec le Bloc-notes et remplis : la clé de ton site, l'identifiant et le mot de passe de l'interface web de qBittorrent.
3. Double-clique **`1-voir-la-source.bat`** une première fois : il crée `config.json` à partir du modèle. Ferme, puis ouvre `config.json` avec le Bloc-notes et adapte :
   - `url` : l'adresse de l'interface web de qBittorrent, par exemple `http://192.168.1.50:8080` ;
   - `pathMap` : `from` = le dossier tel que qBittorrent le voit (celui qu'on lit dans ses options, par exemple `/volume1/downloads`), `to` = le même dossier vu depuis ton PC (par exemple `Z:/downloads`) ;
   - `defaultCategory` et `categoryRules` : les catégories de ton site (le fichier `0-voir-mes-categories.bat` les affiche).
4. Double-clique **`1-voir-la-source.bat`** : il liste les releases de la catégorie `a-publier` et dit, pour chacune, si son NFO est trouvé. Rien n'est envoyé.
5. **`2-essai-sans-envoyer.bat`** : montre ce qui serait envoyé.
6. **`3-lancer-en-continu.bat`** : lance l'import (une passe toutes les `intervalMinutes`). Laisse la fenêtre ouverte, ferme-la pour arrêter.

Pour publier une release : dans qBittorrent, mets-la dans la catégorie `a-publier` une fois terminée. C'est tout.

## Si qBittorrent est chez un hébergeur de seedbox (Appbox, etc.)

Le plus simple : **lance l'outil sur la seedbox elle-même**, en SSH. Les fichiers sont sur place (aucun partage, aucun `pathMap`), MediaInfo les lit sur place
et rien de vidéo ne transite par ton PC. Il faut Node.js et, pour les releases sans `.nfo`, MediaInfo en ligne de commande.

1. **Connecte-toi en SSH** (adresse, port, identifiant : dans le panneau de l'hébergeur ; sous Windows, PowerShell : `ssh utilisateur@adresse -p port`).
2. **Vérifie ce qui existe déjà** : `node --version` (il faut 18 ou plus) et `mediainfo --Version`. Beaucoup de seedboxes ont MediaInfo ; Node, souvent pas.
3. **Node.js sans droits administrateur** (dans ton dossier personnel) :

   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   . ~/.nvm/nvm.sh && nvm install --lts
   ```
4. **Envoie le dossier `tools/auto-upload`** de ton PC sur la seedbox (WinSCP, FileZilla ou `scp -r`), dans un dossier à toi, par exemple `~/auto-upload`.
5. **Les clés** : `cp cles.exemple.env cles.env`, puis `nano cles.env` : la clé de ton site, l'identifiant et le mot de passe de l'interface web de qBittorrent.
6. **La configuration** : lance une première fois `./lancer-seedbox.sh --inspect` (il crée `config.json` d'après `config.seedbox.example.json`), puis ouvre `config.json` et adapte :
   `url` = l'adresse de l'interface web de qBittorrent **vue depuis la seedbox** (souvent `http://localhost:` + son port : regarde dans les réglages de l'application chez l'hébergeur),
   et `defaultCategory` / `categoryRules` = les catégories de ton site.
7. `./lancer-seedbox.sh --inspect` : la liste des releases de `a-publier` et la présence de leur NFO. Puis `./lancer-seedbox.sh --dry-run` (essai), puis **`./lancer-seedbox.sh --watch`**.
8. **Pour qu'il continue quand tu fermes SSH** : `nohup ./lancer-seedbox.sh --watch > import.log 2>&1 &` (ou dans `tmux` / `screen` si l'hébergeur les propose). Les lignes de suivi sont dans `import.log`. Pour l'arrêter : `pkill -f auto-upload.mjs`.

Si MediaInfo n'est pas installé chez l'hébergeur, demande à son support de l'ajouter, ou dépose une version Linux dans ton dossier personnel et mets son chemin complet à la place de `true` dans `"mediainfo"`.
Si la seedbox redémarre, relance la commande de l'étape 8 (le fichier `state.json` garde la mémoire de ce qui est déjà fait).

## Le NFO

Seeduction exige un NFO ou un MediaInfo pour chaque torrent. L'outil le cherche dans cet ordre :

1. un fichier `.nfo` dans le dossier de la release (ou à côté du fichier, s'il n'y en a qu'un) ;
2. `nfoDir` : un dossier à toi où le fichier s'appelle `<nom de la release>.nfo` ;
3. si `"mediainfo": true` : le MediaInfo du plus gros fichier vidéo (il faut **MediaInfo en ligne de commande** installé : https://mediaarea.net/fr/MediaInfo/Download ; tu peux aussi donner son chemin complet à la place de `true`). Le chemin de ton NAS est retiré du texte.

Si rien n'est trouvé, la release attend : ajoute un `.nfo` dans son dossier, elle sera prise à la passe suivante.

## Configuration (`config.json`)

| Champ | Rôle |
|---|---|
| `site` | adresse de ton site Seeduction |
| `maxPerRun`, `delaySeconds` | au plus 5 envois par passe, avec 30 s de pause entre deux (on ne noie pas la file de modération) |
| `defaultCategory`, `categoryRules` | catégorie de ton site selon le nom de la release (expressions régulières, la première qui correspond gagne) |
| `description` | texte ajouté à la description (vide par défaut) |

Dans `sources` (type `qbittorrent`) :

| Champ | Rôle |
|---|---|
| `url`, `username`, `password` | l'interface web de qBittorrent. `${QBIT_USER}` et `${QBIT_PASS}` sont lus dans `cles.bat` : ne les écris pas dans ce fichier. Sans identifiant, l'outil se connecte sans (si qBittorrent l'autorise sur ton réseau) |
| `qbitCategory` / `qbitTag` | quelles releases publier : celles de cette catégorie et/ou portant cette étiquette |
| `pathMap` | traduction des chemins (voir plus haut). Liste vide si l'outil voit les mêmes chemins que qBittorrent |
| `nfoDir`, `mediainfo` | où chercher le NFO (voir plus haut) |
| `seedOnSeeduction` | `true` : ajoute le torrent de Seeduction dans qBittorrent après validation. `false` : s'arrête à l'envoi |
| `seedCategory` | catégorie qBittorrent donnée au torrent de Seeduction (`seeduction`) |
| `skipChecking` | `true` par défaut : pas de revérification des fichiers (ce sont les mêmes) |
| `doneTag` | étiquette posée sur ta release une fois envoyée (`seeduction-envoye`) |
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

Sur le NAS, sans installer Node :

```bash
docker run -d --name qbit-to-seeduction --restart unless-stopped \
  -e SEEDUCTION_API_KEY="sd_...." -e QBIT_USER="admin" -e QBIT_PASS="..." \
  -v "$PWD":/app -v /volume1/downloads:/volume1/downloads:ro -w /app node:20-alpine \
  node auto-upload.mjs --config config.json --watch
```

## Bon à savoir

- `state.json` garde la mémoire de ce qui est envoyé, en doublon, refusé ou déjà ajouté pour le seed. Supprime-le pour tout recommencer.
- Une erreur temporaire (qBittorrent éteint, site indisponible) n'est pas mémorisée : on réessaie à la passe suivante.
- Une clé sans la bonne portée, ou dont le compte est banni, arrête l'outil avec un message clair. Révoque la clé dans Profil > Développeur au moindre doute.
- Le torrent de Seeduction n'a pas le même identifiant que l'original (Seeduction retire les trackers externes et force le mode privé) : c'est normal, il apparaît comme un second torrent dans qBittorrent, sur les mêmes fichiers.
- Ne publie que des contenus que tu as le droit de partager.
