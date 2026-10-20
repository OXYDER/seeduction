package org.seeduction.player

import org.libtorrent4j.Priority
import org.libtorrent4j.AlertListener
import org.libtorrent4j.SessionManager
import org.libtorrent4j.alerts.Alert
import org.libtorrent4j.alerts.AlertType
import org.libtorrent4j.SessionParams
import org.libtorrent4j.SettingsPack
import org.libtorrent4j.TorrentFlags
import org.libtorrent4j.TorrentHandle
import org.libtorrent4j.TorrentInfo
import org.libtorrent4j.swig.settings_pack
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.RandomAccessFile

/** Où est un fichier du torrent, en octets et en morceaux (« pièces ») : sert à savoir quels morceaux couvrent une zone du fichier. */
class FileMap(val ti: TorrentInfo, val fileIndex: Int) {
    private val fs = ti.files()
    val size: Long = fs.fileSize(fileIndex)
    val offset: Long = fs.fileOffset(fileIndex)
    val pieceLength: Int = ti.pieceLength()
    val path: String = fs.filePath(fileIndex)
    val name: String = fs.fileName(fileIndex)

    fun pieceAt(pos: Long): Int = ((offset + pos.coerceIn(0, (size - 1).coerceAtLeast(0))) / pieceLength).toInt()
    val firstPiece: Int get() = pieceAt(0)
    val lastPiece: Int get() = pieceAt(size - 1)
}

/** Ce qu'on affiche à l'écran sur une lecture ou un partage. */
class SessionStats(
    val progress: Float,          // fichier regardé : 0 à 1
    val fileSize: Long,
    val downRate: Int,
    val upRate: Int,
    val peers: Int,
    val seeds: Int,
    val state: String,
    val uploaded: Long,
    val torrentSize: Long,
    val seedingSeconds: Long,
    val finished: Boolean,
    val paused: Boolean,
) {
    val ratio: Double get() = if (torrentSize > 0) uploaded.toDouble() / torrentSize else 0.0
    /** L'obligation de partage (72 h ou ratio 1) est-elle remplie, d'après nos estimations locales ? */
    val obligationDone: Boolean get() = finished && (seedingSeconds >= Config.HNR_SEED_HOURS * 3600L || ratio >= Config.HNR_RATIO)
}

/** Le client BitTorrent (libtorrent) : ajoute un torrent, télécharge dans l'ordre et en priorité la zone qu'on lit, dit quels morceaux sont arrivés. */
class TorrentEngine(private val saveDir: File) {
    val sm = SessionManager()
    private val events = java.util.ArrayDeque<String>()

    /** Les derniers événements utiles au diagnostic (réponses et erreurs du tracker, connexions de pairs), les plus récents en dernier. */
    fun recentEvents(n: Int): List<String> = synchronized(events) { events.toList().takeLast(n) }

    private fun note(line: String) {
        synchronized(events) { events.addLast(line); while (events.size > 40) events.removeFirst() }
        Journal.log(line)
    }

    fun start() {
        val sp = SettingsPack()
        sp.setString(settings_pack.string_types.user_agent.swigValue(), "Seeduction-Android/" + Config.APP_VERSION)
        sp.connectionsLimit(150)
        // Alertes utiles : erreurs, tracker, connexions, état (pour expliquer à l'écran pourquoi aucun pair n'arrive).
        sp.setInteger(settings_pack.int_types.alert_mask.swigValue(), 1 or 16 or 32 or 64)
        sm.addListener(object : AlertListener {
            override fun types(): IntArray? = null
            override fun alert(alert: Alert<*>) {
                when (alert.type()) {
                    AlertType.TRACKER_REPLY, AlertType.TRACKER_ERROR, AlertType.TRACKER_WARNING, AlertType.TORRENT_ERROR,
                    AlertType.LISTEN_SUCCEEDED, AlertType.LISTEN_FAILED, AlertType.PEER_ERROR -> note(alert.message())
                    else -> {}
                }
            }
        })
        sm.start(SessionParams(sp))
        saveDir.mkdirs()
        Journal.log("libtorrent démarré, dossier : " + saveDir.absolutePath)
    }

    /** État de chaque tracker du torrent (adresse sans la passkey) : fonctionne, en cours, ou échec avec le message du serveur. Sert au diagnostic quand aucun pair n'arrive. */
    fun trackerLines(h: TorrentHandle): List<String> {
        val list = try { h.trackers() } catch (e: Throwable) { return listOf("trackers illisibles : " + e.javaClass.simpleName + " " + (e.message ?: "")) }
        if (list.isEmpty()) return listOf("aucun tracker dans le torrent")
        return list.map { t ->
            val url = try { t.url().replace(Regex("/[^/?]+/announce"), "/…/announce") } catch (_: Throwable) { "?" }
            val state = try {
                val eps = t.endpoints()
                if (eps.isEmpty()) "pas encore contacté" else eps.joinToString(" ; ") { e ->
                    val v = e.infohashV1()
                    (if (v.isWorking) "OK" else if (v.updating()) "contact en cours…" else "échec ×" + v.fails()) + (v.message().takeIf { it.isNotBlank() }?.let { " : $it" } ?: "")
                }
            } catch (e: Throwable) { "état illisible : " + e.javaClass.simpleName }
            "$url → $state"
        }
    }

    /** Si libtorrent n'a retenu aucun tracker (ou ne le contacte pas), on l'ajoute nous-mêmes depuis le .torrent et on force l'annonce. */
    fun ensureTracker(h: TorrentHandle, announce: String?) {
        if (announce == null) return
        try {
            val known = try { h.trackers() } catch (_: Throwable) { emptyList() }
            if (known.none { it.url() == announce }) {
                h.addTracker(org.libtorrent4j.AnnounceEntry(announce))
                Journal.log("tracker ajouté à la main")
            }
            h.forceReannounce()
        } catch (e: Throwable) { Journal.log("ajout du tracker impossible : " + e.message) }
    }

    fun stop() { try { sm.stop() } catch (_: Exception) { /* déjà arrêté */ } }

    /** Ajoute le torrent (ou retrouve celui déjà présent) et ne télécharge que le fichier choisi, dans l'ordre. */
    fun add(torrentBytes: ByteArray, fileIndex: Int, peers: List<org.libtorrent4j.TcpEndpoint>? = null): TorrentHandle {
        val ti = TorrentInfo(torrentBytes)
        val hash = ti.infoHash()
        val existing = sm.find(hash)
        if (existing != null && existing.isValid) {
            existing.filePriority(fileIndex, Priority.TOP_PRIORITY)
            existing.setFlags(TorrentFlags.SEQUENTIAL_DOWNLOAD)
            existing.resume()
            return existing
        }
        val priorities = Priority.array(Priority.IGNORE, ti.numFiles())
        priorities[fileIndex] = Priority.TOP_PRIORITY
        sm.download(ti, saveDir, null, priorities, peers, TorrentFlags.SEQUENTIAL_DOWNLOAD)
        // L'ajout est asynchrone : on attend que libtorrent connaisse le torrent.
        for (i in 0 until 100) {
            val h = sm.find(hash)
            if (h != null && h.isValid) return h
            Thread.sleep(100)
        }
        throw IOException("Impossible de démarrer le téléchargement")
    }

    fun find(infoHashHex: String): TorrentHandle? = try {
        sm.find(org.libtorrent4j.Sha1Hash.parseHex(infoHashHex))?.takeIf { it.isValid }
    } catch (_: Exception) { null }

    fun remove(handle: TorrentHandle, deleteFiles: Boolean) {
        try {
            if (deleteFiles) sm.remove(handle, org.libtorrent4j.SessionHandle.DELETE_FILES) else sm.remove(handle)
        } catch (e: Exception) { Journal.log("retrait : " + e.message) }
    }

    /** Demande en priorité les morceaux qui suivent la position de lecture (les plus urgents en premier). */
    fun prioritize(handle: TorrentHandle, map: FileMap, pos: Long) {
        val ahead = (Config.READ_AHEAD_BYTES / map.pieceLength).toInt().coerceIn(4, 64)
        val first = map.pieceAt(pos)
        val last = minOf(map.lastPiece, first + ahead)
        for (p in first..last) {
            if (handle.havePiece(p)) continue
            handle.piecePriority(p, Priority.TOP_PRIORITY)
            handle.setPieceDeadline(p, 80 + (p - first) * 180)
        }
    }

    /** Bloque jusqu'à ce que tous les morceaux qui couvrent [pos, pos+len) soient arrivés (ou lève une erreur après `timeoutMs`). */
    fun ensure(handle: TorrentHandle, map: FileMap, pos: Long, len: Int, timeoutMs: Long, cancelled: () -> Boolean) {
        val firstP = map.pieceAt(pos)
        val lastP = map.pieceAt(pos + len - 1)
        var p = firstP
        if ((firstP..lastP).all { handle.havePiece(it) }) return
        prioritize(handle, map, pos)
        val until = System.currentTimeMillis() + timeoutMs
        var lastPrio = System.currentTimeMillis()
        while (true) {
            while (p <= lastP && handle.havePiece(p)) p++
            if (p > lastP) return
            if (cancelled()) throw IOException("annulé")
            if (System.currentTimeMillis() > until) throw IOException("Aucun seeder ne répond : le morceau $p n'arrive pas")
            if (System.currentTimeMillis() - lastPrio > 2500) { prioritize(handle, map, pos); lastPrio = System.currentTimeMillis() }
            Thread.sleep(120)
        }
    }

    /** Début du fichier + dernier morceau (l'index d'un .mkv / .mp4 est souvent à la fin) : prêts pour lancer la lecture ? Renvoie la part prête, de 0 à 1. */
    fun prebuffer(handle: TorrentHandle, map: FileMap): Float {
        val head = map.pieceAt((Config.PREBUFFER_BYTES - 1).coerceAtMost(map.size - 1))
        val needed = (map.firstPiece..head).toMutableList()
        if (map.lastPiece > head) needed.add(map.lastPiece)
        val have = needed.count { handle.havePiece(it) }
        return have.toFloat() / needed.size
    }

    /** Demande les morceaux du début et de la fin, pour que la lecture démarre vite. */
    fun primePrebuffer(handle: TorrentHandle, map: FileMap) {
        val head = map.pieceAt((Config.PREBUFFER_BYTES - 1).coerceAtMost(map.size - 1))
        for (p in map.firstPiece..head) { handle.piecePriority(p, Priority.TOP_PRIORITY); handle.setPieceDeadline(p, 50 + (p - map.firstPiece) * 120) }
        if (map.lastPiece > head) { handle.piecePriority(map.lastPiece, Priority.TOP_PRIORITY); handle.setPieceDeadline(map.lastPiece, 400) }
    }

    fun stats(handle: TorrentHandle, map: FileMap, paused: Boolean): SessionStats {
        val st = handle.status()
        val fileDone = try { handle.fileProgress()[map.fileIndex] } catch (_: Exception) { 0L }
        val progress = if (map.size > 0) (fileDone.toFloat() / map.size).coerceIn(0f, 1f) else 0f
        return SessionStats(
            progress = progress, fileSize = map.size, downRate = st.downloadPayloadRate(), upRate = st.uploadPayloadRate(),
            peers = st.numPeers(), seeds = st.numSeeds(), state = st.state().name,
            uploaded = st.allTimeUpload(), torrentSize = st.total(), seedingSeconds = st.seedingDuration(),
            finished = progress >= 0.9999f, paused = paused,
        )
    }

    fun fileOf(map: FileMap): File = File(saveDir, map.path)
}

/** Flux de lecture d'une zone du fichier en cours de téléchargement : chaque lecture attend les morceaux nécessaires. Sert VLC par HTTP. */
class PieceInputStream(
    private val engine: TorrentEngine, private val handle: TorrentHandle, private val map: FileMap, private val file: File,
    start: Long, private val endInclusive: Long, private val cancelled: () -> Boolean,
) : InputStream() {
    private var pos = start
    private var raf: RandomAccessFile? = null

    private fun open(): RandomAccessFile {
        raf?.let { return it }
        val until = System.currentTimeMillis() + 120_000
        while (!file.exists()) { // libtorrent crée le fichier à la première écriture
            if (cancelled() || System.currentTimeMillis() > until) throw IOException("Fichier introuvable")
            Thread.sleep(150)
        }
        return RandomAccessFile(file, "r").also { raf = it }
    }

    override fun read(): Int {
        val b = ByteArray(1)
        return if (read(b, 0, 1) <= 0) -1 else (b[0].toInt() and 0xFF)
    }

    override fun read(b: ByteArray, off: Int, len: Int): Int {
        if (pos > endInclusive) return -1
        val chunk = minOf(len.toLong(), endInclusive - pos + 1, 256L * 1024).toInt()
        engine.ensure(handle, map, pos, chunk, 150_000, cancelled)
        val f = open()
        f.seek(pos)
        val n = f.read(b, off, chunk)
        if (n > 0) pos += n
        return n
    }

    override fun available(): Int = 0
    override fun close() { try { raf?.close() } catch (_: Exception) { /* déjà fermé */ } }
}
