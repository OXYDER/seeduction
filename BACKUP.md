# Sauvegardes

Deux conteneurs tournent en permanence (voir `docker-compose.yml`) :

| Conteneur | Ce qu'il sauvegarde | Où | Rétention |
|---|---|---|---|
| `db-backup` | base PostgreSQL (membres, torrents, forum...) | `./backups/db/` | 7 jours, 4 semaines, 6 mois |
| `files-backup` | fichiers `.torrent`, pochettes et pièces jointes du chat | `./backups/files/` | 14 jours |

`./backups/` est ignoré par git : `deploy.sh` n'y touche jamais.

**Important : copie régulièrement `./backups/` hors du NAS** (disque USB, Hyper Backup Synology vers un cloud...).
Une sauvegarde qui ne vit que sur la machine à protéger ne protège pas d'une panne du NAS.

## Vérifier que ça marche

```bash
ls -lh backups/db/daily backups/files
```

## Restaurer la base

```bash
# 1. Arrêter l'application (garde postgres)
docker compose stop backend frontend
# 2. Choisir une sauvegarde
ls backups/db/daily
# 3. La recharger (remplace le contenu actuel de la base)
gunzip -c backups/db/daily/<fichier>.sql.gz | docker compose exec -T postgres psql -U tracker -d tracker
# 4. Relancer
docker compose start backend frontend
```

## Restaurer les fichiers

```bash
docker run --rm -v seeduction_torrent_storage:/data/torrents -v seeduction_cover_storage:/data/covers \
  -v seeduction_chat_file_storage:/data/chat-files -v "$PWD/backups/files:/backups" alpine tar xzf /backups/files-AAAA-MM-JJ.tar.gz -C /data
```
(le préfixe `seeduction_` des volumes dépend du nom du dossier du projet : vérifie avec `docker volume ls`.)
