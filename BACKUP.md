# Sauvegardes et remise en ligne

Seeduction se sauvegarde **tout seul, chaque jour**, et peut être **remis en ligne sur n'importe quelle machine** (serveur loué, hébergeur, NAS, PC) à partir d'un seul fichier.

## Ce qui est sauvegardé

Chaque sauvegarde complète est un **paquet unique et chiffré** (`seeduction-backup-AAAAMMJJ-HHMMSS.tar.enc`, AES-256) qui contient :

| Élément | Pourquoi c'est indispensable |
|---|---|
| **La base de données** PostgreSQL | membres, torrents, forum, messages, ratios, réglages... (format `pg_dump`) |
| **Les fichiers** | `.torrent`, pochettes, pièces jointes du chat, et le coffre de l'« Alerte générale » |
| **Les fichiers `.env`** (racine et `backend/`) | ils ne sont **pas dans git** : `JWT_SECRET` (qui chiffre aussi les mots de passe de seedbox enregistrés), SMTP, clés d'API, mot de passe PostgreSQL. Sans eux, un site restauré ne pourrait pas relire ces données |
| **Le code** + l'adresse du dépôt et la révision exacte | pour reconstruire le site même si GitHub est inaccessible |
| `docker-compose.yml` | tel qu'il tournait |
| `manifest.json` | description, nombre de membres / torrents, empreintes SHA-256 de chaque élément |

Le paquet est chiffré avec une **phrase de récupération** (voir plus bas), parce qu'il contient les mots de passe et les clés du site.

## Où ça se règle : Admin > Sauvegardes

* **Sauvegarder maintenant**, état de la dernière sauvegarde, historique détaillé étape par étape.
* **Heure** et **fuseau** de la sauvegarde quotidienne, **rotation** (par défaut : 7 jours, 4 semaines, 6 mois).
* **Copie externe** (voir plus bas), alertes aux administrateurs si une sauvegarde échoue ou prend du retard (plus de 36 h).
* **Tester la restauration** : déchiffre le dernier paquet, recharge sa base dans une base jetable à côté de la vraie et compare le nombre de membres et de torrents avec ce que le paquet annonçait. Fait aussi automatiquement une fois par semaine. *Une sauvegarde qu'on n'a jamais restaurée n'est qu'une hypothèse.*
* **Télécharger** : un **ZIP de restauration** (le paquet chiffré + `restaurer.sh` + un mode d'emploi pas à pas) ou le paquet seul.
* Avant chaque mise à jour, `deploy.sh` prend un **instantané de la base** (`seeduction-predeploy-*`, les 5 derniers sont gardés).

Chaque paquet est **relu et déchiffré** juste après sa création : un paquet illisible ne passe jamais pour une sauvegarde réussie.

### La phrase de récupération (à noter MAINTENANT)

Elle est créée automatiquement. Dans Admin > Sauvegardes, bouton **🔑 Phrase de récupération** (mot de passe demandé) : note-la **ailleurs que sur le serveur** (gestionnaire de mots de passe, papier dans un coffre) puis coche la confirmation. Sans elle, personne — pas même toi — ne peut rouvrir une sauvegarde si le serveur est perdu. Elle n'est **jamais** dans le ZIP.

### Copie hors du serveur (très recommandé)

Une sauvegarde qui ne vit que sur la machine à protéger ne la protège pas d'une panne de cette machine. Deux possibilités, cumulables :

1. **Un disque externe / un partage réseau** : monte-le dans `docker-compose.yml` (ligne d'exemple en commentaire sous `backend`, p. ex. `- /volumeUSB1/usbshare/seeduction:/offsite`), puis indique `/offsite` dans les réglages.
2. **Un nuage ou un serveur** (Google Drive, OneDrive, Backblaze B2, S3, SFTP...) via **rclone** : lance `rclone config` sur n'importe quelle machine, dépose le fichier `rclone.conf` obtenu dans `backups/` du serveur, puis indique `nom:dossier` dans les réglages.

Chaque nouveau paquet y est copié, avec le script de restauration et le mode d'emploi, et la même rotation y est appliquée.

#### Déplacer les sauvegardes sur un autre disque (NAS : le gros disque)

Si le dossier du site est sur une petite partition (typiquement `/root` sur Synology, 2,3 Go), place les sauvegardes sur le gros disque : crée le dossier (`mkdir -p /volume1/docker/seeduction-backups`), déplace-y le contenu de `backups/`, ajoute `BACKUPS_PATH=/volume1/docker/seeduction-backups` dans le fichier `.env` à la racine, puis `./deploy.sh`. Les données du site (base, fichiers) sont dans des volumes Docker et ne sont pas concernées.

## Les deux autres sauvegardes (filet de sécurité, inchangées)

Les conteneurs `db-backup` (base en `.sql.gz`) et `files-backup` (fichiers) tournent toujours dans `./backups/db/` et `./backups/files/` : ils ne dépendent pas du backend, donc continuent même si celui-ci ne démarre plus.

## Remettre le site en ligne (n'importe quelle machine)

1. Télécharge le **ZIP de restauration** (Admin > Sauvegardes) et garde-le hors du serveur. Aie la **phrase de récupération**.
2. Sur la machine neuve, copie et décompresse le ZIP, puis :

   ```bash
   bash restaurer.sh --installer-docker
   ```

   (sans `--installer-docker` si Docker est déjà installé ; sous Linux, avec `sudo` si besoin). Il demande la phrase, vérifie que le paquet est intact (empreintes), demande confirmation, puis remet tout en place : code, `.env`, base, fichiers, démarrage. 5 à 15 minutes.
3. Il reste 3 choses que seul toi peux faire : pointer ton **proxy** (Nginx Proxy Manager...) vers la machine (site → port `9098`, tracker → port `9099`, avec HTTPS), mettre à jour le **DNS**, et — si tu utilises les appels audio/vidéo — rouvrir les ports **TURN**.

Le mode d'emploi complet (Linux, Synology, Windows/WSL, Mac, dépannage) est dans le ZIP : `1-LISEZ-MOI-D-ABORD.txt`.

### Options de `restaurer.sh`

| Option | Effet |
|---|---|
| `--verifier` | vérifie seulement que le paquet est lisible et intact, sans rien installer |
| `--dossier CHEMIN` | où installer (défaut `./seeduction`) |
| `--derniere-version` | utilise la dernière version du code (git) au lieu de celle de la sauvegarde |
| `--images FICHIER` | charge des images Docker enregistrées (`./backup.sh --images`) : installation **sans internet** |
| `--sans-demarrer` | prépare tout mais ne démarre pas |
| `--simulation` | affiche ce qui serait fait sans rien exécuter |
| `--oui` | aucune question de confirmation |

Le script accepte aussi directement un `.zip` ou un `.tar.enc`, et la phrase peut être fournie par `SEED_BACKUP_PASS="..."`.

Restaurer **sur la même machine** (p. ex. après une fausse manipulation) : `bash restaurer.sh --dossier . paquet.tar.enc` depuis le dossier du site. La base et les fichiers sont remplacés par ceux du paquet.

## Depuis le NAS (SSH)

```bash
./backup.sh            # sauvegarde complète tout de suite (même paquet que le bouton)
./backup.sh --images   # + enregistre les images Docker (installation sans internet)
ls -lh backups/full    # les paquets (.tar.enc), leur empreinte .sha256, status.json
```

`./backups/` est ignoré par git : `deploy.sh` n'y touche jamais.

## Ce que la sauvegarde ne peut PAS faire à ta place

À avoir sous la main (hors du serveur) :

* la **phrase de récupération** ;
* l'accès à ton **registraire de domaine / DNS** ;
* la configuration de ton **proxy** (Nginx Proxy Manager : hôtes, certificats) — elle vit sur le NAS, pas dans Seeduction ;
* un **compte GitHub** avec accès au dépôt (sinon la copie du code du paquet est utilisée) ;
* tes **builds du lecteur desktop** si tu les distribues (ils se reconstruisent depuis `desktop-player/`).

## Dépannage

| Message | Que faire |
|---|---|
| « Phrase incorrecte » | recopie-la sans espace ; elle est la même pour tous les paquets du site |
| « L'empreinte ne correspond pas » | le fichier a été abîmé en le copiant : recopie-le / retélécharge le ZIP |
| Admin > Sauvegardes : « Le dossier du projet n'est pas monté » | vérifie la ligne `./:/host/project:ro` du service `backend` dans `docker-compose.yml`, puis `docker compose up -d` |
| `pg_dump` : « server version mismatch » | l'image du backend embarque le client PostgreSQL 16 ; garde `postgres:16-alpine` côté serveur |
| La sauvegarde échoue (disque plein...) | l'historique (Admin > Sauvegardes) donne l'étape et le message ; libère de la place ou réduis la rotation |
| Le site ne répond pas après la restauration | attends 1 minute, puis `docker compose logs --tail=80 backend` |

## Anciennes sauvegardes (`db-backup` / `files-backup`)

```bash
# Restaurer la base d'une ancienne sauvegarde .sql.gz (remplace le contenu actuel)
docker compose stop backend frontend
gunzip -c backups/db/daily/<fichier>.sql.gz | docker compose exec -T postgres psql -U tracker -d tracker
docker compose start backend frontend
```
