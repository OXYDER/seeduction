// Lecteur desktop Seeduction — voir desktop-player/README.md.
//
// Reçoit un lien seeduction://stream/<jeton>, échange ce jeton contre le .torrent personnalisé du membre (même
// mécanisme que le téléchargement classique : ça compte pour son ratio), rejoint le swarm comme un vrai peer
// BitTorrent (aucune limite de navigateur ici, contrairement au lecteur intégré au site), sert le fichier demandé
// sur un petit serveur local, et lance Seeduction VLC dessus. Aucun format n'est restreint.
//
// C'est un vrai client BitTorrent, pas un lecteur jetable : les fichiers vont dans le dossier Téléchargements du
// membre (configurable), le torrent continue à seeder après la lecture, et les sessions survivent au redémarrage du
// logiciel. Les règles de seed/hit & run de Seeduction s'appliquent normalement (voir tracker.service.ts côté
// serveur) — le membre a tout ce qu'il faut ici pour les respecter.
//
// Plusieurs lectures/téléchargements peuvent tourner en même temps (chacune sa propre session) ; la fenêtre
// « Téléchargements » (menu de l'icône) les liste tous avec leur progression ou leur temps de partage, permet
// d'ouvrir leur dossier, de les arrêter (en gardant le fichier) ou de les supprimer, et de régler le dossier de
// téléchargement ainsi que des limites de vitesse.

const { app, Tray, Menu, shell, dialog, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WebTorrent = require('webtorrent');
const settingsStore = require('./settings');

const SITE_BASE_URL = (process.env.SEEDUCTION_BASE_URL || 'https://seeduction.org').replace(/\/+$/, '');
const PROTOCOL = 'seeduction';
// Doivent rester alignés avec HNR_SEED_HOURS / HNR_RATIO côté backend (backend/src/common/utils/economy.ts) : une
// estimation locale pour avertir/bloquer le membre AVANT qu'il casse son seed. L'obligation réelle (et la seule qui
// compte pour bloquer de futurs téléchargements) reste toujours calculée et appliquée par le tracker.
const HNR_SEED_HOURS = Number(process.env.SEEDUCTION_HNR_SEED_HOURS || 72);
const HNR_RATIO = Number(process.env.SEEDUCTION_HNR_RATIO || 1);
// Copie du .torrent de chaque session (pour pouvoir reprendre le partage après un redémarrage du logiciel) et liste
// des sessions actives — rangés dans le dossier de données de l'app, jamais dans le dossier de téléchargement.
const TORRENTS_DIR = path.join(app.getPath('userData'), 'torrents');
const SESSIONS_FILE = path.join(app.getPath('userData'), 'sessions.json');

let settings = settingsStore.load();
let tray = null;
let client = null;
let downloadsWin = null;
// id -> { id, name, fileIndex, status, addedAt, completedAt, downloadPath, torrent, file, server, notifiedComplete, progressTimer }
const sessions = new Map();

function log(...args) {
  console.log('[Seeduction Player]', ...args);
}

function notifyError(message) {
  log('Erreur :', message);
  dialog.showErrorBox('Lecteur Seeduction', message);
}

/** Notification système (centre de notifications Windows/macOS/Linux) — silencieuse si indisponible. */
function notify(title, body) {
  try {
    if (Notification.isSupported()) new Notification({ title, body, icon: path.join(__dirname, 'icon.png') }).show();
  } catch { /* pas grave : juste pas de notification */ }
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

  // Ne jamais quitter juste parce qu'aucune fenêtre n'est ouverte : le logiciel vit dans la zone de notification, et
  // les torrents actifs doivent continuer à seeder en arrière-plan.
  app.on('window-all-closed', (event) => event.preventDefault());

  app.whenReady().then(() => {
    // Uniquement une fois installé (electron-builder s'en charge normalement à l'installation) : en développement
    // (`npm start`), s'enregistrer soi-même écraserait l'association Windows vers la vraie version installée avec
    // une entrée qui ne fonctionne qu'aussi longtemps que ce terminal de test reste ouvert.
    if (app.isPackaged && !app.isDefaultProtocolClient(PROTOCOL)) {
      app.setAsDefaultProtocolClient(PROTOCOL);
    }

    // Lancement automatique avec Windows (silencieux : aucune fenêtre ne s'ouvre, seule l'icône apparaît dans la
    // zone de notification) — comme un vrai client BitTorrent, pour que le seed reprenne dès l'ouverture de session,
    // sans dépendre du membre qui pense à relancer le logiciel lui-même.
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
    }

    createTray();
    setupIpc();
    restoreSessions();

    const launchUrl = process.argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (launchUrl) handleUrl(launchUrl);
  });
}

function createTray() {
  // Icône adaptée à la petite taille de la zone de notification ; icon.png (plus grand) sert à l'installateur/fenêtre.
  tray = new Tray(path.join(__dirname, 'icon-fallback.png'));
  tray.setToolTip('Lecteur Seeduction');
  tray.on('double-click', openDownloadsWindow);
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) return;
  const active = [...sessions.values()].filter((s) => s.status === 'downloading').length;
  const seeding = [...sessions.values()].filter((s) => s.status === 'completed').length;
  const parts = [];
  if (active > 0) parts.push(`${active} téléchargement(s)`);
  if (seeding > 0) parts.push(`${seeding} en partage`);
  const status = parts.length > 0 ? parts.join(' — ') : 'En veille — ouvre un lien depuis Seeduction';
  tray.setToolTip(`Lecteur Seeduction\n${status}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: status, enabled: false },
    { type: 'separator' },
    { label: '💻 Ouvrir le client Seeduction', click: openDownloadsWindow },
    { label: '📂 Ouvrir le dossier de téléchargement', click: () => shell.openPath(settings.downloadPath) },
    { type: 'separator' },
    // Quitter le logiciel ne doit pas supprimer les fichiers déjà téléchargés ni casser le seed — un membre qui
    // ferme le lecteur doit pouvoir le rouvrir plus tard et continuer à respecter ses obligations de seed. Mais tant
    // qu'il ne tourne pas, le partage est interrompu : on avertit avant de fermer si un torrent n'a pas fini le sien.
    { label: 'Quitter (les fichiers restent, le seed reprendra au prochain lancement)', click: confirmQuit },
  ]));
}

// ---------------------------------------------------------------------------
// Fenêtre « Téléchargements » : liste tout ce qui est en cours ou terminé, avec le temps de partage, la possibilité
// d'ouvrir le dossier d'un fichier, de l'arrêter (fichier conservé) ou de le supprimer, et les préférences (dossier
// de téléchargement, limites de vitesse).
// ---------------------------------------------------------------------------

function openDownloadsWindow() {
  if (downloadsWin && !downloadsWin.isDestroyed()) { downloadsWin.show(); downloadsWin.focus(); return; }
  downloadsWin = new BrowserWindow({
    width: 700,
    height: 560,
    title: 'Client Seeduction',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'downloads-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  downloadsWin.loadFile(path.join(__dirname, 'downloads-window.html'));
  downloadsWin.webContents.on('did-finish-load', broadcastDownloadsUpdate);
  downloadsWin.on('closed', () => { downloadsWin = null; });
}

function setupIpc() {
  ipcMain.handle('downloads:remove', (_event, id, deleteFiles) => removeSession(id, { deleteFiles: !!deleteFiles }));
  ipcMain.handle('downloads:clear-all', (_event, deleteFiles) => { stopAllSessions({ deleteFiles: !!deleteFiles }); });
  ipcMain.handle('downloads:refresh', () => broadcastDownloadsUpdate());
  ipcMain.handle('downloads:watch', (_event, id) => watchSession(id));
  ipcMain.handle('downloads:open-item-folder', (_event, id) => {
    const s = sessions.get(id);
    if (!s) return;
    const full = path.join(s.downloadPath, s.file.path);
    if (fs.existsSync(full)) shell.showItemInFolder(full);
    else shell.openPath(s.downloadPath);
  });
  ipcMain.handle('downloads:open-root-folder', () => shell.openPath(settings.downloadPath));
  ipcMain.handle('downloads:get-settings', () => settings);
  ipcMain.handle('downloads:choose-folder', async () => {
    const win = downloadsWin;
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return settings;
    settings = { ...settings, downloadPath: result.filePaths[0] };
    settingsStore.save(settings);
    broadcastDownloadsUpdate();
    return settings;
  });
  ipcMain.handle('downloads:set-limits', (_event, { downloadLimit, uploadLimit }) => {
    settings = { ...settings, downloadLimit: Math.max(0, Number(downloadLimit) || 0), uploadLimit: Math.max(0, Number(uploadLimit) || 0) };
    settingsStore.save(settings);
    applySpeedLimits();
    broadcastDownloadsUpdate();
    return settings;
  });
}

/** Applique les limites de vitesse (Ko/s -> octets/s) au client WebTorrent ; 0 = illimité. */
function applySpeedLimits() {
  if (!client) return;
  try { client.throttleDownload(settings.downloadLimit > 0 ? settings.downloadLimit * 1024 : -1); } catch { /* pas critique */ }
  try { client.throttleUpload(settings.uploadLimit > 0 ? settings.uploadLimit * 1024 : -1); } catch { /* pas critique */ }
}

/**
 * Estimation locale de l'obligation de seed (hit & run) d'une session terminée : temps de partage RÉELLEMENT
 * accumulé (voir `seedSecondsAccrued`, incrémenté uniquement pendant que le lecteur tourne — pas le temps horloge
 * depuis la fin du téléchargement, qui continuerait de descendre même logiciel fermé) et ratio d'envoi cumulé sur ce
 * torrent (`uploadedAccrued`, additionné à chaque tick pour survivre aux redémarrages malgré le compteur WebTorrent
 * qui repart de zéro à chaque nouveau client). Sert uniquement à avertir/bloquer le membre dans le lecteur — le
 * tracker reste seul juge de l'obligation réelle.
 */
function hnrStatus(session) {
  if (session.status !== 'completed' || !session.completedAt) return { obligated: false, satisfied: true };
  const seedSeconds = session.seedSecondsAccrued || 0;
  const ratio = session.torrent.length > 0 ? (session.uploadedAccrued || 0) / session.torrent.length : 0;
  const remainingSeconds = Math.max(0, HNR_SEED_HOURS * 3600 - seedSeconds);
  const satisfied = seedSeconds >= HNR_SEED_HOURS * 3600 || ratio >= HNR_RATIO;
  return { obligated: true, satisfied, remainingSeconds, ratio };
}

/** Passe les fichiers d'un torrent terminé en lecture seule : une friction supplémentaire (l'Explorateur Windows
 * demande une confirmation avant de supprimer un fichier en lecture seule) — pas un blocage impossible à contourner,
 * voir la discussion avec le membre à ce sujet. */
function markFilesReadOnly(torrent) {
  for (const f of torrent.files) {
    try { fs.chmodSync(path.join(torrent.path, f.path), 0o444); } catch { /* pas grave */ }
  }
}
function markFilesWritable(torrent) {
  for (const f of torrent.files) {
    try { fs.chmodSync(path.join(torrent.path, f.path), 0o666); } catch { /* pas grave */ }
  }
}

function broadcastDownloadsUpdate() {
  if (!downloadsWin || downloadsWin.isDestroyed()) return;
  const list = [...sessions.values()].map((s) => {
    const hnr = hnrStatus(s);
    return {
      id: s.id,
      name: s.name,
      torrentName: s.torrentName,
      coverImage: s.coverImage,
      size: s.file.length,
      status: s.status,
      progress: s.file.progress,
      peers: s.torrent.numPeers,
      downSpeed: s.torrent.downloadSpeed,
      upSpeed: s.torrent.uploadSpeed,
      addedAt: s.addedAt,
      resumePositionSeconds: s.resumePositionSeconds || 0,
      durationSeconds: s.durationSeconds || 0,
      playing: !!s.playing,
      hnr: hnr.obligated ? { satisfied: hnr.satisfied, remainingSeconds: Math.round(hnr.remainingSeconds), ratio: hnr.ratio } : null,
    };
  });
  downloadsWin.webContents.send('downloads:data', { sessions: list, settings, totalDiskUsage: dirSize(settings.downloadPath) });
}

/** Taille totale d'un dossier (récursive) — utilisée pour afficher l'espace occupé par le dossier de téléchargement. */
function dirSize(dir) {
  let total = 0;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else { try { total += fs.statSync(full).size; } catch { /* fichier disparu entre-temps : ignoré */ } }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Persistance des sessions : pour qu'un torrent continue à seeder (et compte pour le ratio / les obligations de
// seed) même après avoir fermé puis rouvert le lecteur — un membre ne doit jamais avoir à choisir entre fermer le
// logiciel et respecter les règles de Seeduction.
// ---------------------------------------------------------------------------

function persistSessions() {
  try { fs.mkdirSync(TORRENTS_DIR, { recursive: true }); } catch { /* existe déjà */ }
  const list = [...sessions.values()].map((s) => ({
    id: s.id, name: s.name, fileIndex: s.fileIndex, addedAt: s.addedAt, completedAt: s.completedAt, downloadPath: s.downloadPath,
    torrentId: s.torrentId, torrentName: s.torrentName, coverImage: s.coverImage,
    seedSecondsAccrued: s.seedSecondsAccrued || 0, uploadedAccrued: s.uploadedAccrued || 0,
    resumePositionSeconds: s.resumePositionSeconds || 0, durationSeconds: s.durationSeconds || 0,
  }));
  try { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(list, null, 2)); } catch (err) { log('Impossible de sauvegarder les sessions :', err.message); }
}

function restoreSessions() {
  let saved;
  try { saved = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); } catch { return; }
  for (const entry of saved) {
    const torrentFile = path.join(TORRENTS_DIR, `${entry.id}.torrent`);
    if (!fs.existsSync(torrentFile)) continue;
    try {
      const buffer = fs.readFileSync(torrentFile);
      resumeSession(entry, buffer);
    } catch (err) {
      log(`Impossible de reprendre la session ${entry.id} :`, err.message);
    }
  }
}

function resumeSession(entry, torrentBuffer) {
  if (!client) { client = new WebTorrent(); applySpeedLimits(); }
  const t = client.add(torrentBuffer, { path: entry.downloadPath || settings.downloadPath });
  t.on('ready', () => {
    const file = t.files[entry.fileIndex];
    if (!file) { try { t.destroy(); } catch { /* déjà détruit */ } return; }
    file.select();
    registerSession({ ...entry, torrent: t, file, server: null, notifiedComplete: t.done });
    log('Session reprise :', file.name);
  });
  t.on('error', (err) => log(`Erreur en reprenant une session (${entry.name}) :`, err.message));
}

function registerSession(session) {
  // torrent.done (tout le torrent, pas juste le fichier lu) correspond à ce que le tracker considère comme
  // « complété » (left=0) — c'est ce qui déclenche vraiment l'obligation de seed côté serveur.
  session.status = session.torrent.done ? 'completed' : 'downloading';
  if (session.status === 'completed') {
    if (!session.completedAt) session.completedAt = Date.now();
    markFilesReadOnly(session.torrent);
  }
  // Compteurs accumulés (voir hnrStatus) : repartent de ce qui a été sauvegardé (une session reprise après
  // redémarrage garde son acquis), jamais recalculés à partir de l'horloge.
  session.seedSecondsAccrued = session.seedSecondsAccrued || 0;
  session.uploadedAccrued = session.uploadedAccrued || 0;
  session.lastUploadedSnapshot = session.torrent.uploaded || 0;
  session.lastTickAt = Date.now();
  sessions.set(session.id, session);
  refreshTrayMenu();
  persistSessions();
  session.progressTimer = setInterval(() => {
    if (!sessions.has(session.id)) return;
    // N'accumule que pendant que le lecteur tourne réellement (l'intervalle réel écoulé, pas une constante fixe, au
    // cas où le tick aurait pris du retard) : fermer le logiciel gèle ces compteurs jusqu'au prochain lancement,
    // exactement comme le seed s'arrête réellement pendant ce temps.
    const now = Date.now();
    const tickSeconds = (now - session.lastTickAt) / 1000;
    session.lastTickAt = now;
    const uploadDelta = Math.max(0, session.torrent.uploaded - session.lastUploadedSnapshot);
    session.uploadedAccrued += uploadDelta;
    session.lastUploadedSnapshot = session.torrent.uploaded;
    if (session.status === 'completed') session.seedSecondsAccrued += tickSeconds;
    if (session.playing) pingWatching(session);

    const pct = (session.torrent.progress * 100).toFixed(1);
    log(`${session.name} — ${pct}% — ${session.torrent.numPeers} pair(s) — ↓ ${(session.torrent.downloadSpeed / 1024).toFixed(1)} Ko/s ↑ ${(session.torrent.uploadSpeed / 1024).toFixed(1)} Ko/s`);
    if (session.torrent.done && !session.notifiedComplete) {
      session.notifiedComplete = true;
      session.status = 'completed';
      session.completedAt = Date.now();
      markFilesReadOnly(session.torrent);
      notify('Téléchargement terminé — le partage continue', session.name);
      refreshTrayMenu();
    }
    persistSessions();
    broadcastDownloadsUpdate();
  }, 3000);
  broadcastDownloadsUpdate();
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
  log('Appel de', `${SITE_BASE_URL}/api/stream/session/${token}`);
  const res = await fetch(`${SITE_BASE_URL}/api/stream/session/${encodeURIComponent(token)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Le lien de lecture a expiré ou est invalide (${res.status}). Relance-le depuis Seeduction.`);
  }
  const { torrentBase64, fileIndex, torrentId, torrentName, coverImage } = await res.json();
  await startPlayback(Buffer.from(torrentBase64, 'base64'), fileIndex, { torrentId, torrentName, coverImage });
}

async function startPlayback(torrentBuffer, fileIndex, meta = {}) {
  if (!client) { client = new WebTorrent(); applySpeedLimits(); }

  // Le membre a peut-être déjà cliqué ce lien avant (torrent déjà en téléchargement ou déjà en partage) : WebTorrent
  // refuse d'ajouter deux fois le même infoHash (« Cannot add duplicate torrent ») — on retrouve alors la session
  // déjà active et on lance juste la lecture dessus, plutôt que de planter.
  let duplicate;
  try { duplicate = client.get(torrentBuffer); } catch { duplicate = null; }
  if (duplicate) {
    const existingSession = [...sessions.values()].find((s) => s.torrent === duplicate);
    if (existingSession) {
      log('Torrent déjà présent dans le client — reprise de la session existante.');
      const file = existingSession.torrent.files[fileIndex];
      if (file) switchSessionFile(existingSession, file, fileIndex);
      if (meta.torrentName) existingSession.torrentName = meta.torrentName;
      if (meta.coverImage) existingSession.coverImage = meta.coverImage;
      persistSessions();
      notify('Lecture démarrée', existingSession.file.name);
      await watchSession(existingSession.id);
      return;
    }
    // Connu de WebTorrent mais sans session chez nous (ne devrait normalement pas arriver) : on repart sur une base
    // saine plutôt que de planter avec l'erreur de doublon.
    try { duplicate.destroy(); } catch { /* déjà détruit */ }
  }

  const sessionId = crypto.randomUUID();
  try { fs.mkdirSync(settings.downloadPath, { recursive: true }); } catch { /* existe déjà */ }
  try { fs.mkdirSync(TORRENTS_DIR, { recursive: true }); } catch { /* existe déjà */ }
  fs.writeFileSync(path.join(TORRENTS_DIR, `${sessionId}.torrent`), torrentBuffer);

  const torrent = await new Promise((resolve, reject) => {
    let settled = false;
    // Comme un vrai client BitTorrent : le fichier va directement dans le dossier de téléchargement du membre (visible,
    // retrouvable, gardable), pas dans un dossier caché ou temporaire.
    const t = client.add(torrentBuffer, { path: settings.downloadPath });
    t.on('ready', () => { settled = true; resolve(t); });
    t.on('error', (err) => { if (!settled) reject(err); });
  });
  log('Torrent prêt — trackers :', torrent.announce);
  torrent.on('noPeers', (announceType) => log(`Aucun pair trouvé via ${announceType}`));
  torrent.on('wire', (wire) => log('Pair connecté :', wire.remoteAddress, wire.remotePort));
  torrent.on('warning', (err) => log('Avertissement WebTorrent :', err.message));

  const file = torrent.files[fileIndex];
  if (!file) throw new Error('Fichier introuvable dans ce torrent.');
  // On sélectionne aussi les autres fichiers du torrent (à faible priorité) plutôt que de les déselectionner : un
  // membre qui a téléchargé une série entière doit pouvoir obtenir et seeder tous les fichiers, pas juste celui lu.
  file.select();

  const session = {
    id: sessionId, name: file.name, fileIndex, addedAt: Date.now(), completedAt: null,
    downloadPath: settings.downloadPath, torrent, file, server: null, notifiedComplete: false,
    torrentId: meta.torrentId || null, torrentName: meta.torrentName || null, coverImage: meta.coverImage || null,
    resumePositionSeconds: 0, durationSeconds: 0,
  };
  registerSession(session);
  notify('Lecture démarrée', file.name);
  await watchSession(sessionId);
}

/** Change le fichier suivi par une session existante (un membre relance « Ouvrir dans le lecteur » sur un autre
 * fichier du même torrent déjà en cours, ex. un autre épisode) : ferme le serveur local lié à l'ancien fichier (sera
 * recréé pour le nouveau à la demande) et repart d'une position de lecture à zéro, propre à ce fichier. */
function switchSessionFile(session, file, fileIndex) {
  if (session.file === file) return;
  try { if (session.server) session.server.close(); } catch { /* déjà fermé */ }
  session.server = null;
  file.select();
  session.file = file;
  session.fileIndex = fileIndex;
  session.name = file.name;
  session.resumePositionSeconds = 0;
  session.durationSeconds = 0;
}

/** Sert le fichier d'une session en local (créé à la demande — une session reprise après redémarrage n'en a pas
 * encore) : VLC (ou tout lecteur) s'y connecte comme à un petit serveur vidéo classique, avec support des « Range »
 * (indispensable pour avancer/reculer dans la vidéo sans tout retélécharger depuis le début). */
function ensureFileServer(session) {
  if (session.server) return Promise.resolve(session.server);
  const file = session.file;
  const server = http.createServer((req, res) => {
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
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => { session.server = server; resolve(server); }));
}

/**
 * « Visionner » (nouvelle lecture ou reprise) : sert le fichier s'il ne l'est pas déjà, et lance VLC en reprenant
 * automatiquement là où le membre s'était arrêté la dernière fois (voir `resumePositionSeconds`, alimenté par
 * l'interface HTTP de VLC pendant la lecture).
 */
async function watchSession(id) {
  const session = sessions.get(id);
  if (!session || session.playing) return;
  const server = await ensureFileServer(session);
  const port = server.address().port;
  const streamUrl = `http://127.0.0.1:${port}/${encodeURIComponent(session.file.name)}`;
  await launchPlayerForSession(session, streamUrl);
}

/**
 * Arrête une session : « Arrêter » (deleteFiles: false) garde le fichier sur le disque et continue de compter
 * comme un torrent gardé — seul le suivi dans le lecteur s'arrête. « Supprimer » efface aussi le fichier.
 *
 * Tant que le temps de partage minimum (ou le ratio d'envoi) n'est pas atteint sur un torrent terminé, les deux
 * actions sont bloquées : les arrêter plus tôt laisserait un hit & run au membre. `force` outrepasse ce blocage
 * (réservé à un usage interne/futur, jamais exposé tel quel au renderer) ; `silent` évite d'afficher la boîte de
 * dialogue individuelle lors d'une opération groupée (voir stopAllSessions).
 */
function removeSession(id, { deleteFiles, force, silent } = {}) {
  const s = sessions.get(id);
  if (!s) return { ok: true };
  const hnr = hnrStatus(s);
  if (hnr.obligated && !hnr.satisfied && !force) {
    if (!silent) {
      const hours = Math.floor(hnr.remainingSeconds / 3600);
      const minutes = Math.floor((hnr.remainingSeconds % 3600) / 60);
      dialog.showMessageBox(downloadsWin, {
        type: 'warning',
        title: 'Hit & Run — partage pas encore terminé',
        message: `« ${s.name} » doit encore partager environ ${hours} h ${minutes} min (ou atteindre un ratio d'envoi de ${HNR_RATIO}) avant de pouvoir être arrêté ou supprimé.`,
        detail: "L'arrêter maintenant compterait comme un hit & run sur Seeduction et bloquerait tes prochains téléchargements tant que ce n'est pas régularisé.",
        buttons: ['Compris'],
      });
    }
    return { ok: false, blocked: true, name: s.name };
  }
  if (s.progressTimer) clearInterval(s.progressTimer);
  stopPositionPolling(s);
  try { if (s.server) s.server.close(); } catch { /* déjà fermé */ }
  if (deleteFiles) markFilesWritable(s.torrent);
  try { s.torrent.destroy({ destroyStore: !!deleteFiles }); } catch { /* déjà détruit */ }
  sessions.delete(id);
  try { fs.unlinkSync(path.join(TORRENTS_DIR, `${id}.torrent`)); } catch { /* déjà absent */ }
  refreshTrayMenu();
  persistSessions();
  broadcastDownloadsUpdate();
  return { ok: true };
}

/**
 * Avertit avant de fermer le logiciel si un torrent n'a pas fini son partage obligatoire : fermer arrête le seed
 * jusqu'au prochain lancement, ce qui retarde d'autant la fin de l'obligation. Ne bloque pas la fermeture (le membre
 * reste libre de fermer son PC), juste un avertissement explicite avant.
 */
function confirmQuit() {
  const pending = [...sessions.values()].filter((s) => { const h = hnrStatus(s); return h.obligated && !h.satisfied; });
  if (pending.length > 0) {
    const choice = dialog.showMessageBoxSync(downloadsWin || undefined, {
      type: 'warning',
      title: 'Partage obligatoire pas terminé',
      message: `${pending.length} torrent(s) n'ont pas fini leur partage obligatoire :\n${pending.map((s) => s.name).join('\n')}`,
      detail: 'Fermer le logiciel maintenant arrête le partage — le compte à rebours ne reprendra qu\'au prochain lancement du client Seeduction.',
      buttons: ['Annuler', 'Fermer quand même'],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 0) return;
  }
  app.exit(0);
}

/** « Tout supprimer » de la fenêtre Téléchargements — nécessite confirmation côté renderer. */
function stopAllSessions({ deleteFiles } = {}) {
  const blockedNames = [];
  for (const id of [...sessions.keys()]) {
    const result = removeSession(id, { deleteFiles, silent: true });
    if (result && result.blocked) blockedNames.push(result.name);
  }
  broadcastDownloadsUpdate();
  if (blockedNames.length > 0) {
    dialog.showMessageBox(downloadsWin, {
      type: 'info',
      title: 'Certains torrents ont été gardés',
      message: `${blockedNames.length} torrent(s) n'ont pas pu être arrêtés/supprimés (temps de partage minimum pas atteint) :\n${blockedNames.join('\n')}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Lancement de Seeduction VLC (ou repli sur le lecteur par défaut du système)
// ---------------------------------------------------------------------------

function findVlc() {
  // La copie incluse dans l'installateur (voir scripts/fetch-vlc.js et package.json "extraResources") : les membres
  // n'ont rien à installer. Seulement disponible une fois empaqueté (electron-builder) — pas en mode développement.
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, 'vlc', process.platform === 'win32' ? 'Seeduction VLC.exe' : 'vlc');
    if (fs.existsSync(bundled)) return bundled;
  }
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

/** Un port local libre, pour l'interface HTTP de contrôle de VLC (une par lecture active, pour permettre plusieurs
 * lectures simultanées sans collision). */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Interroge périodiquement l'interface HTTP de VLC pour savoir où en est la lecture, et le garde dans la session
 * (persisté) pour pouvoir reprendre exactement là au prochain « Visionner » — même après avoir fermé le lecteur. */
function startPositionPolling(session, controlPort, controlPassword) {
  stopPositionPolling(session);
  const authHeader = `Basic ${Buffer.from(`:${controlPassword}`).toString('base64')}`;
  session.positionPollTimer = setInterval(() => {
    const req = http.get(
      { host: '127.0.0.1', port: controlPort, path: '/requests/status.xml', headers: { Authorization: authHeader }, timeout: 2000 },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          const timeMatch = /<time>(\d+)<\/time>/.exec(body);
          const lengthMatch = /<length>(\d+)<\/length>/.exec(body);
          if (timeMatch) {
            session.resumePositionSeconds = Number(timeMatch[1]);
            if (lengthMatch) session.durationSeconds = Number(lengthMatch[1]);
            persistSessions();
          }
        });
      },
    );
    // VLC pas encore démarré, ou déjà fermé : pas grave, on retentera au prochain tick (ou on s'arrêtera via 'exit').
    req.on('error', () => {});
    req.on('timeout', () => req.destroy());
  }, 5000);
}
function stopPositionPolling(session) {
  if (session.positionPollTimer) { clearInterval(session.positionPollTimer); session.positionPollTimer = null; }
}

/** La passkey (announce personnalisé Seeduction + passkey/announce) sert à s'identifier pour « en train de
 * regarder X », sans jamais avoir de session web côté lecteur — même identifiant que le tracker lui-même utilise. */
function extractPasskey(torrent) {
  try {
    const url = (torrent.announce || [])[0] || '';
    const m = /\/([a-f0-9]{16,64})\/announce/i.exec(url);
    return m ? m[1] : null;
  } catch { return null; }
}

/** Ping périodique pendant la lecture : le serveur affiche « 🎬 Regarde X » à la place du statut du membre (jamais
 * pour du contenu adulte, ni si le membre a désactivé ça dans son profil — décidé côté serveur). Auto-expire côté
 * serveur si le lecteur ferme sans prévenir (crash), donc pas grave si `stopWatching` ne s'exécute jamais. */
function pingWatching(session) {
  if (!session.torrentId) return;
  const passkey = extractPasskey(session.torrent);
  if (!passkey) return;
  fetch(`${SITE_BASE_URL}/api/stream/watching`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passkey, torrentId: session.torrentId }),
  }).catch(() => { /* pas grave, on retentera au prochain tick */ });
}

/** Appelé une fois à la fermeture de VLC : revient au statut d'origine tout de suite plutôt que d'attendre
 * l'expiration côté serveur (jusqu'à 30 s). */
function stopWatching(session) {
  if (!session.torrentId) return;
  const passkey = extractPasskey(session.torrent);
  if (!passkey) return;
  fetch(`${SITE_BASE_URL}/api/stream/watching/stop`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passkey }),
  }).catch(() => { /* pas grave */ });
}

/** Lance Seeduction VLC avec son interface HTTP activée (mot de passe aléatoire par lecture, jamais exposé) pour
 * suivre la position de lecture, et reprend automatiquement 5 s avant le dernier point connu — ou depuis le début si
 * le membre avait fini de regarder (moins de 30 s restantes la dernière fois). Repli sur le lecteur par défaut du
 * système (sans reprise ni suivi de position) si VLC est introuvable. */
async function launchPlayerForSession(session, streamUrl) {
  const vlcPath = findVlc();
  const displayName = session.torrentName || session.name;
  if (vlcPath) {
    try {
      const controlPort = await getFreePort();
      const controlPassword = crypto.randomBytes(8).toString('hex');
      const finishedLastTime = session.durationSeconds > 0 && session.resumePositionSeconds >= session.durationSeconds - 30;
      const resumeFrom = finishedLastTime ? 0 : Math.max(0, Math.floor((session.resumePositionSeconds || 0) - 5));
      const args = [
        streamUrl, '--meta-title', displayName,
        '--extraintf', 'http', '--http-host', '127.0.0.1', '--http-port', String(controlPort), '--http-password', controlPassword,
      ];
      if (resumeFrom > 0) args.push(`--start-time=${resumeFrom}`);
      const child = spawn(vlcPath, args, { detached: true, stdio: 'ignore' });
      child.unref();
      session.playing = true;
      child.on('error', (err) => log('Erreur du processus VLC :', err.message));
      child.on('exit', () => {
        session.playing = false;
        stopPositionPolling(session);
        stopWatching(session);
        broadcastDownloadsUpdate();
      });
      startPositionPolling(session, controlPort, controlPassword);
      pingWatching(session);
      broadcastDownloadsUpdate();
      return;
    } catch (err) {
      log('Échec du lancement de VLC avec interface de contrôle, repli sans reprise de lecture :', err.message);
    }
  }
  shell.openExternal(streamUrl);
  dialog.showMessageBox({
    type: 'info',
    title: 'Lecteur Seeduction',
    message: "VLC n'a pas été trouvé sur ton PC — la lecture peut échouer selon le format, et la reprise où tu en étais ne fonctionnera pas. Installe VLC pour une lecture fiable de tous les formats : https://www.videolan.org/vlc/",
  });
}
