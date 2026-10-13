#!/bin/bash
# ==============================================================================
# deploy.sh — à lancer sur le NAS (Synology) pour mettre à jour Mega Tracker.
#
# Ce script ne touche jamais à aucun secret : il suppose que git est déjà
# authentifié sur cette machine (credential helper ou clé SSH déjà en place).
#
# Usage : ./deploy.sh
# Peut être lancé manuellement en SSH, ou ajouté au Planificateur de tâches
# Synology pour tourner automatiquement (ex: toutes les 5 min, ou sur trigger).
# ==============================================================================
set -e

cd "$(dirname "$0")"

# Message de maintenance affiché à tous les visiteurs du site pendant la mise à jour (voir backend/src/system) : « petite mise à jour en cours, instabilité
# possible durant les 5 à 10 prochaines minutes ». Il passe par le conteneur du backend lui-même (aucun secret) et n'a aucun effet, sans erreur, si le backend
# ne tourne pas encore ou n'a pas encore cette fonction (premier déploiement qui l'installe). Il s'efface tout seul après 20 minutes si le déploiement échoue.
maintenance() {
  docker compose exec -T backend node -e "
    fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/system/maintenance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: process.argv[1], minutes: 20 }) })
      .then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1));
  " "$1" >/dev/null 2>&1
}
NOTICE=0
if maintenance start; then NOTICE=1; echo "→ Message de maintenance affiché sur le site."; fi

# Filet de sécurité : instantané chiffré de la base juste avant la mise à jour (les 5 derniers sont gardés dans backups/full/). Ne bloque jamais le déploiement :
# sans effet, sans erreur, si le backend ne tourne pas encore ou n'a pas encore cette fonction.
echo "→ Instantané de la base avant la mise à jour..."
if docker compose exec -T backend node -e "
    fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/backup/predeploy', { method: 'POST' })
      .then(async (r) => { const j = await r.json().catch(() => ({})); console.log(j.file || ''); process.exit(r.ok && j.ok ? 0 : 1); }).catch(() => process.exit(1));
  " 2>/dev/null; then echo "✓ Instantané enregistré."; else echo "  (pas d'instantané : première installation, ou la sauvegarde n'est pas encore en place)"; fi

echo "→ Récupération des dernières modifications..."
git fetch origin main
git reset --hard origin/main
# git clean respecte déjà .gitignore (storage/, .env, node_modules/, dist/ ne sont jamais touchés)
git clean -fd

# Journal des modifications (page Roadmap) et numéro de version : écrits depuis l'historique git, avant la construction de l'image.
{ echo "COUNT=$(git rev-list --count HEAD)"; git log -n 400 --pretty=format:'%H%x1f%aI%x1f%s%x1f%b%x1e'; } > backend/changelog.txt

# Docker (surtout sur Synology) refuse de monter un dossier hôte qui n'existe pas :
# les sauvegardes automatiques écrivent dans ./backups.
BK="$(grep -E '^BACKUPS_PATH=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"   # dossier des sauvegardes choisi dans .env (sinon ./backups)
mkdir -p "${BK:-backups}/db" "${BK:-backups}/files" "${BK:-backups}/full"

echo "→ Reconstruction et redémarrage des conteneurs..."
docker compose up -d --build

# Le nouveau backend met quelques secondes à démarrer : on retire le message de maintenance dès qu'il répond.
if [ "$NOTICE" = "1" ]; then
  echo "→ Attente du nouveau backend pour retirer le message de maintenance..."
  for _ in $(seq 1 60); do
    if maintenance end; then echo "✓ Message de maintenance retiré."; break; fi
    sleep 3
  done
fi

echo "→ Nettoyage des anciennes images..."
docker image prune -f

echo "✓ Déploiement terminé : $(git log -1 --oneline)"
