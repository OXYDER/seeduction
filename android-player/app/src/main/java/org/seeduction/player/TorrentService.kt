package org.seeduction.player

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.libtorrent4j.TorrentHandle
import java.io.File
import java.io.InputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** Un torrent actif dans le service : sa fiche enregistrée, son handle libtorrent et la carte du fichier lu. */
class Entry(val info: SessionInfo, val handle: TorrentHandle, val map: FileMap) {
    @Volatile var paused = false
    @Volatile var closed = false
}

/**
 * Le moteur qui vit tant qu'il y a des torrents à lire ou à partager : service au premier plan (une notification discrète indique le partage en cours), pour que le téléchargement
 * et le seed continuent écran éteint. Comme le lecteur Windows, c'est un vrai client BitTorrent : le fichier reste sur le téléphone et continue d'être partagé après la lecture.
 */
class TorrentService : Service(), StreamSource {
    inner class LocalBinder : Binder() { val service: TorrentService get() = this@TorrentService }

    private val binder = LocalBinder()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val entries = ConcurrentHashMap<String, Entry>()
    private lateinit var prefs: Prefs
    lateinit var engine: TorrentEngine
    private lateinit var server: StreamServer
    private var wake: PowerManager.WakeLock? = null
    private var started = false

    val port: Int get() = server.listeningPort

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        Journal.init(this)
        prefs = Prefs(this)
        createChannel()
        showForeground("Préparation du partage…")
        val dir = getExternalFilesDir("Seeduction") ?: File(filesDir, "Seeduction")
        engine = TorrentEngine(dir)
        engine.start()
        server = StreamServer(this)
        server.start(60_000, false)
        Journal.log("serveur local sur le port " + server.listeningPort)
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "seeduction:partage").apply { setReferenceCounted(false); acquire() }
        restore()
        started = true
        scope.launch { loop() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP_ALL) {
            entries.values.forEach { pause(it.info.id, true) }
            stopSelfIfIdle(force = true)
        }
        return START_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        try { server.stop() } catch (_: Exception) { /* déjà arrêté */ }
        engine.stop()
        try { wake?.release() } catch (_: Exception) { /* déjà relâché */ }
        super.onDestroy()
    }

    // ------------------------------------------------------------------ sessions

    private fun saveAll() = prefs.saveSessions(entries.values.map { it.info })

    private fun torrentCopy(id: String) = File(File(filesDir, "torrents").apply { mkdirs() }, "$id.torrent")

    /** Reprend les partages enregistrés (le téléphone ou le logiciel a redémarré). */
    private fun restore() {
        for (s in prefs.sessions()) {
            if (s.stopped) { entries.remove(s.id); continue }
            try {
                val f = torrentCopy(s.id)
                if (!f.exists()) continue
                val h = engine.add(f.readBytes(), s.fileIndex)
                entries[s.id] = Entry(s, h, FileMap(h.torrentFile(), s.fileIndex))
                Journal.log("partage repris : " + s.name)
            } catch (e: Exception) { Journal.log("reprise impossible : " + e.message) }
        }
    }

    /** Ajoute (ou retrouve) le torrent d'une lecture et commence à télécharger le fichier choisi. À appeler hors du fil principal. */
    fun addSession(play: PlaySession): SessionInfo {
        val handle = engine.add(play.torrent, play.fileIndex)
        val hash = handle.infoHash().toHex()
        val ti = handle.torrentFile()
        val existing = entries.values.firstOrNull { it.info.infoHash == hash }
        val passkey = handle.trackers().firstNotNullOfOrNull { extractPasskey(it.url()) }
        val id = existing?.info?.id ?: UUID.randomUUID().toString()
        val info = SessionInfo(
            id = id, infoHash = hash, name = play.torrentName ?: ti.name(), torrentId = play.torrentId ?: existing?.info?.torrentId, fileIndex = play.fileIndex,
            coverImage = play.coverImage ?: existing?.info?.coverImage, passkey = passkey ?: existing?.info?.passkey, addedAt = existing?.info?.addedAt ?: System.currentTimeMillis(),
            completedAt = existing?.info?.completedAt ?: 0,
        )
        val entry = Entry(info, handle, FileMap(ti, play.fileIndex))
        entries[id] = entry
        torrentCopy(id).writeBytes(play.torrent)
        engine.primePrebuffer(handle, entry.map)
        saveAll()
        Journal.log("lecture ajoutée : " + info.name + " (fichier " + play.fileIndex + ")")
        return info
    }

    fun entry(id: String): Entry? = entries[id]
    fun streamUrl(id: String) = "http://127.0.0.1:$port/stream/$id"
    override fun streamEntry(id: String): Entry? = entries[id]?.takeIf { !it.closed }

    override fun openStream(entry: Entry, start: Long, end: Long): InputStream {
        engine.prioritize(entry.handle, entry.map, start)
        return PieceInputStream(engine, entry.handle, entry.map, engine.fileOf(entry.map), start, end) { entry.closed }
    }

    fun prebuffer(id: String): Float = entries[id]?.let { engine.prebuffer(it.handle, it.map) } ?: 0f

    fun stats(id: String): SessionStats? = entries[id]?.let { engine.stats(it.handle, it.map, it.paused) }

    fun all(): List<Pair<SessionInfo, SessionStats>> = entries.values.sortedByDescending { it.info.addedAt }.map { it.info to engine.stats(it.handle, it.map, it.paused) }

    fun pause(id: String, stopped: Boolean) {
        val e = entries[id] ?: return
        e.paused = true
        e.info.stopped = stopped
        try { e.handle.pause() } catch (_: Exception) { /* déjà en pause */ }
        saveAll()
    }

    fun resume(id: String) {
        val e = entries[id] ?: return
        e.paused = false
        e.info.stopped = false
        try { e.handle.resume() } catch (_: Exception) { /* déjà actif */ }
        saveAll()
    }

    fun remove(id: String, deleteFiles: Boolean) {
        val e = entries.remove(id) ?: return
        e.closed = true
        engine.remove(e.handle, deleteFiles)
        torrentCopy(id).delete()
        saveAll()
        stopSelfIfIdle()
    }

    private fun stopSelfIfIdle(force: Boolean = false) {
        if (force || entries.isEmpty()) {
            Journal.log("plus rien à partager : arrêt du service")
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    // ------------------------------------------------------------------ boucle de surveillance et notification

    private suspend fun loop() {
        while (true) {
            delay(3000)
            try {
                val unmetered = isUnmetered(this)
                var down = 0; var up = 0; var active = 0
                for (e in entries.values) {
                    val st = engine.stats(e.handle, e.map, e.paused)
                    if (st.finished && e.info.completedAt == 0L) { e.info.completedAt = System.currentTimeMillis(); saveAll(); Journal.log("téléchargement terminé : " + e.info.name) }
                    // Partage seulement en Wi-Fi (réglage) : le fichier terminé est mis en pause sur données mobiles. Une lecture en cours, elle, n'est jamais coupée.
                    if (st.finished && !e.info.stopped) {
                        val wantSeed = unmetered || !prefs.wifiOnlySeed
                        if (!wantSeed && !e.paused) { e.paused = true; e.handle.pause() }
                        else if (wantSeed && e.paused) { e.paused = false; e.handle.resume() }
                    }
                    if (!e.paused) { down += st.downRate; up += st.upRate; active++ }
                }
                val text = if (entries.isEmpty()) "Aucun partage" else
                    "$active en cours · ↓ ${formatSpeed(down)} · ↑ ${formatSpeed(up)}" + (if (prefs.wifiOnlySeed && !unmetered) " · partage en pause (données mobiles)" else "")
                (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIF_ID, notification(text))
            } catch (e: Exception) { Journal.log("surveillance : " + e.message) }
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val ch = NotificationChannel(CHANNEL, "Partage Seeduction", NotificationManager.IMPORTANCE_LOW)
            ch.description = "Indique que Seeduction télécharge ou partage un torrent en arrière-plan."
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
        }
    }

    private fun notification(text: String): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val stop = PendingIntent.getService(this, 1, Intent(this, TorrentService::class.java).setAction(ACTION_STOP_ALL), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Seeduction")
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .addAction(0, "Tout arrêter", stop)
            .build()
    }

    private fun showForeground(text: String) {
        val n = notification(text)
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC) else startForeground(NOTIF_ID, n)
    }

    companion object {
        const val CHANNEL = "partage"
        const val NOTIF_ID = 42
        const val ACTION_STOP_ALL = "org.seeduction.player.STOP_ALL"
    }
}
