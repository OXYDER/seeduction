// Lecteur desktop Seeduction — voir desktop-player/README.md.
//
// Reçoit un lien seeduction://stream/<jeton>, échange ce jeton contre le .torrent personnalisé du membre (même
// mécanisme que le téléchargement classique : ça compte pour son ratio), rejoint le swarm comme un vrai peer
// BitTorrent (aucune limite de navigateur ici, contrairement au lecteur intégré au site), sert le fichier demandé
// sur un petit serveur local, et lance VLC dessus. Aucun format n'est restreint : VLC lit à peu près tout.

const { app, Tray, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn, execSync } = require('child_process');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WebTorrent = require('webtorrent');

const SITE_BASE_URL = (process.env.SEEDUCTION_BASE_URL || 'https://seeduction.org').replace(/\/+$/, '');
const PROTOCOL = 'seeduction';

let tray = null;
let client = null;
let activeTorrent = null;
let activeServer = null;
let progressTimer = null;

function log(...args) {
  console.log('[Seeduction Player]', ...args);
}

function notifyError(message) {
  log('Erreur :', message);
  dialog.showErrorBox('Lecteur Seeduction', message);
}

// Filet de sécurité général : une erreur imprévue ne doit plus jamais fermer tout le logiciel (ça arrivait avec
// certaines erreurs réseau tardives sur le flux vidéo). On la journalise et on continue.
process.on('uncaughtException', (err) => {
  log('Erreur non gérée (ignorée pour ne pas fermer le logiciel) :', err && err.message);
});
process.on('unhandledRejection', (err) => {
  log('Promesse rejetée non gérée (ignorée) :', err && err.message ? err.message : err);
});

// ---------------------------------------------------------------------------
// Démarrage : une seule instance, on capte les liens seeduction:// qu'on reçoit
// au lancement (Windows/Linux : argv) ou pendant que l'app tourne déjà (Windows/
// Linux : second-instance ; macOS : open-url).
// ---------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (url) handleUrl(url);
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleUrl(url);
  });

  // Ne jamais quitter juste parce qu'aucune fenêtre n'est ouverte : le logiciel vit dans la zone de notification.
  app.on('window-all-closed', (event) => event.preventDefault());

  app.whenReady().then(() => {
    // Uniquement une fois installé (electron-builder s'en charge normalement à l'installation) : en développement
    // (`npm start`), s'enregistrer soi-même écraserait l'association Windows vers la vraie version installée avec
    // une entrée qui ne fonctionne qu'aussi longtemps que ce terminal de test reste ouvert.
    if (app.isPackaged && !app.isDefaultProtocolClient(PROTOCOL)) {
      app.setAsDefaultProtocolClient(PROTOCOL);
    }

    createTray();

    const launchUrl = process.argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (launchUrl) handleUrl(launchUrl);
  });
}

function createTray() {
  // Icône adaptée à la petite taille de la zone de notification ; icon.png (plus grand) sert à l'installateur.
  tray = new Tray(path.join(__dirname, 'icon-fallback.png'));
  tray.setToolTip('Lecteur Seeduction');
  refreshTrayMenu('En veille — ouvre un lien « Visualiser en ligne » depuis Seeduction');
}

function refreshTrayMenu(status) {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: status, enabled: false },
    { type: 'separator' },
    { label: 'Arrêter la lecture en cours', click: stopCurrent, enabled: !!activeTorrent },
    { label: 'Quitter', click: () => { stopCurrent(); app.exit(0); } },
  ]));
}

// ---------------------------------------------------------------------------
// Traitement d'un lien seeduction://stream/<jeton>
// ---------------------------------------------------------------------------

async function handleUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== `${PROTOCOL}:` || url.hostname !== 'stream') {
      throw new Error('Lien non reconnu par le lecteur Seeduction.');
    }
    const token = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (!token) throw new Error('Lien incomplet.');
    await playToken(token);
  } catch (err) {
    // La cause détaillée (ex : code d'erreur TLS/réseau précis) va dans la console pour le débogage ;
    // la fenêtre affichée au membre reste courte et lisible.
    if (err && err.cause) log('Cause détaillée :', err.cause);
    notifyError((err && err.message) || String(err));
  }
}

async function playToken(token) {
  refreshTrayMenu('Récupération du torrent…');
  log('Appel de', `${SITE_BASE_URL}/api/stream/session/${token}`);
  const res = await fetch(`${SITE_BASE_URL}/api/stream/session/${encodeURIComponent(token)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Le lien de lecture a expiré ou est invalide (${res.status}). Relance-le depuis Seeduction.`);
  }
  const { torrentBase64, fileIndex } = await res.json();
  await startPlayback(Buffer.from(torrentBase64, 'base64'), fileIndex);
}

async function startPlayback(torrentBuffer, fileIndex) {
  stopCurrent(); // une seule lecture à la fois pour l'instant

  if (!client) client = new WebTorrent();

  refreshTrayMenu('Connexion au swarm…');
  const torrent = await new Promise((resolve, reject) => {
    let settled = false;
    const t = client.add(torrentBuffer, { deselect: true });
    t.on('ready', () => { settled = true; resolve(t); });
    t.on('error', (err) => { if (!settled) reject(err); });
  });
  activeTorrent = torrent;
  log('Torrent prêt — trackers :', torrent.announce);
  torrent.on('noPeers', (announceType) => log(`Aucun pair trouvé via ${announceType}`));
  torrent.on('wire', (wire) => log('Pair connecté :', wire.remoteAddress, wire.remotePort));
  torrent.on('warning', (err) => log('Avertissement WebTorrent :', err.message));
  torrent.on('trackerAnnounce', () => log('Annonce envoyée au tracker — réponse : ', torrent.numPeers, 'pair(s) connu(s) au total'));

  const file = torrent.files[fileIndex];
  if (!file) throw new Error('Fichier introuvable dans ce torrent.');
  for (const f of torrent.files) if (f !== file) f.deselect();
  file.select();

  // Repère utile pour le débogage : pairs trouvés, vitesse, progression de CE fichier (pas du torrent entier).
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    if (!activeTorrent) return;
    const kbps = (activeTorrent.downloadSpeed / 1024).toFixed(1);
    const pct = (file.progress * 100).toFixed(1);
    log(`Pairs : ${activeTorrent.numPeers} — ${kbps} Ko/s — ${pct}% du fichier téléchargé`);
  }, 3000);

  const server = http.createServer((req, res) => {
    log('VLC demande :', req.headers.range ? `octets ${req.headers.range}` : 'le fichier depuis le début');
    const range = req.headers.range;
    let readStream;
    if (!range) {
      res.writeHead(200, { 'Content-Length': file.length, 'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'bytes' });
      readStream = file.createReadStream();
    } else {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match && match[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match && match[2] ? Number.parseInt(match[2], 10) : file.length - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${file.length}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': 'application/octet-stream',
      });
      readStream = file.createReadStream({ start, end });
    }
    // VLC ferme/rouvre souvent la connexion en cours de lecture (recherche dans la vidéo, fermeture) : sans ces
    // filets, l'erreur qui en résulte remontait jusqu'au processus principal et plantait tout le logiciel.
    readStream.on('error', () => { try { res.destroy(); } catch { /* déjà fermé */ } });
    res.on('close', () => { try { readStream.destroy(); } catch { /* déjà fermé */ } });
    readStream.pipe(res).on('error', () => { /* géré ci-dessus */ });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  activeServer = server;

  const port = server.address().port;
  const streamUrl = `http://127.0.0.1:${port}/${encodeURIComponent(file.name)}`;
  refreshTrayMenu(`Lecture : ${file.name}`);
  launchPlayer(streamUrl, file.name);
}

function stopCurrent() {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
  if (activeServer) { try { activeServer.close(); } catch { /* déjà fermé */ } activeServer = null; }
  if (activeTorrent) { try { activeTorrent.destroy({ destroyStore: true }); } catch { /* déjà détruit */ } activeTorrent = null; }
  refreshTrayMenu('En veille — ouvre un lien « Visualiser en ligne » depuis Seeduction');
}

// ---------------------------------------------------------------------------
// Lancement de VLC (ou repli sur le lecteur par défaut du système)
// ---------------------------------------------------------------------------

function findVlc() {
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
      'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
    ];
    for (const p of candidates) if (fs.existsSync(p)) return p;
    try {
      const out = execSync('reg query "HKLM\\SOFTWARE\\VideoLAN\\VLC" /v InstallDir', { encoding: 'utf8' });
      const m = /InstallDir\s+REG_SZ\s+(.+)/.exec(out);
      if (m) {
        const exe = path.join(m[1].trim(), 'vlc.exe');
        if (fs.existsSync(exe)) return exe;
      }
    } catch { /* VLC pas installé, ou pas dans le registre 64 bits — on retombe sur le repli plus bas */ }
    return null;
  }
  if (process.platform === 'darwin') {
    const macPath = '/Applications/VLC.app/Contents/MacOS/VLC';
    return fs.existsSync(macPath) ? macPath : null;
  }
  for (const p of ['/usr/bin/vlc', '/usr/local/bin/vlc', '/snap/bin/vlc']) {
    if (fs.existsSync(p)) return p;
  }
  return 'vlc'; // tente le PATH en dernier recours (Linux)
}

function launchPlayer(url, displayName) {
  const vlcPath = findVlc();
  if (vlcPath) {
    try {
      spawn(vlcPath, [url, '--meta-title', displayName], { detached: true, stdio: 'ignore' }).unref();
      return;
    } catch (err) {
      log('Échec du lancement de VLC, repli sur le lecteur par défaut du système :', err.message);
    }
  }
  shell.openExternal(url);
  dialog.showMessageBox({
    type: 'info',
    title: 'Lecteur Seeduction',
    message: "VLC n'a pas été trouvé sur ton PC — la lecture peut échouer selon le format. Installe VLC pour une lecture fiable de tous les formats : https://www.videolan.org/vlc/",
  });
}
