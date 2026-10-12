#!/usr/bin/env bash
# Remet le site en ligne à partir d'une sauvegarde : voir BACKUP.md.
# Ce fichier se contente d'appeler le vrai script (backend/assets/restore.sh), aussi livré dans le ZIP de restauration téléchargé depuis Admin > Sauvegardes.
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backend/assets/restore.sh" "$@"
