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

echo "→ Récupération des dernières modifications..."
git pull origin main

echo "→ Reconstruction et redémarrage des conteneurs..."
docker compose up -d --build

echo "→ Nettoyage des anciennes images..."
docker image prune -f

echo "✓ Déploiement terminé : $(git log -1 --oneline)"
