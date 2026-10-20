#!/usr/bin/env bash
# Installe un relais de diffusion en direct sur un serveur Debian / Ubuntu.
#
# Le serveur va chercher le flux UNE seule fois (chez toi, dans Dispatcharr), le découpe en HLS sans le ré-encoder,
# puis le sert aux spectateurs en HTTPS. Chez toi, il ne sort qu'un seul flux, peu importe le nombre de spectateurs.
#
# Utilisation (en root, sur le serveur relais) :
#   sudo bash installer-relais.sh              # pose les questions
#   sudo bash installer-relais.sh --desinstaller
#
# On peut aussi tout donner d'avance (aucune question) :
#   STREAM_URL="http://100.x.y.z:9191/proxy/ts/stream/ID" DOMAINE="relais.exemple.com" COURRIEL="moi@exemple.com" sudo -E bash installer-relais.sh

set -euo pipefail

SERVICE="relais-live"
DOSSIER_WEB="/var/www/relais-live"
CONF_DIR="/etc/relais-live"
CONF_NGINX="/etc/nginx/conf.d/relais-live.conf"

if [ "$(id -u)" -ne 0 ]; then echo "Lance ce script en root : sudo bash $0"; exit 1; fi

if [ "${1:-}" = "--desinstaller" ]; then
  systemctl disable --now "$SERVICE" 2>/dev/null || true
  rm -f "/etc/systemd/system/$SERVICE.service" "$CONF_NGINX"
  rm -rf "$CONF_DIR" "$DOSSIER_WEB"
  systemctl daemon-reload
  systemctl reload nginx 2>/dev/null || true
  echo "Relais désinstallé (ffmpeg, nginx et le certificat HTTPS sont laissés en place)."
  exit 0
fi

demander() { # demander "Question" VARIABLE [défaut]
  local question="$1" var="$2" defaut="${3:-}" reponse=""
  if [ -n "${!var:-}" ]; then return; fi
  if [ -n "$defaut" ]; then read -r -p "$question [$defaut] : " reponse || true; reponse="${reponse:-$defaut}"
  else read -r -p "$question : " reponse || true; fi
  printf -v "$var" '%s' "$reponse"
}

echo "=== Relais de diffusion en direct ==="

# 1. Tailscale (facultatif) : relie ce serveur à ta maison sans ouvrir de port sur ton routeur.
if ! command -v tailscale >/dev/null 2>&1; then
  demander "Installer Tailscale pour joindre ton Dispatcharr sans ouvrir de port ? (o/n)" TAILSCALE "o"
  if [ "${TAILSCALE,,}" = "o" ]; then
    curl -fsSL https://tailscale.com/install.sh | sh
    echo ""
    echo ">>> Ouvre le lien affiché ci-dessous pour autoriser ce serveur (mêmes comptes que la machine de chez toi)."
    tailscale up
    echo ">>> Adresse Tailscale de ce serveur : $(tailscale ip -4 | head -n1)"
    echo ">>> Pour la machine de Dispatcharr, utilise son adresse Tailscale (100.x.y.z) : visible avec « tailscale status »."
  fi
fi

echo ""
demander "Adresse du flux chez toi (ex. http://100.x.y.z:9191/proxy/ts/stream/ID-DU-CANAL)" STREAM_URL
demander "Nom de domaine de ce relais (ex. relais.exemple.com, qui doit déjà pointer vers ce serveur)" DOMAINE
demander "Courriel pour le certificat HTTPS (avis d'expiration seulement)" COURRIEL

case "$STREAM_URL" in http://*|https://*|rtmp://*|rtsp://*|srt://*|udp://*) ;; *) echo "L'adresse du flux doit commencer par http://, https://, rtmp://, rtsp://, srt:// ou udp://"; exit 1;; esac
case "$STREAM_URL" in *\"*|*\ *) echo "L'adresse du flux ne doit contenir ni espace ni guillemet."; exit 1;; esac
[ -n "$DOMAINE" ] || { echo "Il faut un nom de domaine."; exit 1; }

# 2. Programmes nécessaires.
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ffmpeg nginx certbot python3-certbot-nginx curl

# 3. Dossier de diffusion + petite page de test (lecteur dans le navigateur).
mkdir -p "$DOSSIER_WEB" "$CONF_DIR"
chown -R www-data:www-data "$DOSSIER_WEB"
cat > "$DOSSIER_WEB/index.html" <<'HTML'
<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Direct</title>
<style>body{margin:0;background:#000;display:grid;place-items:center;min-height:100vh;font-family:sans-serif;color:#ccc}video{width:100%;max-height:100vh}</style></head>
<body><video id="v" controls autoplay muted playsinline></video><script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js"></script>
<script>const v=document.getElementById('v'),src='/live/event.m3u8';
if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=src}else if(window.Hls&&Hls.isSupported()){const h=new Hls({liveSyncDurationCount:3});h.loadSource(src);h.attachMedia(v)}</script></body></html>
HTML

# Les options de reconnexion ne valent que pour les flux http(s).
case "$STREAM_URL" in http://*|https://*) RECO="-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 10";; *) RECO="";; esac

# 4. Le service qui va chercher le flux (adresse gardée dans un fichier lisible par root seulement : elle peut contenir un jeton).
umask 077
printf 'STREAM_URL=%s\n' "$STREAM_URL" > "$CONF_DIR/env"
umask 022
cat > "/etc/systemd/system/$SERVICE.service" <<UNIT
[Unit]
Description=Relais du flux en direct (ffmpeg vers HLS)
After=network-online.target
Wants=network-online.target

[Service]
User=www-data
EnvironmentFile=$CONF_DIR/env
ExecStart=/usr/bin/ffmpeg -nostdin -loglevel warning $RECO -i \${STREAM_URL} -c copy -f hls -hls_time 4 -hls_list_size 6 -hls_flags delete_segments+omit_endlist $DOSSIER_WEB/event.m3u8
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

# 5. Nginx : sert les petits morceaux vidéo sans les garder en cache.
cat > "$CONF_NGINX" <<NGINX
server {
    listen 80;
    server_name $DOMAINE;
    root $DOSSIER_WEB;

    location /live/ {
        alias $DOSSIER_WEB/;
        add_header Cache-Control "no-cache";
        add_header Access-Control-Allow-Origin "*";
        types { application/vnd.apple.mpegurl m3u8; video/mp2t ts; }
    }
}
NGINX

systemctl daemon-reload
systemctl enable --now "$SERVICE"
nginx -t
systemctl reload nginx

# 6. HTTPS (si le nom de domaine pointe déjà vers ce serveur ; sinon on continue en HTTP).
PROTO="http"
if certbot --nginx -d "$DOMAINE" --non-interactive --agree-tos -m "${COURRIEL:-admin@$DOMAINE}" --redirect; then PROTO="https"
else echo "!! Le certificat HTTPS n'a pas pu être obtenu (le nom de domaine pointe-t-il vers ce serveur ?). Relance « certbot --nginx -d $DOMAINE » plus tard."; fi

sleep 8
echo ""
echo "=== Terminé ==="
echo "État du relais      : $(systemctl is-active $SERVICE)   (journal : journalctl -u $SERVICE -f)"
if [ -s "$DOSSIER_WEB/event.m3u8" ]; then echo "Flux reçu           : oui"; else echo "Flux reçu           : pas encore (vérifie le journal ci-dessus : l'adresse du flux est-elle joignable depuis ce serveur ?)"; fi
echo "Lien du flux        : $PROTO://$DOMAINE/live/event.m3u8   (à ouvrir dans VLC ou à mettre dans un lecteur)"
echo "Page de test        : $PROTO://$DOMAINE/"
