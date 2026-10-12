#!/usr/bin/env bash
# ==============================================================================
# restaurer.sh — remet Seeduction en ligne à partir d'un paquet de sauvegarde,
# sur n'importe quelle machine qui a Docker (serveur, NAS, hébergeur, PC...).
#
#   bash restaurer.sh                       (cherche tout seul le paquet à côté du script)
#   bash restaurer.sh paquet.tar.enc        (ou le .zip téléchargé depuis Admin > Sauvegardes)
#
# Options :
#   --dossier CHEMIN    où installer le site (défaut : ./seeduction)
#   --verifier          vérifie seulement que le paquet est lisible et intact, sans rien installer
#   --derniere-version  prend la toute dernière version du code (git) au lieu de celle du moment de la sauvegarde
#   --images FICHIER    charge des images Docker déjà sauvegardées (installation sans internet)
#   --installer-docker  installe Docker si besoin (Linux Debian / Ubuntu, via get.docker.com)
#   --sans-demarrer     prépare tout (code, configuration, base, fichiers) mais ne démarre pas le site
#   --oui               ne pose aucune question de confirmation
#   --simulation        affiche ce qui serait fait sans rien exécuter
#
# La phrase de récupération se tape quand le script la demande (ou : SEED_BACKUP_PASS="..." bash restaurer.sh ...).
# Le script ne touche à rien d'autre que le dossier d'installation et les volumes Docker du site.
# ==============================================================================
set -uo pipefail

PAQUET=""; DOSSIER="./seeduction"; VERIFIER=0; DERNIERE=0; IMAGES=""; INSTALLER_DOCKER=0; SANS_DEMARRER=0; OUI=0; SIMU=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dossier) DOSSIER="${2:-}"; shift 2 ;;
    --verifier) VERIFIER=1; shift ;;
    --derniere-version) DERNIERE=1; shift ;;
    --images) IMAGES="${2:-}"; shift 2 ;;
    --installer-docker) INSTALLER_DOCKER=1; shift ;;
    --sans-demarrer) SANS_DEMARRER=1; shift ;;
    --oui) OUI=1; shift ;;
    --simulation) SIMU=1; shift ;;
    -h|--aide|--help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "Option inconnue : $1 (voir --aide)"; exit 2 ;;
    *) PAQUET="$1"; shift ;;
  esac
done

# ---------------------------------------------------------------- affichage
if [ -t 1 ]; then B=$'\033[1m'; G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; N=$'\033[0m'; else B=""; G=""; R=""; Y=""; N=""; fi
etape() { echo; echo "${B}→ $*${N}"; }
ok()    { echo "  ${G}✓${N} $*"; }
avert() { echo "  ${Y}!${N} $*"; }
fatal() { echo; echo "${R}✗ $*${N}" >&2; exit 1; }
# Exécute une commande (ou, en simulation, l'affiche seulement).
lance() { if [ "$SIMU" = 1 ]; then echo "  [simulation] $*"; return 0; fi; "$@"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d 2>/dev/null || mktemp -d -t seedrestore)"
chmod 700 "$TMP"
# Le dossier temporaire contient les secrets en clair : toujours effacé en sortant.
nettoie() { rm -rf "$TMP"; }
trap nettoie EXIT

echo "${B}=== Restauration de Seeduction ===${N}"

# ---------------------------------------------------------------- outils de base
for t in openssl tar; do command -v "$t" >/dev/null 2>&1 || fatal "L'outil « $t » est introuvable. Installe-le (sur Debian/Ubuntu : sudo apt install $t)."; done
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

# Lit un champ simple d'un JSON (manifest.json) : jq, python3 ou node si présents, sinon une extraction grossière.
json_get() { # fichier chemin.a.b
  local f="$1" p="$2"
  if command -v jq >/dev/null 2>&1; then jq -r ".${p} // empty" "$f" 2>/dev/null
  elif command -v python3 >/dev/null 2>&1; then python3 - "$f" "$p" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
for k in sys.argv[2].split('.'):
    d = d.get(k) if isinstance(d, dict) else None
print('' if d is None else d)
PY
  elif command -v node >/dev/null 2>&1; then node -e "let d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));for(const k of process.argv[2].split('.'))d=d&&d[k];console.log(d==null?'':d)" "$f" "$p"
  else grep -o "\"${p##*.}\": *\"[^\"]*\"" "$f" | head -1 | sed 's/.*: *"\(.*\)"/\1/'
  fi
}

# ---------------------------------------------------------------- 1. le paquet
etape "Recherche du paquet de sauvegarde"
if [ -z "$PAQUET" ]; then
  PAQUET="$(ls -1t "$SCRIPT_DIR"/seeduction-backup-*.tar.enc "$SCRIPT_DIR"/*.zip ./seeduction-backup-*.tar.enc ./*.zip 2>/dev/null | head -1 || true)"
  [ -n "$PAQUET" ] || fatal "Aucun paquet trouvé à côté du script. Donne son nom : bash restaurer.sh seeduction-backup-AAAAMMJJ-HHMMSS.tar.enc"
fi
[ -f "$PAQUET" ] || fatal "Fichier introuvable : $PAQUET"
case "$PAQUET" in
  *.zip)
    mkdir -p "$TMP/zip"
    if command -v unzip >/dev/null 2>&1; then unzip -q -o "$PAQUET" -d "$TMP/zip" || fatal "Le fichier zip est illisible (téléchargement incomplet ?)."
    elif command -v python3 >/dev/null 2>&1; then python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$PAQUET" "$TMP/zip" || fatal "Le fichier zip est illisible."
    else fatal "Pour ouvrir un .zip il faut « unzip » (sudo apt install unzip) ou python3."; fi
    PAQUET="$(find "$TMP/zip" -name 'seeduction-backup-*.tar.enc' | head -1)"
    [ -n "$PAQUET" ] || fatal "Aucun paquet .tar.enc dans ce zip."
    ;;
esac
ok "Paquet : $PAQUET ($(du -h "$PAQUET" | cut -f1))"

SUMFILE="$PAQUET.sha256"
if [ -f "$SUMFILE" ]; then
  want="$(cut -d' ' -f1 "$SUMFILE")"; have="$(sha256 "$PAQUET")"
  [ "$want" = "$have" ] && ok "Empreinte SHA-256 conforme : le fichier est intact." || fatal "L'empreinte SHA-256 ne correspond pas : le fichier est abîmé (copie ou téléchargement incomplet). Recopie-le."
fi

# ---------------------------------------------------------------- 2. phrase de récupération et déchiffrement
etape "Déchiffrement"
PASS="${SEED_BACKUP_PASS:-}"
dechiffre() {
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:SEED_BACKUP_PASS -in "$PAQUET" -out "$TMP/bundle.tar" 2>/dev/null && tar tf "$TMP/bundle.tar" 2>/dev/null | grep -q 'manifest.json'
}
essais=0
while :; do
  if [ -z "$PASS" ]; then
    printf "Phrase de récupération (elle s'affiche dans Admin > Sauvegardes, ex. K7QM2-X9PTR-…) : "
    read -r -s PASS; echo
  fi
  PASS="$(printf '%s' "$PASS" | tr -d '[:space:]' | tr 'a-z' 'A-Z')"
  export SEED_BACKUP_PASS="$PASS"
  if dechiffre; then ok "Paquet déchiffré."; break; fi
  essais=$((essais + 1)); PASS=""
  [ "$essais" -ge 3 ] && fatal "Phrase incorrecte (ou paquet abîmé). Sans la bonne phrase, le paquet ne peut pas être ouvert."
  avert "Phrase incorrecte, essaie encore ($essais/3)."
done
mkdir -p "$TMP/b"
tar xf "$TMP/bundle.tar" -C "$TMP/b" || fatal "Le paquet déchiffré est illisible."
rm -f "$TMP/bundle.tar"
M="$TMP/b/manifest.json"
[ -f "$M" ] || fatal "manifest.json absent du paquet."

CREE="$(json_get "$M" createdAt)"; VERSION="$(json_get "$M" appVersion)"; GIT_REMOTE="$(json_get "$M" git.remote)"; GIT_COMMIT="$(json_get "$M" git.commit)"; GIT_BRANCH="$(json_get "$M" git.branch)"
KIND="$(json_get "$M" kind)"; N_USERS="$(json_get "$M" database.counts.users)"; N_TOR="$(json_get "$M" database.counts.torrents)"
ok "Sauvegarde du ${CREE:-?} · version ${VERSION:-?} · ${N_USERS:-?} membres · ${N_TOR:-?} torrents"
[ "$KIND" = "predeploy" ] && avert "C'est un instantané « avant mise à jour » : il contient la base mais pas les fichiers ni le code."

# ---------------------------------------------------------------- 3. vérification des empreintes
etape "Vérification de l'intégrité du contenu"
verifie() { # fichier attendu libellé
  [ -f "$1" ] || { avert "$3 : absent du paquet"; return 1; }
  [ -z "$2" ] && return 0
  [ "$(sha256 "$1")" = "$2" ] && ok "$3 intact" || fatal "$3 : empreinte différente, le paquet est corrompu."
}
verifie "$TMP/b/db.dump" "$(json_get "$M" database.sha256)" "Base de données"
for k in torrents covers chat-files lockdown; do [ -f "$TMP/b/files/$k.tar.gz" ] && verifie "$TMP/b/files/$k.tar.gz" "$(json_get "$M" "files.$k.sha256")" "Fichiers « $k »"; done
[ -f "$TMP/b/source.tar.gz" ] && verifie "$TMP/b/source.tar.gz" "$(json_get "$M" source.sha256)" "Code du site"
if [ "$VERIFIER" = 1 ]; then echo; echo "${G}${B}✓ Le paquet est lisible et intact. Rien n'a été installé (mode --verifier).${N}"; exit 0; fi

# ---------------------------------------------------------------- 4. Docker
etape "Vérification de Docker"
if [ "$SIMU" != 1 ]; then
  if ! command -v docker >/dev/null 2>&1; then
    if [ "$INSTALLER_DOCKER" = 1 ] && [ "$(uname -s)" = "Linux" ]; then
      echo "  Installation de Docker (get.docker.com)…"
      curl -fsSL https://get.docker.com | sh || fatal "L'installation de Docker a échoué."
    else
      fatal "Docker n'est pas installé. Sur Linux : relance avec --installer-docker (ou : curl -fsSL https://get.docker.com | sh). Windows / Mac : installe Docker Desktop. Synology : paquet « Container Manager »."
    fi
  fi
  docker info >/dev/null 2>&1 || fatal "Docker est installé mais ne répond pas (démarre-le ; sous Linux, essaie avec « sudo »)."
fi
if [ "$SIMU" = 1 ] || docker compose version >/dev/null 2>&1; then DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose"
else fatal "« docker compose » est introuvable (installe le plugin Compose, inclus dans Docker récent)."; fi
ok "Docker prêt (${DC})"

# ---------------------------------------------------------------- 5. dossier d'installation et confirmation
mkdir -p "$DOSSIER" 2>/dev/null || fatal "Impossible de créer $DOSSIER"
DOSSIER="$(cd "$DOSSIER" && pwd)"
etape "Installation dans : $DOSSIER"
if [ "$OUI" != 1 ] && [ "$SIMU" != 1 ]; then
  echo "  Cela va REMPLACER les données du site (base, fichiers) sur cette machine par celles de la sauvegarde du ${CREE:-?}."
  printf "  Continuer ? (oui/non) : "; read -r rep
  case "$rep" in oui|o|O|OUI|y|Y|yes) ;; *) fatal "Abandon : rien n'a été modifié." ;; esac
fi

# ---------------------------------------------------------------- 6. le code
etape "Code du site"
cd "$DOSSIER" || fatal "Impossible d'entrer dans $DOSSIER"
if [ -f docker-compose.yml ] && [ -d backend ]; then
  ok "Le code est déjà là."
else
  CODE_OK=0
  if [ -n "$GIT_REMOTE" ] && command -v git >/dev/null 2>&1 && [ "$SIMU" != 1 ]; then
    echo "  Récupération depuis $GIT_REMOTE …"
    TMPCLONE="$TMP/clone"
    if GIT_TERMINAL_PROMPT=0 git clone --quiet "$GIT_REMOTE" "$TMPCLONE" 2>/dev/null; then
      if [ "$DERNIERE" != 1 ] && [ -n "$GIT_COMMIT" ]; then
        git -C "$TMPCLONE" checkout --quiet -B "${GIT_BRANCH:-main}" "$GIT_COMMIT" 2>/dev/null && ok "Version exacte de la sauvegarde (${GIT_COMMIT:0:10})." || avert "Révision ${GIT_COMMIT:0:10} introuvable : dernière version utilisée."
      else ok "Dernière version du code."; fi
      cp -a "$TMPCLONE"/. "$DOSSIER"/ && CODE_OK=1
    else
      avert "Le dépôt git n'est pas accessible (privé, hors ligne ?) : on utilise la copie du code contenue dans le paquet."
    fi
  fi
  if [ "$CODE_OK" != 1 ]; then
    if [ "$SIMU" = 1 ]; then echo "  [simulation] extraction de source.tar.gz dans $DOSSIER"
    elif [ -f "$TMP/b/source.tar.gz" ]; then tar xzf "$TMP/b/source.tar.gz" -C "$DOSSIER" && ok "Code extrait du paquet."
    else fatal "Le code n'est ni accessible par git ni présent dans le paquet."; fi
  fi
fi

# ---------------------------------------------------------------- 7. configuration et secrets
etape "Configuration (.env)"
if [ -f "$TMP/b/config/env" ]; then lance cp "$TMP/b/config/env" "$DOSSIER/.env"; ok ".env racine restauré"
elif [ -f "$DOSSIER/.env" ]; then avert ".env absent du paquet : celui de la machine est conservé."
else avert ".env absent du paquet : un modèle est créé, À COMPLÉTER (mot de passe PostgreSQL...)."; [ -f "$DOSSIER/.env.example" ] && lance cp "$DOSSIER/.env.example" "$DOSSIER/.env"; fi
if [ -f "$TMP/b/config/backend.env" ]; then lance mkdir -p "$DOSSIER/backend"; lance cp "$TMP/b/config/backend.env" "$DOSSIER/backend/.env"; ok "backend/.env restauré (JWT_SECRET, SMTP, clés d'API)"
elif [ ! -f "$DOSSIER/backend/.env" ]; then avert "backend/.env absent du paquet : à recréer à partir de backend/.env.example (JWT_SECRET en particulier : sans l'ancien, les connexions et les mots de passe de seedbox enregistrés ne fonctionnent plus)."; fi
lance chmod 600 "$DOSSIER/.env" "$DOSSIER/backend/.env" 2>/dev/null || true
lance mkdir -p "$DOSSIER/backups/db" "$DOSSIER/backups/files" "$DOSSIER/backups/full"

# Variables PostgreSQL du .env
PGU=tracker; PGD=tracker
if [ -f "$DOSSIER/.env" ]; then
  v="$(grep -E '^POSTGRES_USER=' "$DOSSIER/.env" | tail -1 | cut -d= -f2- | tr -d '"'"'"' ')"; [ -n "$v" ] && PGU="$v"
  v="$(grep -E '^POSTGRES_DB=' "$DOSSIER/.env" | tail -1 | cut -d= -f2- | tr -d '"'"'"' ')"; [ -n "$v" ] && PGD="$v"
fi

# ---------------------------------------------------------------- 8. images Docker
etape "Images Docker"
if [ -n "$IMAGES" ]; then
  [ -f "$IMAGES" ] || fatal "Fichier d'images introuvable : $IMAGES"
  lance docker load -i "$IMAGES" && ok "Images chargées (installation sans internet)."
else
  echo "  Construction des images (quelques minutes la première fois ; internet requis)…"
  lance $DC build || fatal "La construction a échoué. Relis le message ci-dessus (réseau ? espace disque ?)."
  ok "Images construites."
fi

# ---------------------------------------------------------------- 9. base de données
etape "Base de données"
lance $DC up -d postgres || fatal "PostgreSQL ne démarre pas."
if [ "$SIMU" != 1 ]; then
  for i in $(seq 1 60); do $DC exec -T postgres pg_isready -U "$PGU" -d "$PGD" >/dev/null 2>&1 && break; sleep 2; [ "$i" = 60 ] && fatal "PostgreSQL ne répond pas après 2 minutes."; done
fi
ok "PostgreSQL prêt."
lance $DC stop backend frontend >/dev/null 2>&1 || true
if [ "$SIMU" = 1 ]; then
  echo "  [simulation] $DC exec -T postgres psql -U $PGU -d $PGD -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'"
  echo "  [simulation] $DC exec -T postgres pg_restore -U $PGU -d $PGD --no-owner --no-privileges < db.dump"
else
  $DC exec -T postgres psql -U "$PGU" -d "$PGD" -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' >/dev/null || fatal "Impossible de vider la base avant restauration."
  $DC exec -T postgres pg_restore -U "$PGU" -d "$PGD" --no-owner --no-privileges < "$TMP/b/db.dump" 2> "$TMP/pgrestore.log"
  code=$?
  [ "$code" -gt 1 ] && { tail -5 "$TMP/pgrestore.log"; fatal "pg_restore a échoué (code $code)."; }
  [ "$code" = 1 ] && avert "pg_restore a signalé des avertissements (sans gravité en général) : $(grep -c . "$TMP/pgrestore.log") ligne(s)."
  got="$($DC exec -T postgres psql -U "$PGU" -d "$PGD" -tAc 'SELECT count(*) FROM "User"' 2>/dev/null | tr -d '[:space:]')"
  if [ -n "$N_USERS" ] && [ "$got" != "$N_USERS" ]; then fatal "Contrôle raté : $got membres dans la base restaurée, $N_USERS attendus."; fi
  ok "Base restaurée et contrôlée : ${got} membres."
fi

# ---------------------------------------------------------------- 10. fichiers
etape "Fichiers (.torrent, pochettes, pièces jointes, coffre)"
if ls "$TMP/b/files/"*.tar.gz >/dev/null 2>&1 || [ "$SIMU" = 1 ]; then
  lance $DC run --rm --no-deps -v "$TMP/b/files:/restore:ro" --entrypoint sh backend -c '
    for k in torrents covers chat-files lockdown; do
      if [ -f "/restore/$k.tar.gz" ]; then mkdir -p "/app/storage/$k" && tar xzf "/restore/$k.tar.gz" -C "/app/storage/$k" && echo "  ✓ $k"; fi
    done' || fatal "La restauration des fichiers a échoué."
else
  avert "Ce paquet ne contient pas de fichiers (instantané avant mise à jour)."
fi

# ---------------------------------------------------------------- 11. démarrage
if [ "$SANS_DEMARRER" = 1 ]; then
  echo; echo "${G}${B}✓ Tout est prêt. Le site n'a pas été démarré (--sans-demarrer) : lance « cd $DOSSIER && $DC up -d » quand tu veux.${N}"; exit 0
fi
etape "Démarrage du site"
lance $DC up -d || fatal "Le démarrage a échoué."
if [ "$SIMU" != 1 ]; then
  echo "  Attente du site (la première fois, le démarrage prend 30 à 60 secondes)…"
  UP=0
  for i in $(seq 1 60); do
    if $DC exec -T backend node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/system/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then UP=1; break; fi
    sleep 3
  done
  [ "$UP" = 1 ] && ok "Le site répond." || { avert "Le site ne répond pas encore. Regarde les messages : $DC logs --tail=60 backend"; }
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"; [ -n "$IP" ] || IP="<adresse de cette machine>"
echo
echo "${G}${B}=== Terminé ===${N}"
echo "Le site tourne sur cette machine : http://${IP}:9098   (tracker : http://${IP}:9099)"
echo
echo "${B}Il reste 3 choses que seul toi peux faire :${N}"
echo "  1. Ton proxy (Nginx Proxy Manager, Caddy, Traefik...) : faire pointer ton nom de domaine vers cette machine (site → port 9098, tracker → port 9099) avec le certificat HTTPS."
echo "  2. Ton DNS : l'enregistrement A / AAAA de ton domaine doit désigner l'adresse publique de cette machine."
echo "  3. Si tu utilises les appels audio/vidéo : rouvrir les ports du serveur TURN (3478 et 49160-49200 en UDP) sur cette machine."
echo
echo "Pour mettre le site à jour plus tard : cd $DOSSIER && ./deploy.sh   (git doit être configuré sur cette machine)."
echo "Un guide complet est dans $DOSSIER/BACKUP.md."
