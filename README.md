# Mega Tracker — tracker BitTorrent privé complet

Stack : **NestJS + Prisma + PostgreSQL** (backend) / **React + Vite** (frontend) / **Docker**.

## Fonctionnalités

- **Tracker BitTorrent réel** : endpoints `announce`/`scrape` en bencode, passkey par utilisateur, peers compacts, freeleech/double-upload, purge automatique des peers morts
- **Ratio & anti-triche** : delta d'upload/download calculé par diff entre announces (jamais de confiance aveugle au client), enforcement d'un ratio minimum, snapshots quotidiens pour graphique d'évolution
- **Comptes** : invitations en cascade (parrainage), JWT, 2FA (TOTP), rôles (user/uploader/modérateur/admin/owner)
- **Torrents** : upload avec parsing réel du fichier .torrent, calcul d'info_hash, dedupe, génération à la volée du .torrent avec la passkey de chaque téléchargeur, catégories, tags
- **Communauté** : forum (catégories/topics/posts), messagerie privée, système de requests avec bounty en points
- **Modération** : approbation des torrents, bans/warnings, reports, logs d'activité
- **Stats** : dashboard global, leaderboard, top torrents

## Démarrage rapide

```bash
cp .env.example .env
# édite .env à la racine : mot de passe Postgres (source unique, partagée
# automatiquement avec le backend par docker-compose.yml)

cp backend/.env.example backend/.env
# édite backend/.env : JWT_SECRET, ANNOUNCE_BASE_URL (ignore DATABASE_URL,
# docker-compose le construit lui-même à partir du .env racine)

docker compose up -d --build

# Première fois seulement : appliquer le schéma Prisma
docker compose exec backend npx prisma migrate deploy
```

Frontend sur le port 80 du conteneur `frontend`, backend sur le port 3000 du
conteneur `backend`. Route les deux via Nginx Proxy Manager, comme le reste
de tes services (ex: `tracker.tondomaine.ca` → frontend, avec le frontend qui
proxy `/api` et `/tracker` vers le backend, ou deux sous-domaines distincts).

## Créer le premier compte admin

Comme l'inscription nécessite un code d'invitation, génère le tout premier
manuellement en base après la migration :

```sql
INSERT INTO "InviteCode" (id, code, "createdById", used, "createdAt")
VALUES (gen_random_uuid(), 'PREMIER-CODE', (SELECT id FROM "User" LIMIT 1), false, now());
```

Ou plus simplement : inscris-toi une première fois en désactivant
temporairement la vérification du invite code dans `auth.service.ts`,
crée ton compte admin, remonte son rôle à `ADMIN` en base, puis réactive
la vérification.

## Workflow de déploiement (push manuel + pull automatique sur le NAS)

Le pattern qui évite de jamais coller un token ou toucher à l'auth git
depuis une conversation avec Claude :

1. **Crée le repo vide sur GitHub** sous `OXYDER/seeduction` (sans README
   auto-généré, pour éviter un conflit avec l'historique déjà présent dans
   ce zip).
2. **Depuis ta machine**, pousse une première fois :
   ```bash
   cd tracker
   git remote add origin https://github.com/OXYDER/seeduction.git
   git branch -M main
   git push -u origin main
   ```
   (Le repo est déjà initialisé avec un historique de commits — voir plus bas.)
3. **Sur ton NAS**, clone le repo une première fois puis lance le stack :
   ```bash
   git clone https://github.com/OXYDER/seeduction.git
   cd seeduction
   docker compose up -d --build
   ```
4. **À chaque modification** qu'on fait ensemble dans une conversation :
   - Toi : tu récupères les fichiers, tu `git add -A && git commit && git push`
     depuis ta machine (10 secondes avec le credential helper déjà configuré)
   - Le NAS : lance `./deploy.sh` — il fait `git pull`, reconstruit les images
     Docker modifiées, et redémarre les conteneurs
   - Tu peux lancer `./deploy.sh` manuellement en SSH après chaque push, ou
     l'ajouter au **Planificateur de tâches** Synology pour qu'il tourne
     automatiquement (ex: toutes les 5 minutes, ou sur un trigger webhook).

Ce pattern garde toute authentification (token ou clé SSH) exclusivement sur
tes machines — jamais dans une conversation.

## Ce qui est scaffoldé vs à approfondir

**Complet et fonctionnel** : moteur tracker (announce/scrape), bencode,
parsing .torrent, auth/JWT/2FA/invites, upload/download de torrents, ratio
engine, forum, messagerie, requests, modération, stats, cron jobs.

**À approfondir selon tes besoins réels** :
- Support UDP pour le tracker (actuellement HTTP seulement — largement
  suffisant pour un tracker privé, mais certains clients préfèrent UDP)
- Anti-cheat plus poussé (détection de clients modifiés, cross-check IP)
- Stockage S3/objet pour les fichiers .torrent au lieu du disque local
- Tests automatisés (aucun test n'est inclus dans ce scaffold)
- Polish visuel du frontend (actuellement fonctionnel, thème sombre simple)
- Rate-limiting dédié et plus strict sur l'endpoint `/announce` spécifiquement
