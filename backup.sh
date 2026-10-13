#!/bin/bash
# ==============================================================================
# backup.sh — sauvegarde complète tout de suite, depuis le NAS / le serveur (SSH).
# Équivalent du bouton « Sauvegarder maintenant » de Admin > Sauvegardes : même paquet chiffré dans ./backups/full/.
#
#   ./backup.sh            sauvegarde complète (base, fichiers, .env, code), attendue jusqu'au bout
#   ./backup.sh --images   en plus, enregistre les images Docker (backups/images/seeduction-images.tar) :
#                          permet de réinstaller le site SANS internet (restaurer.sh --images ...)
# ==============================================================================
set -e
cd "$(dirname "$0")"
BK="$(grep -E '^BACKUPS_PATH=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"; BK="${BK:-backups}"

echo "→ Sauvegarde complète en cours (quelques instants)..."
docker compose exec -T backend node -e "
  fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/backup/local-run', { method: 'POST' })
    .then(async (r) => { const j = await r.json().catch(() => ({})); console.log(JSON.stringify(j)); process.exit(r.ok && j.ok ? 0 : 1); })
    .catch((e) => { console.error(String(e)); process.exit(1); });
" || { echo "✗ La sauvegarde a échoué : regarde Admin > Sauvegardes (historique) ou  docker compose logs --tail=50 backend"; exit 1; }
echo "✓ Sauvegarde terminée : $(ls -1t "$BK"/full/seeduction-backup-*.tar.enc 2>/dev/null | head -1)"

if [ "${1:-}" = "--images" ]; then
  echo "→ Enregistrement des images Docker (peut prendre quelques minutes)..."
  mkdir -p "$BK/images"
  IMAGES="$(docker compose config --images | sort -u | tr '\n' ' ')"
  # shellcheck disable=SC2086
  docker save -o "$BK/images/seeduction-images.tar" $IMAGES
  echo "✓ Images enregistrées : $BK/images/seeduction-images.tar ($(du -h "$BK/images/seeduction-images.tar" | cut -f1))"
fi
