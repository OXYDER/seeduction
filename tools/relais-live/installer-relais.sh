#!/usr/bin/env bash
# Installe un relais de diffusion en direct sur un serveur Debian / Ubuntu, pour un ou plusieurs flux, À LA DEMANDE.
#
# Un flux n'est connecté à ton Dispatcharr (chez toi) que lorsqu'un lecteur le réclame : le premier spectateur déclenche la connexion
# (quelques secondes d'attente), et le flux est coupé tout seul environ une minute après le départ du dernier spectateur.
# Tant que personne ne regarde, rien ne sort de chez toi. Pendant qu'on regarde, il ne sort qu'un flux par canal, peu importe le nombre de spectateurs.
# Le flux est découpé en HLS sans ré-encodage, puis servi en HTTPS.
#
# Utilisation (en root, sur le serveur relais) :
#   sudo bash installer-relais.sh                       installation (pose les questions : domaine, puis un ou plusieurs flux)
#   sudo bash installer-relais.sh --ajouter NOM URL     ajoute un flux (ex. --ajouter salle2 http://100.x.y.z:9191/proxy/ts/stream/ID)
#   sudo bash installer-relais.sh --retirer NOM         retire un flux
#   sudo bash installer-relais.sh --lister              liste les flux et leur état (connecté / en veille)
#   sudo bash installer-relais.sh --desinstaller        retire tout
#
# Chaque flux a son lien : https://DOMAINE/live/NOM/index.m3u8 (page de test : https://DOMAINE/?flux=NOM).

set -euo pipefail

DOSSIER_WEB="/var/www/relais-live"
CONF_DIR="/etc/relais-live"
CONF_NGINX="/etc/nginx/conf.d/relais-live.conf"
UNITE="/etc/systemd/system/relais-live@.service"
DEMANDE_BIN="/usr/local/bin/relais-live-demande"
DEMANDE_UNITE="/etc/systemd/system/relais-live-demande.service"

if [ "$(id -u)" -ne 0 ]; then echo "Lance ce script en root : sudo bash $0"; exit 1; fi

nom_valide() { [[ "$1" =~ ^[a-z0-9][a-z0-9-]{0,30}$ ]]; }

url_valide() {
  case "$1" in http://*|https://*|rtmp://*|rtsp://*|srt://*|udp://*) ;; *) echo "L'adresse du flux doit commencer par http://, https://, rtmp://, rtsp://, srt:// ou udp://"; return 1;; esac
  case "$1" in *\"*|*\ *) echo "L'adresse du flux ne doit contenir ni espace ni guillemet."; return 1;; esac
}

domaine() { cat "$CONF_DIR/domaine" 2>/dev/null || true; }
protocole() { if [ -d "/etc/letsencrypt/live/$(domaine)" ]; then echo https; else echo http; fi; }

ecrire_unite() {
  cat > "$UNITE" <<'UNIT'
[Unit]
Description=Relais du flux en direct %i (ffmpeg vers HLS)
After=network-online.target
Wants=network-online.target

[Service]
User=www-data
EnvironmentFile=/etc/relais-live/%i.env
ExecStart=/usr/bin/ffmpeg -nostdin -loglevel warning $RECO -i ${STREAM_URL} -c copy -f hls -hls_time 4 -hls_list_size 6 -hls_flags delete_segments+omit_endlist /var/www/relais-live/%i/index.m3u8
Restart=always
RestartSec=5
UNIT
  systemctl daemon-reload
}

# Le petit service qui démarre un flux quand un lecteur le demande et l'arrête quand plus personne ne regarde.
ecrire_service_demande() {
  cat > "$DEMANDE_BIN" <<'PYTHON'
#!/usr/bin/env python3
"""Démarre un flux à la demande : une requête sur /live/NOM/index.m3u8 lance ffmpeg (si ce n'est pas déjà fait) et attend le premier morceau.
Un lecteur redemande la liste toutes les quelques secondes tant qu'il regarde : sans demande pendant IDLE secondes, le flux est coupé."""
import os, re, subprocess, threading, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

CONF, WEB = "/etc/relais-live", "/var/www/relais-live"
IDLE, WAIT = 60, 22
CHEMIN = re.compile(r"^/live/([a-z0-9][a-z0-9-]{0,30})/index\.m3u8$")
last, locks, guard = {}, {}, threading.Lock()


def verrou(n):
    with guard:
        return locks.setdefault(n, threading.Lock())


def actif(n):
    return subprocess.run(["systemctl", "is-active", "--quiet", "relais-live@" + n]).returncode == 0


def vider(n):
    d = os.path.join(WEB, n)
    if os.path.isdir(d):
        for f in os.listdir(d):
            try:
                os.remove(os.path.join(d, f))
            except OSError:
                pass


def demarrer(n):
    with verrou(n):
        if not actif(n):
            vider(n)  # pas de vieux morceaux d'une diffusion précédente
            subprocess.run(["systemctl", "start", "--no-block", "relais-live@" + n])


def couper_les_inactifs():
    while True:
        time.sleep(10)
        for n, t in list(last.items()):
            if time.time() - t > IDLE:
                with verrou(n):
                    if time.time() - last.get(n, 0) > IDLE:
                        subprocess.run(["systemctl", "stop", "relais-live@" + n])
                        vider(n)
                        last.pop(n, None)


class Demande(BaseHTTPRequestHandler):
    def repondre(self, code, corps, type_="text/plain; charset=utf-8", extra=None):
        self.send_response(code)
        self.send_header("Content-Type", type_)
        self.send_header("Content-Length", str(len(corps)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(corps)

    def do_GET(self):
        m = CHEMIN.match(self.path.split("?")[0])
        if not m or not os.path.exists(os.path.join(CONF, m.group(1) + ".env")):
            return self.repondre(404, "Flux inconnu".encode())
        n = m.group(1)
        last[n] = time.time()
        demarrer(n)
        fichier, fin = os.path.join(WEB, n, "index.m3u8"), time.time() + WAIT
        while time.time() < fin:
            if os.path.exists(fichier) and actif(n):
                try:
                    data = open(fichier, "rb").read()
                except OSError:
                    data = b""
                if data:
                    last[n] = time.time()
                    return self.repondre(200, data, "application/vnd.apple.mpegurl")
            time.sleep(0.5)
        self.repondre(503, "Flux en cours de demarrage".encode(), extra={"Retry-After": "3"})

    do_HEAD = do_GET

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    threading.Thread(target=couper_les_inactifs, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", 8099), Demande).serve_forever()
PYTHON
  chmod 755 "$DEMANDE_BIN"
  cat > "$DEMANDE_UNITE" <<UNIT
[Unit]
Description=Démarrage des flux en direct à la demande
After=network.target

[Service]
ExecStart=$DEMANDE_BIN
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable --now relais-live-demande >/dev/null 2>&1
  systemctl restart relais-live-demande
}

ajouter_flux() { # ajouter_flux NOM URL
  local nom="$1" url="$2"
  nom_valide "$nom" || { echo "Nom invalide « $nom » : lettres minuscules, chiffres et tirets seulement (ex. salle2)."; return 1; }
  url_valide "$url" || return 1
  [ -f "$UNITE" ] || ecrire_unite
  mkdir -p "$DOSSIER_WEB/$nom" "$CONF_DIR"
  chown -R www-data:www-data "$DOSSIER_WEB/$nom"
  # Les options de reconnexion ne valent que pour les flux http(s). L'adresse est gardée lisible par root seulement : elle peut contenir un jeton.
  local reco=""
  case "$url" in http://*|https://*) reco="-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 10";; esac
  ( umask 077; printf 'STREAM_URL=%s\nRECO=%s\n' "$url" "$reco" > "$CONF_DIR/$nom.env" )
  # Pas de démarrage ici : le flux se connecte à la première demande d'un lecteur.
  systemctl stop "relais-live@$nom" 2>/dev/null || true
  echo "Flux « $nom » prêt (se connecte à la demande) : $(protocole)://$(domaine)/live/$nom/index.m3u8"
}

lister_flux() {
  local trouve=0
  for f in "$CONF_DIR"/*.env; do
    [ -e "$f" ] || continue
    trouve=1
    local nom etat; nom="$(basename "$f" .env)"
    if systemctl is-active --quiet "relais-live@$nom"; then etat="connecté (quelqu'un regarde)"; else etat="en veille (se connecte à la demande)"; fi
    echo "$nom : $etat → $(protocole)://$(domaine)/live/$nom/index.m3u8"
  done
  [ "$trouve" = 1 ] || echo "Aucun flux installé."
}

case "${1:-}" in
  --ajouter)
    [ $# -eq 3 ] || { echo "Utilisation : $0 --ajouter NOM URL"; exit 1; }
    [ -n "$(domaine)" ] || { echo "Le relais n'est pas encore installé : lance d'abord « sudo bash $0 »."; exit 1; }
    ajouter_flux "$2" "$3"; exit $? ;;
  --retirer)
    [ $# -eq 2 ] || { echo "Utilisation : $0 --retirer NOM"; exit 1; }
    nom_valide "$2" || { echo "Nom invalide."; exit 1; }
    systemctl stop "relais-live@$2" 2>/dev/null || true
    rm -rf "$CONF_DIR/$2.env" "$DOSSIER_WEB/$2"
    echo "Flux « $2 » retiré."; exit 0 ;;
  --lister) lister_flux; exit 0 ;;
  --desinstaller)
    for f in "$CONF_DIR"/*.env; do [ -e "$f" ] && systemctl stop "relais-live@$(basename "$f" .env)" 2>/dev/null || true; done
    systemctl disable --now relais-live-demande 2>/dev/null || true
    rm -f "$UNITE" "$DEMANDE_UNITE" "$DEMANDE_BIN" "$CONF_NGINX"; rm -rf "$CONF_DIR" "$DOSSIER_WEB"
    systemctl daemon-reload; systemctl reload nginx 2>/dev/null || true
    echo "Relais désinstallé (ffmpeg, nginx et le certificat HTTPS sont laissés en place)."; exit 0 ;;
  "") ;;
  *) echo "Option inconnue : $1 (voir l'en-tête du script)"; exit 1 ;;
esac

demander() { # demander "Question" VARIABLE [défaut]
  local question="$1" var="$2" defaut="${3:-}" reponse=""
  if [ -n "${!var:-}" ]; then return; fi
  if [ -n "$defaut" ]; then read -r -p "$question [$defaut] : " reponse || true; reponse="${reponse:-$defaut}"
  else read -r -p "$question : " reponse || true; fi
  printf -v "$var" '%s' "$reponse"
}

echo "=== Relais de diffusion en direct (à la demande) ==="

# 1. Tailscale (facultatif) : relie ce serveur à ta maison sans ouvrir de port sur ton routeur.
if ! command -v tailscale >/dev/null 2>&1; then
  demander "Installer Tailscale pour joindre ton Dispatcharr sans ouvrir de port ? (o/n)" TAILSCALE "o"
  if [ "${TAILSCALE,,}" = "o" ]; then
    curl -fsSL https://tailscale.com/install.sh | sh
    echo ""
    echo ">>> Ouvre le lien affiché ci-dessous pour autoriser ce serveur (mêmes comptes que la machine de chez toi)."
    tailscale up
    echo ">>> Pour la machine de Dispatcharr, utilise son adresse Tailscale (100.x.y.z) : visible avec « tailscale status »."
  fi
fi

echo ""
demander "Nom de domaine de ce relais (ex. relais.exemple.com, qui doit déjà pointer vers ce serveur)" DOMAINE
demander "Courriel pour le certificat HTTPS (avis d'expiration seulement)" COURRIEL
[ -n "$DOMAINE" ] || { echo "Il faut un nom de domaine."; exit 1; }

# 2. Programmes nécessaires.
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ffmpeg nginx certbot python3-certbot-nginx python3 curl

# 3. Dossier de diffusion + page de test (lecteur dans le navigateur : /?flux=NOM). La page attend patiemment le démarrage du flux.
mkdir -p "$DOSSIER_WEB" "$CONF_DIR"
printf '%s' "$DOMAINE" > "$CONF_DIR/domaine"
cat > "$DOSSIER_WEB/index.html" <<'HTML'
<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Direct</title>
<style>body{margin:0;background:#000;display:grid;place-items:center;min-height:100vh;font-family:sans-serif;color:#ccc}video{width:100%;max-height:100vh}</style></head>
<body><video id="v" controls autoplay muted playsinline></video><script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js"></script>
<script>const nom=(new URLSearchParams(location.search).get('flux')||'').replace(/[^a-z0-9-]/g,'')||'event';
const v=document.getElementById('v'),src='/live/'+nom+'/index.m3u8';
if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=src}else if(window.Hls&&Hls.isSupported()){const h=new Hls({liveSyncDurationCount:3,manifestLoadingTimeOut:30000,manifestLoadingMaxRetry:6,manifestLoadingRetryDelay:2000});h.loadSource(src);h.attachMedia(v)}</script></body></html>
HTML

# 4. Le service de démarrage à la demande.
ecrire_service_demande
[ -f "$UNITE" ] || ecrire_unite

# 5. Nginx : la liste de lecture (index.m3u8) passe par le service de démarrage à la demande ; les petits morceaux vidéo sont servis directement, sans cache.
cat > "$CONF_NGINX" <<'NGINX'
server {
    listen 80;
    server_name @DOMAINE@;
    root @WEB@;

    location ~ ^/live/[a-z0-9-]+/index\.m3u8$ {
        proxy_pass http://127.0.0.1:8099;
        proxy_read_timeout 40s;
        add_header Cache-Control "no-cache" always;
        add_header Access-Control-Allow-Origin "*" always;
    }

    location /live/ {
        alias @WEB@/;
        add_header Cache-Control "no-cache";
        add_header Access-Control-Allow-Origin "*";
        types { application/vnd.apple.mpegurl m3u8; video/mp2t ts; }
    }
}
NGINX
sed -i "s#@DOMAINE@#$DOMAINE#g; s#@WEB@#$DOSSIER_WEB#g" "$CONF_NGINX"
nginx -t
systemctl reload nginx

# 6. HTTPS (si le nom de domaine pointe déjà vers ce serveur ; sinon on continue en HTTP).
if ! certbot --nginx -d "$DOMAINE" --non-interactive --agree-tos -m "${COURRIEL:-admin@$DOMAINE}" --redirect; then
  echo "!! Le certificat HTTPS n'a pas pu être obtenu (le nom de domaine pointe-t-il vers ce serveur ?). Relance « certbot --nginx -d $DOMAINE » plus tard."
fi

# 7. Les flux : un nom et une adresse pour chacun (ligne vide pour terminer). On peut aussi en ajouter plus tard avec --ajouter.
echo ""
echo "=== Les flux à relayer ==="
if [ -n "${STREAM_URL:-}" ]; then ajouter_flux "${NOM_FLUX:-event}" "$STREAM_URL"; else
  while true; do
    NOM=""; URL=""
    read -r -p "Nom du flux (ex. salle1, sans espace ; vide pour terminer) : " NOM || true
    [ -n "$NOM" ] || break
    nom_valide "$NOM" || { echo "Nom invalide : lettres minuscules, chiffres et tirets seulement."; continue; }
    read -r -p "Adresse du flux « $NOM » dans Dispatcharr (ex. http://100.x.y.z:9191/proxy/ts/stream/ID-DU-CANAL) : " URL || true
    ajouter_flux "$NOM" "$URL" || true
  done
fi

echo ""
echo "=== Terminé ==="
lister_flux
echo "Les flux restent en veille : ils se connectent à ton Dispatcharr seulement quand quelqu'un ouvre le lien, et se coupent environ une minute après son départ."
echo "Page de test : $(protocole)://$DOMAINE/?flux=NOM  (compte quelques secondes avant que l'image apparaisse la première fois)"
echo "Pour ajouter un flux plus tard : sudo bash $0 --ajouter NOM URL"
