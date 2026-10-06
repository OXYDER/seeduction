# Import automatique de torrents

Surveille des **sources que tu configures** (flux RSS / Torznab, ou un dossier de fichiers `.torrent`) et envoie les nouveautés sur ton site
par l'API. Aucune dépendance : il suffit de Node 18 ou plus (sur ton PC, ou sur le NAS avec Docker, voir plus bas).

Ce que l'outil fait, et ne fait pas :

- Il envoie **par le même chemin que le formulaire d'envoi** : mêmes règles (NFO ou MediaInfo obligatoire, doublons refusés, catégories,
  trackers externes retirés du `.torrent`, drapeau « private » forcé) et **le torrent attend la validation du staff**.
- Il ne se connecte à aucun site à ta place : pas de mot de passe, pas de contournement d'accès. Pour une source qui demande une clé
  ou un cookie, tu fournis toi-même l'adresse du flux (ou l'en-tête dans `headers`), dans ton fichier de configuration local.
- Il ne copie que ce que ta source met à disposition (flux, `.torrent`, NFO). Sans NFO, l'élément est mis de côté, jamais inventé.
- **À toi de vérifier** que tu as le droit de reprendre et de partager le contenu, et que la source autorise ce genre de reprise
  (beaucoup de trackers privés l'interdisent dans leur règlement).

## Mise en route

1. **Crée une clé API** sur ton site : Profil > Développeur, portées `torrents:upload` **et** `torrents:read`. La clé n'est affichée qu'une fois.
2. Copie `config.example.json` en `config.json` et adapte-le (adresse du site, sources, filtres).
3. Donne la clé à l'outil par une variable d'environnement (elle ne doit jamais être écrite dans un fichier partagé ni dans git) :

   ```bash
   export SEEDUCTION_API_KEY="sd_...."
   ```
4. Vois les catégories de ton site, pour écrire les règles :

   ```bash
   node auto-upload.mjs --config config.json --list-categories
   ```
5. Essaie sans rien envoyer, puis pour de vrai :

   ```bash
   node auto-upload.mjs --config config.json --dry-run
   node auto-upload.mjs --config config.json
   ```
6. En continu (repasse toutes les `intervalMinutes`) :

   ```bash
   node auto-upload.mjs --config config.json --watch
   ```

Sur le NAS, sans installer Node :

```bash
docker run -d --name auto-upload --restart unless-stopped \
  -e SEEDUCTION_API_KEY="sd_...." -v "$PWD":/app -w /app node:20-alpine \
  node auto-upload.mjs --config config.json --watch
```

## Configuration

| Champ | Rôle |
|---|---|
| `site` | adresse de ton site |
| `apiKeyEnv` | nom de la variable d'environnement qui contient la clé (par défaut `SEEDUCTION_API_KEY`) |
| `maxPerRun` | nombre maximum d'envois par passe (10 par défaut) |
| `delaySeconds` | pause entre deux envois (20 s par défaut) : on ne noie pas la file de modération |
| `defaultCategory`, `categoryRules` | catégorie de ton site selon le titre ou la catégorie de la source (expressions régulières, la première qui correspond gagne) |
| `description` | texte ajouté à la description, `{source}` = nom de la source |

Chaque source (`sources[]`) :

| Champ | Rôle |
|---|---|
| `type` | `rss` (flux RSS 2.0 ou Torznab) ou `folder` (dossier de `.torrent`) |
| `url` / `path` | adresse du flux / dossier |
| `nfo` | d'où vient le NFO : `description` (texte du flux, par défaut), `url` (voir `nfoUrl`, avec `{guid}`, `{title}`, `{infohash}`), ou rien. Pour un dossier : le fichier `.nfo` de même nom, à côté du `.torrent` |
| `include` / `exclude` | filtres (expressions régulières) sur le titre |
| `maxAgeHours`, `minSizeGb`, `maxSizeGb` | limites d'âge et de taille |
| `category`, `categoryRules` | catégorie propre à cette source |
| `headers` | en-têtes ajoutés aux requêtes vers la source |

## Bon à savoir

- `state.json` garde la mémoire de ce qui est envoyé, en doublon, refusé ou mis de côté. Supprime-le pour tout recommencer.
  `--retry-skipped` retente seulement ce qui avait été mis de côté (NFO manquant, catégorie introuvable...).
- Une erreur temporaire (source ou site indisponible) n'est pas mémorisée : l'élément sera retenté à la passe suivante.
- Une clé qui n'a pas la bonne portée, ou dont le compte est banni, arrête l'outil avec un message clair.
- Révoque la clé dans Profil > Développeur au moindre doute : l'outil s'arrête aussitôt.
