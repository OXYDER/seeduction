#!/usr/bin/env bash
# Installe un relais de diffusion en direct sur un serveur Debian / Ubuntu.
#
# CANAL DU SITE (Admin > Direct) : le site te donne un calendrier ; il dit au relais quel flux de ton Dispatcharr diffuser à chaque moment, par une API
# protégée par un secret. Le relais publie le tout sous UNE adresse secrète. En mode « à la demande », il ne se connecte à ton Dispatcharr que lorsqu'un
# spectateur regarde (quelques secondes d'attente au début) et se coupe environ une minute après le dernier ; en mode « continu », il reste connecté pendant tout le créneau.
# COMPATIBILITÉ NAVIGATEUR : par défaut, le relais convertit le son en AAC stéréo et conserve l'image (un navigateur ne lit pas l'AC3, l'E-AC3, le DTS…). Le site peut aussi demander « copy » (tel quel) ou « full » (image et son : H.264 + AAC).
# FLUX MANUELS (facultatif, --ajouter) : des flux nommés, toujours à la demande ; le site ne les utilise pas.
# Pendant qu'on regarde, il ne sort de chez toi qu'un flux par canal, peu importe le nombre de spectateurs. Le flux est découpé en HLS sans ré-encodage, puis servi en HTTPS.
#
# Les ports HTTP (80) et HTTPS (443) sont demandés : si un autre programme les occupe, le script le dit et propose d'autres ports (8080 / 8443).
#
# Utilisation (en root, sur le serveur relais) :
#   sudo bash installer-relais.sh                       installation (pose les questions : domaine, puis un ou plusieurs flux)
#   sudo bash installer-relais.sh --ajouter NOM URL     ajoute un flux (ex. --ajouter salle2 http://100.x.y.z:9191/proxy/ts/stream/ID)
#   sudo bash installer-relais.sh --retirer NOM         retire un flux
#   sudo bash installer-relais.sh --lister              liste les flux et leur état (connecté / en veille)
#   sudo bash installer-relais.sh --infos               réaffiche ce qu'il faut copier dans le site (adresse de contrôle, secret, adresse du flux)
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
protocole() { if [ -f "$CONF_DIR/proxy" ] || [ -d "/etc/letsencrypt/live/$(domaine)" ]; then echo https; else echo http; fi; }
lire_port() { local v; v="$(cat "$CONF_DIR/$1" 2>/dev/null || true)"; echo "${v:-$2}"; }
# Adresse de base du relais, avec le port s'il n'est pas le port habituel (80 en HTTP, 443 en HTTPS).
base_url() {
  local d; d="$(domaine)"
  if [ -f "$CONF_DIR/proxy" ]; then echo "https://$d"  # HTTPS géré par un proxy placé devant (adresse publique, sans port)
  elif [ "$(protocole)" = https ]; then local p; p="$(lire_port port_https 443)"; [ "$p" = 443 ] && echo "https://$d" || echo "https://$d:$p"
  else local p; p="$(lire_port port_http 80)"; [ "$p" = 80 ] && echo "http://$d" || echo "http://$d:$p"; fi
}
# Qui écoute sur ce port (autre que nginx) ? Vide = libre pour nous.
port_occupe() { ss -ltnpH "sport = :$1" 2>/dev/null | grep -v '"nginx"' || true; }

ecrire_unite() {
  cat > "$UNITE" <<'UNIT'
[Unit]
Description=Relais du flux en direct %i (ffmpeg vers HLS)
After=network-online.target
Wants=network-online.target

[Service]
User=www-data
EnvironmentFile=/etc/relais-live/%i.env
ExecStart=/usr/bin/ffmpeg -nostdin -hide_banner -loglevel warning $RECO -i ${STREAM_URL} $CODEC -f hls -hls_time 4 -hls_list_size 6 -hls_flags delete_segments+omit_endlist+append_list+discont_start /var/www/relais-live/%i/index.m3u8
Restart=always
RestartSec=5
UNIT
  systemctl daemon-reload
}

# Le petit service qui démarre un flux quand un lecteur le demande et l'arrête quand plus personne ne regarde.
ecrire_service_demande() {
  cat > "$DEMANDE_BIN" <<'PYTHON'
#!/usr/bin/env python3
"""Service du relais : (1) reçoit du site le flux à diffuser (API /controle, protégée par un secret) ; (2) démarre un flux quand un lecteur le demande et l'arrête
quand plus personne ne regarde (flux « à la demande »).

Le canal du site (nom secret dans /etc/relais-live/canal) change de source selon le calendrier : le site envoie l'adresse du flux voulu (ou « rien »), en mode
« à la demande » (connecté seulement quand quelqu'un regarde) ou « continu » (connecté pendant tout le créneau)."""
import hmac, json, os, re, shutil, subprocess, threading, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

CONF, WEB = "/etc/relais-live", "/var/www/relais-live"
IDLE, WAIT = 60, 22
CHEMIN = re.compile(r"^/live/([a-z0-9][a-z0-9-]{0,30})/index\.m3u8$")
# Compatibilité navigateur : un navigateur lit H.264 + AAC. « audio » ne convertit que le son (léger), « full » convertit aussi l'image (demande du processeur).
CODECS = {
    "copy": "-c copy",
    "audio": "-map 0:v:0 -map 0:a:0? -c:v copy -c:a aac -b:a 128k -ac 2 -af aresample=async=1",
    "full": "-map 0:v:0 -map 0:a:0? -c:v libx264 -preset veryfast -profile:v main -pix_fmt yuv420p -force_key_frames expr:gte(t,n_forced*4) -c:a aac -b:a 128k -ac 2 -af aresample=async=1",
}
URL_OK = re.compile(r"^(https?|rtmp|rtsp|srt|udp)://[^\s\"'\\]+$", re.I)
last, locks, guard = {}, {}, threading.Lock()


def lire(nom, defaut=""):
    try:
        with open(os.path.join(CONF, nom)) as f:
            return f.read().strip()
    except OSError:
        return defaut


def etat():
    try:
        with open(os.path.join(CONF, "etat.json")) as f:
            e = json.load(f)
        return {"url": e.get("url"), "surdemande": bool(e.get("surdemande", True)), "transcode": e.get("transcode") or "audio"}
    except (OSError, ValueError):
        return {"url": None, "surdemande": True, "transcode": "audio"}


def ecrire_etat(url, surdemande, transcode="audio"):
    with open(os.path.join(CONF, "etat.json"), "w") as f:
        json.dump({"url": url, "surdemande": surdemande, "transcode": transcode}, f)


def verrou(n):
    with guard:
        return locks.setdefault(n, threading.RLock())


def systemctl(*args):
    return subprocess.run(["systemctl", *args])


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
            systemctl("start", "--no-block", "relais-live@" + n)


def ecrire_env(n, url, transcode="audio"):
    """Adresse du flux gardée lisible par root seulement (elle peut contenir un jeton)."""
    # Analyse plus longue de la source : dans un flux IPTV (MPEG-TS), la piste audio est souvent repérée trop tard avec les réglages par défaut
    # de ffmpeg, qui la laisse alors tomber sans erreur (vidéo muette, surtout en mode « audio » où sa présence est facultative : 0:a:0?).
    reco = "-analyzeduration 10000000 -probesize 10000000"
    if url.lower().startswith(("http://", "https://")):
        reco += " -reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 10"
    fd = os.open(os.path.join(CONF, n + ".env"), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write("STREAM_URL=%s\nRECO=%s\nCODEC=%s\n" % (url, reco, CODECS.get(transcode, CODECS["audio"])))
    dossier = os.path.join(WEB, n)
    os.makedirs(dossier, exist_ok=True)
    try:
        shutil.chown(dossier, "www-data", "www-data")
    except (LookupError, OSError):
        pass


def appliquer(url, surdemande, transcode="audio"):
    """Règle le canal du site : url = adresse du flux à diffuser, ou None pour ne rien diffuser ; transcode = audio (par défaut) | copy | full."""
    n = lire("canal")
    if not n:
        raise ValueError("canal non initialisé")
    with verrou(n):
        ancien = etat()
        env = os.path.join(CONF, n + ".env")
        if not url:
            systemctl("stop", "relais-live@" + n)
            vider(n)
            last.pop(n, None)
            try:
                os.remove(env)
            except OSError:
                pass
            ecrire_etat(None, surdemande, transcode)
            return
        change = ancien["url"] != url or ancien["transcode"] != transcode or not os.path.exists(env)
        if change:
            ecrire_env(n, url, transcode)
        ecrire_etat(url, surdemande, transcode)
        if actif(n):
            if change:
                systemctl("restart", "relais-live@" + n)  # on garde la liste de lecture : le lecteur enchaîne avec une coupure
            if surdemande:
                last.setdefault(n, time.time())  # surveillé pour l'arrêt quand plus personne ne regarde
        elif not surdemande:
            vider(n)
            systemctl("start", "--no-block", "relais-live@" + n)


def couper_les_inactifs():
    while True:
        time.sleep(10)
        for n, t in list(last.items()):
            if n == lire("canal") and not etat()["surdemande"]:
                last.pop(n, None)  # mode continu : jamais coupé faute de spectateurs
                continue
            if time.time() - t > IDLE:
                with verrou(n):
                    if time.time() - last.get(n, 0) > IDLE:
                        systemctl("stop", "relais-live@" + n)
                        vider(n)
                        last.pop(n, None)


class Demande(BaseHTTPRequestHandler):
    def repondre(self, code, corps, type_="text/plain; charset=utf-8", extra=None):
        if isinstance(corps, (dict, list)):
            corps, type_ = json.dumps(corps).encode(), "application/json"
        elif isinstance(corps, str):
            corps = corps.encode()
        self.send_response(code)
        self.send_header("Content-Type", type_)
        self.send_header("Content-Length", str(len(corps)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(corps)

    def autorise(self):
        s = lire("secret")
        fourni = self.headers.get("Authorization", "")
        return bool(s) and hmac.compare_digest(fourni.encode(), ("Bearer " + s).encode())

    def controle(self):
        if not self.autorise():
            return self.repondre(401, "Secret refuse")
        chemin = self.path.split("?")[0]
        if self.command == "GET" and chemin == "/controle/etat":
            n, e = lire("canal"), etat()
            d = last.get(n)
            return self.repondre(200, {"canal": bool(n), "configure": bool(e["url"]), "surdemande": e["surdemande"], "transcode": e["transcode"] or "audio", "actif": bool(n) and actif(n), "derniere_demande_il_y_a": None if d is None else int(time.time() - d)})
        if self.command == "PUT" and chemin == "/controle/source":
            longueur = int(self.headers.get("Content-Length") or 0)
            if longueur > 4096:
                return self.repondre(413, "Trop gros")
            try:
                corps = json.loads(self.rfile.read(longueur) or b"{}")
                url, surdemande, transcode = corps.get("url"), bool(corps.get("onDemand", True)), corps.get("transcode", "audio")
            except (ValueError, AttributeError):
                return self.repondre(400, "JSON invalide")
            if transcode not in CODECS:
                return self.repondre(400, "Mode de conversion inconnu")
            if url is not None and (not isinstance(url, str) or len(url) > 1000 or not URL_OK.match(url)):
                return self.repondre(400, "Adresse de flux invalide")
            try:
                appliquer(url, surdemande, transcode)
            except ValueError as e:
                return self.repondre(409, str(e))
            return self.repondre(200, {"ok": True, "diffusion": bool(url)})
        self.repondre(404, "Inconnu")

    def do_PUT(self):
        if self.path.startswith("/controle/"):
            return self.controle()
        self.repondre(404, "Inconnu")

    def do_GET(self):
        if self.path.startswith("/controle/"):
            return self.controle()
        m = CHEMIN.match(self.path.split("?")[0])
        if not m or not os.path.exists(os.path.join(CONF, m.group(1) + ".env")):
            return self.repondre(404, "Aucune diffusion en cours")
        n = m.group(1)
        continu = n == lire("canal") and not etat()["surdemande"]
        if not continu:
            last[n] = time.time()
        demarrer(n)  # sans effet si déjà connecté (en mode continu : reprend aussi après un redémarrage du serveur)
        fichier, fin = os.path.join(WEB, n, "index.m3u8"), time.time() + WAIT
        while time.time() < fin:
            if os.path.exists(fichier) and actif(n):
                try:
                    data = open(fichier, "rb").read()
                except OSError:
                    data = b""
                if data:
                    if not continu:
                        last[n] = time.time()
                    return self.repondre(200, data, "application/vnd.apple.mpegurl")
            time.sleep(0.5)
        self.repondre(503, "Flux en cours de demarrage", extra={"Retry-After": "3"})

    do_HEAD = do_GET

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    e = etat()
    if e["url"] and not e["surdemande"]:  # après un redémarrage du serveur : on reprend le direct en cours
        try:
            appliquer(e["url"], False, e["transcode"] or "audio")
        except Exception:
            pass
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

afficher_proxy() {
  [ -f "$CONF_DIR/proxy" ] || return 0
  echo ""
  echo "=== Réglage de ton proxy (Nginx Proxy Manager) ==="
  echo "Proxy Hosts > Add Proxy Host :"
  echo "  • Domain Names   : $(domaine)"
  echo "  • Scheme         : http"
  echo "  • Forward Host   : l'adresse de CE serveur, vue depuis ton proxy (ex. 192.168.x.x ou son IP)"
  echo "  • Forward Port   : $(lire_port port_http 8080)"
  echo "  • Cache Assets : désactivé · Block Common Exploits : au choix · Websockets : inutile"
  echo "  • Onglet SSL     : demande un certificat (Request a new SSL Certificate) et coche Force SSL"
  echo "  • Onglet Advanced (si le premier spectateur attend trop) : proxy_read_timeout 60s;"
  echo "  Si ce serveur et le proxy sont sur des machines différentes, autorise le port $(lire_port port_http 8080) dans le pare-feu de ce serveur, pour l'adresse du proxy seulement."
}

afficher_infos() {
  local d c; d="$(domaine)"; c="$(cat "$CONF_DIR/canal" 2>/dev/null || true)"
  echo ""
  echo "=== À copier dans le site : Admin > Direct > Relais ==="
  echo "Adresse de contrôle : $(base_url)/controle"
  echo "Secret              : $(cat "$CONF_DIR/secret" 2>/dev/null || echo '(introuvable)')"
  echo "Adresse du flux     : $(base_url)/live/$c/index.m3u8"
  echo "(Garde le secret pour toi : il permet de commander le relais.)"
  afficher_proxy
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
  ( umask 077; printf 'STREAM_URL=%s\nRECO=%s\nCODEC=-map 0:v:0 -map 0:a:0? -c:v copy -c:a aac -b:a 128k -ac 2\n' "$url" "$reco" > "$CONF_DIR/$nom.env" )
  # Pas de démarrage ici : le flux se connecte à la première demande d'un lecteur.
  systemctl stop "relais-live@$nom" 2>/dev/null || true
  echo "Flux « $nom » prêt (se connecte à la demande) : $(base_url)/live/$nom/index.m3u8"
}

lister_flux() {
  local trouve=0
  for f in "$CONF_DIR"/*.env; do
    [ -e "$f" ] || continue
    trouve=1
    local nom etat; nom="$(basename "$f" .env)"
    if systemctl is-active --quiet "relais-live@$nom"; then etat="connecté (quelqu'un regarde)"; else etat="en veille (se connecte à la demande)"; fi
    local lib="$nom"; [ "$nom" = "$(cat "$CONF_DIR/canal" 2>/dev/null || true)" ] && lib="canal du site"
    echo "$lib : $etat → $(base_url)/live/$nom/index.m3u8"
  done
  [ "$trouve" = 1 ] || echo "Aucun flux connecté en ce moment (le canal du site apparaît ici pendant une diffusion)."
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
  --infos) afficher_infos; exit 0 ;;
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
if [ -z "${PROXY:-}" ] && [ -z "${DNS_CF:-}" ]; then
  echo ""
  echo "Comment le HTTPS (le cadenas) doit-il être assuré ?"
  echo "  1) Ce relais obtient lui-même son certificat : il faut que les ports 80 et 443 de ce serveur soient libres."
  echo "  2) Un proxy placé devant ce relais s'en charge (ex. Nginx Proxy Manager)."
  echo "  3) Ce relais obtient son certificat par le DNS de Cloudflare : pour un serveur dont les ports 80 et 443 sont déjà pris (le relais sert alors le HTTPS sur un autre port, ex. 8443)."
  read -r -p "Ton choix [1] : " CHOIX || CHOIX=1
  case "${CHOIX:-1}" in 2) PROXY=o;; 3) DNS_CF=o;; esac
fi
PROXY="${PROXY:-n}"; DNS_CF="${DNS_CF:-n}"
if [ "${PROXY,,}" != "o" ]; then demander "Courriel pour le certificat HTTPS (avis d'expiration seulement)" COURRIEL; fi
[ -n "$DOMAINE" ] || { echo "Il faut un nom de domaine."; exit 1; }

# Ports : 80 et 443 par défaut. Si un autre programme (Apache, un autre proxy, un conteneur…) les utilise déjà, le script le signale et on en choisit d'autres.
choisir_port() { # choisir_port "Question" VARIABLE défaut
  local question="$1" var="$2" defaut="$3" rep=""
  if [ -n "${!var:-}" ]; then return; fi
  while true; do
    local qui; qui="$(port_occupe "$defaut" | head -n1)"
    if [ -n "$qui" ]; then echo "   Le port $defaut est déjà utilisé par : $(echo "$qui" | sed -E 's/.*users:\(\("?([^",)]*).*/\1/')"; fi
    read -r -p "$question [$defaut] : " rep || { echo "Pas de réponse : arrêt."; exit 1; }
    rep="${rep:-$defaut}"
    [[ "$rep" =~ ^[0-9]+$ ]] && [ "$rep" -ge 1 ] && [ "$rep" -le 65535 ] || { echo "   Un numéro de port entre 1 et 65535, s'il te plaît."; continue; }
    if [ -n "$(port_occupe "$rep")" ]; then echo "   Le port $rep est déjà utilisé : choisis-en un autre."; case "$rep" in 80) defaut=8080;; 443) defaut=8443;; *) defaut="$((rep+1))";; esac; continue; fi
    printf -v "$var" '%s' "$rep"; return
  done
}
echo ""
mkdir -p "$CONF_DIR"
if [ "${PROXY,,}" = "o" ]; then
  # Le proxy s'occupe du HTTPS et du domaine : le relais écoute seulement en HTTP, sur un port libre que le proxy utilisera.
  choisir_port "Port sur lequel ce relais écoute (ton proxy y enverra le domaine)" PORT_HTTP 8080
  PORT_HTTPS=443; : > "$CONF_DIR/proxy"
elif [ "${DNS_CF,,}" = "o" ]; then
  rm -f "$CONF_DIR/proxy"
  choisir_port "Port HTTPS de ce relais (les ports 80 et 443 sont pris : 8443 par exemple)" PORT_HTTPS 8443
  PORT_HTTP=80  # non utilisé : le relais n'écoute qu'en HTTPS
else
  rm -f "$CONF_DIR/proxy"
  choisir_port "Port HTTP (80 recommandé : nécessaire pour obtenir le certificat HTTPS)" PORT_HTTP 80
  if [ "$PORT_HTTP" = 80 ]; then choisir_port "Port HTTPS" PORT_HTTPS 443; else PORT_HTTPS=443; fi
fi
printf '%s' "$PORT_HTTP" > "$CONF_DIR/port_http"; printf '%s' "$PORT_HTTPS" > "$CONF_DIR/port_https"

# 2. Programmes nécessaires.
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
PAQUETS="ffmpeg nginx python3 curl openssl"
[ "${PROXY,,}" = "o" ] || PAQUETS="$PAQUETS certbot python3-certbot-nginx"
if [ "${DNS_CF,,}" = "o" ]; then PAQUETS="$PAQUETS python3-certbot-dns-cloudflare"; fi
apt-get install -y $PAQUETS

# La conversion à la volée (Admin > Direct > Compatibilité navigateur) demande ces deux encodeurs de ffmpeg : on vérifie qu'ils sont là.
ENCODEURS="$(ffmpeg -hide_banner -encoders 2>/dev/null || true)"
if echo "$ENCODEURS" | grep -q libx264 && echo "$ENCODEURS" | grep -qE ' aac '; then
  echo "ffmpeg : conversion H.264 + AAC disponible ($(nproc) cœur(s) de processeur sur ce serveur)."
else
  echo "!! Ce ffmpeg ne contient pas tous les encodeurs nécessaires à la conversion (libx264 ou aac) : la copie directe fonctionnera, pas la conversion."
fi

# Certificat par le DNS de Cloudflare (aucun port à ouvrir) : le jeton ne sert qu'à modifier les enregistrements DNS de ta zone.
if [ "${DNS_CF,,}" = "o" ]; then
  echo ""
  echo "=== Jeton d'API Cloudflare ==="
  echo "Crée-le sur https://dash.cloudflare.com/profile/api-tokens > Create Token > modèle « Edit zone DNS » > Zone Resources : ta zone (ex. seeduction.org)."
  echo "Il ne donne accès qu'au DNS de cette zone. Il est gardé sur ce serveur seulement (fichier lisible par root)."
  if [ -z "${CF_TOKEN:-}" ]; then read -r -s -p "Jeton d'API Cloudflare (invisible pendant la saisie) : " CF_TOKEN || true; echo; fi
  [ -n "${CF_TOKEN:-}" ] || { echo "Il faut le jeton."; exit 1; }
  ( umask 077; printf 'dns_cloudflare_api_token = %s\n' "$CF_TOKEN" > "$CONF_DIR/cloudflare.ini" )
  if ! certbot certonly --dns-cloudflare --dns-cloudflare-credentials "$CONF_DIR/cloudflare.ini" --dns-cloudflare-propagation-seconds 30 \
      -d "$DOMAINE" --non-interactive --agree-tos -m "${COURRIEL:-admin@$DOMAINE}" --deploy-hook "systemctl reload nginx || true"; then
    echo "!! Certificat refusé : vérifie le jeton (permission « Zone > DNS > Edit » sur la bonne zone) et que le domaine $DOMAINE appartient bien à cette zone."
    exit 1
  fi
fi

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

# Secret de commande (que le site utilise) et nom secret du canal du site : créés une fois, conservés aux réinstallations.
[ -s "$CONF_DIR/secret" ] || ( umask 077; openssl rand -hex 24 > "$CONF_DIR/secret" )
[ -s "$CONF_DIR/canal" ] || openssl rand -hex 10 > "$CONF_DIR/canal"

# 4. Le service de démarrage à la demande.
ecrire_service_demande
# Toujours réécrite : une unité posée par une ancienne version du script garderait sa vieille commande ffmpeg (ex. sans $CODEC, donc sans conversion).
ecrire_unite

# 5. Nginx : la liste de lecture (index.m3u8) passe par le service de démarrage à la demande ; les petits morceaux vidéo sont servis directement, sans cache.
cat > "$CONF_NGINX" <<'NGINX'
server {
    listen @PORT_HTTP@;
    server_name @DOMAINE@;
    root @WEB@;

    location /controle/ {
        proxy_pass http://127.0.0.1:8099;
        client_max_body_size 8k;
        proxy_read_timeout 20s;
    }

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
if [ "${DNS_CF,,}" = "o" ]; then
  sed -i 's#    listen @PORT_HTTP@;#    listen @PORT_HTTPS@ ssl;\n    ssl_certificate /etc/letsencrypt/live/@DOMAINE@/fullchain.pem;\n    ssl_certificate_key /etc/letsencrypt/live/@DOMAINE@/privkey.pem;#' "$CONF_NGINX"
fi
sed -i "s#@DOMAINE@#$DOMAINE#g; s#@WEB@#$DOSSIER_WEB#g; s#@PORT_HTTP@#$PORT_HTTP#g; s#@PORT_HTTPS@#$PORT_HTTPS#g" "$CONF_NGINX"
# Le site par défaut de nginx écoute aussi sur le port 80 : il empêcherait nginx de démarrer si un autre programme l'occupe.
if [ "$PORT_HTTP" != 80 ] || [ "${DNS_CF,,}" = "o" ]; then rm -f /etc/nginx/sites-enabled/default; fi
nginx -t
# Nginx doit tourner (un « reload » échoue s'il est arrêté, par exemple parce qu'un autre programme occupe déjà le port 80).
systemctl enable nginx >/dev/null 2>&1 || true
if systemctl is-active --quiet nginx; then
  systemctl reload nginx
elif ! systemctl start nginx; then
  echo ""
  echo "!! Nginx n'a pas pu démarrer. Cause la plus fréquente : un autre programme utilise déjà le port 80 ou 443."
  echo "   Qui occupe le port 80 :"
  ss -ltnp 2>/dev/null | grep -E ':(80|443)\s' || echo "   (rien trouvé : regarde le détail avec « journalctl -xeu nginx »)"
  echo "   Détail de l'erreur :"
  journalctl -u nginx --no-pager -n 8 2>/dev/null || true
  echo "   Arrête ou déplace l'autre programme (ex. « systemctl disable --now apache2 »), puis relance ce script : il reprend là où il s'est arrêté."
  exit 1
fi

# 6. HTTPS (si le nom de domaine pointe déjà vers ce serveur ; sinon on continue en HTTP).
if [ "${PROXY,,}" = "o" ]; then
  echo "Mode proxy : aucun certificat à demander ici, ton proxy s'en charge."
elif [ "${DNS_CF,,}" = "o" ]; then
  echo "Certificat obtenu par le DNS de Cloudflare (renouvelé automatiquement). Le relais répond en HTTPS sur le port $PORT_HTTPS."
  echo "À faire : (1) dans Cloudflare > DNS, l'enregistrement $DOMAINE doit pointer vers l'adresse de CE serveur, en « DNS seulement » (nuage gris) ;"
  echo "          (2) ouvrir le port $PORT_HTTPS dans le pare-feu de ce serveur et, s'il y en a un, dans le panneau de ton hébergeur."
elif [ "$PORT_HTTP" = 80 ]; then
  if ! certbot --nginx -d "$DOMAINE" --non-interactive --agree-tos -m "${COURRIEL:-admin@$DOMAINE}" --redirect --https-port "$PORT_HTTPS"; then
    echo "!! Le certificat HTTPS n'a pas pu être obtenu (le nom de domaine pointe-t-il vers ce serveur ?). Relance « certbot --nginx -d $DOMAINE --https-port $PORT_HTTPS » plus tard."
  fi
else
  echo ""
  echo "!! Le port HTTP choisi n'est pas 80 : le certificat HTTPS ne peut pas être obtenu ici (la vérification se fait obligatoirement sur le port 80)."
  echo "   Le relais répond en HTTP sur le port $PORT_HTTP. Les navigateurs bloquent une vidéo HTTP dans un site HTTPS : il faut donc mettre devant lui un proxy HTTPS"
  echo "   (le proxy qui occupe déjà le port 80/443, par exemple Nginx Proxy Manager) qui envoie le domaine $DOMAINE vers http://ADRESSE-DE-CE-SERVEUR:$PORT_HTTP (sans mise en cache et avec un délai de réponse d'au moins 40 s)."
fi

# 7. Les flux (tes podcasts) s'ajoutent dans le site, Admin > Direct : rien à saisir ici. (Flux manuels facultatifs : --ajouter NOM URL, ou STREAM_URL=… à l'installation.)
if [ -n "${STREAM_URL:-}" ]; then ajouter_flux "${NOM_FLUX:-event}" "$STREAM_URL"; fi

echo ""
echo "=== Terminé ==="
lister_flux
afficher_infos
echo ""
echo "Compatibilité navigateur : le son est converti en AAC stéréo par défaut (image copiée sans réencodage) ; réglable dans Admin > Direct."
echo "Les flux restent en veille : ils se connectent à ton Dispatcharr seulement quand quelqu'un ouvre le lien, et se coupent environ une minute après son départ."
echo "Page de test d'un flux manuel : $(base_url)/?flux=NOM  (compte quelques secondes avant que l'image apparaisse la première fois)"
echo "Pour ajouter un flux plus tard : sudo bash $0 --ajouter NOM URL"
