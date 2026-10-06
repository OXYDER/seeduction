#!/bin/sh
# Lance l import qBittorrent -> Seeduction sur une seedbox / un serveur Linux. Usage : ./lancer-seedbox.sh [--inspect | --dry-run | --watch]
cd "$(dirname "$0")" || exit 1
[ -f cles.env ] || { echo "Il manque cles.env : copie cles.exemple.env en cles.env et remplis-le."; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js est introuvable (voir README, section seedbox)."; exit 1; }
set -a; . ./cles.env; set +a
[ -f config.json ] || cp config.seedbox.example.json config.json
exec node auto-upload.mjs --config config.json "$@"
