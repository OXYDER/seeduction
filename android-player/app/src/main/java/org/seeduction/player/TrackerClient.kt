package org.seeduction.player

import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

/** Réponse d'un tracker : intervalle demandé, pairs (IPv4 + IPv6) ou raison de l'échec. */
class AnnounceReply(val interval: Int, val peers: List<Pair<String, Int>>, val failure: String?, val complete: Int, val incomplete: Int)

/** Décodeur bencode minimal (entiers, chaînes d'octets, listes, dictionnaires) : juste ce qu'il faut pour lire la réponse d'un tracker. */
object Bencode {
    fun decode(data: ByteArray): Any? = Reader(data).read()

    private class Reader(val d: ByteArray) {
        var i = 0
        fun read(): Any? {
            if (i >= d.size) throw IllegalArgumentException("réponse tronquée")
            return when (val c = d[i].toInt().toChar()) {
                'i' -> { i++; val e = indexOf('e'); val n = String(d, i, e - i, Charsets.ISO_8859_1).toLong(); i = e + 1; n }
                'l' -> { i++; val out = mutableListOf<Any?>(); while (peek() != 'e') out.add(read()); i++; out }
                'd' -> { i++; val out = linkedMapOf<String, Any?>(); while (peek() != 'e') { val k = bytes(); out[String(k, Charsets.ISO_8859_1)] = read() }; i++; out }
                in '0'..'9' -> bytes()
                else -> throw IllegalArgumentException("octet inattendu « $c »")
            }
        }
        fun peek(): Char { if (i >= d.size) throw IllegalArgumentException("réponse tronquée"); return d[i].toInt().toChar() }
        fun indexOf(ch: Char): Int { var j = i; while (j < d.size && d[j].toInt().toChar() != ch) j++; if (j >= d.size) throw IllegalArgumentException("réponse tronquée"); return j }
        fun bytes(): ByteArray {
            val colon = indexOf(':')
            val len = String(d, i, colon - i, Charsets.ISO_8859_1).toInt()
            val start = colon + 1
            if (len < 0 || start + len > d.size) throw IllegalArgumentException("réponse tronquée")
            i = start + len
            return d.copyOfRange(start, start + len)
        }
    }
}

object TrackerWire {
    /** Pourcentage-encodage d'un identifiant de 20 octets (info_hash donné en hexadécimal). */
    fun encodeHash(hex: String): String {
        val sb = StringBuilder()
        for (k in 0 until hex.length / 2) sb.append('%').append(hex.substring(k * 2, k * 2 + 2).uppercase())
        return sb.toString()
    }

    /** Adresse complète d'une annonce (le .torrent du site contient déjà « ?stream=1 »). */
    fun announceUrl(base: String, infoHashHex: String, peerId: String, port: Int, uploaded: Long, downloaded: Long, left: Long, event: String?): String {
        val sep = if (base.contains('?')) '&' else '?'
        val sb = StringBuilder(base).append(sep)
            .append("info_hash=").append(encodeHash(infoHashHex))
            .append("&peer_id=").append(peerId)
            .append("&port=").append(port)
            .append("&uploaded=").append(uploaded).append("&downloaded=").append(downloaded).append("&left=").append(left)
            .append("&compact=1&numwant=60")
        if (event != null) sb.append("&event=").append(event)
        return sb.toString()
    }

    fun parse(body: ByteArray): AnnounceReply {
        @Suppress("UNCHECKED_CAST")
        val dict = Bencode.decode(body) as? Map<String, Any?> ?: throw IllegalArgumentException("réponse du tracker illisible")
        val failure = (dict["failure reason"] as? ByteArray)?.let { String(it, Charsets.UTF_8) }
        val peers = mutableListOf<Pair<String, Int>>()
        when (val p = dict["peers"]) {
            is ByteArray -> compact(p, 4, peers)
            is List<*> -> p.forEach { e -> (e as? Map<*, *>)?.let { m ->
                val ip = (m["ip"] as? ByteArray)?.let { String(it, Charsets.UTF_8) }; val port = (m["port"] as? Long)?.toInt()
                if (ip != null && port != null) peers.add(ip to port)
            } }
        }
        (dict["peers6"] as? ByteArray)?.let { compact(it, 16, peers) }
        return AnnounceReply(
            interval = ((dict["interval"] as? Long) ?: 1800L).toInt(), peers = peers, failure = failure,
            complete = ((dict["complete"] as? Long) ?: 0L).toInt(), incomplete = ((dict["incomplete"] as? Long) ?: 0L).toInt(),
        )
    }

    private fun compact(b: ByteArray, ipLen: Int, out: MutableList<Pair<String, Int>>) {
        val step = ipLen + 2
        var o = 0
        while (o + step <= b.size) {
            val addr = InetAddress.getByAddress(b.copyOfRange(o, o + ipLen)).hostAddress ?: ""
            val port = ((b[o + ipLen].toInt() and 0xff) shl 8) or (b[o + ipLen + 1].toInt() and 0xff)
            if (port in 1..65535 && addr.isNotEmpty()) out.add(addr to port)
            o += step
        }
    }

    /** « -LT2000-xxxxxxxxxxxx » : le tracker du site n'impose rien au lecteur (annonces marquées lecteur), mais le format classique évite tout doute. */
    fun newPeerId(): String {
        val chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        val r = java.security.SecureRandom()
        return "-LT2000-" + (1..12).map { chars[r.nextInt(chars.length)] }.joinToString("")
    }
}

/**
 * Annonces au tracker faites par l'application elle-même (HTTPS d'Android, qui connaît les certificats du téléphone) : sur certains appareils et émulateurs
 * (BlueStacks) le moteur de téléchargement n'arrive pas à ouvrir la connexion sécurisée vers le tracker et ne trouvait donc jamais de pairs.
 * Les pairs reçus sont donnés au moteur, qui s'y connecte lui-même.
 */
class TrackerClient(private val engine: TorrentEngine) {
    private val peerId = TrackerWire.newPeerId()
    private val jobs = ConcurrentHashMap<String, Job>()
    private val status = ConcurrentHashMap<String, String>()

    fun statusOf(hash: String): String? = status[hash]

    fun start(h: org.libtorrent4j.TorrentHandle, base: String) {
        val hash = h.infoHash().toHex()
        if (jobs[hash]?.isActive == true) { return }
        jobs[hash] = AppScope.scope.launch {
            var event: String? = "started"
            var failures = 0
            while (isActive) {
                var wait = 1800
                try {
                    val st = h.status()
                    val left = (st.totalWanted() - st.totalWantedDone()).coerceAtLeast(0)
                    val url = TrackerWire.announceUrl(base, hash, peerId, engine.listenPort(), st.allTimeUpload(), st.allTimeDownload(), left, event)
                    val reply = fetch(url)
                    if (reply.failure != null) throw IllegalStateException("le tracker refuse : " + reply.failure)
                    failures = 0
                    event = null
                    var added = 0
                    for ((ip, port) in reply.peers) { if (engine.connectPeer(h, ip, port)) added++ }
                    status[hash] = "annonce OK : " + reply.peers.size + " pair(s) reçu(s), " + reply.complete + " seeder(s) / " + reply.incomplete + " leecher(s) selon le tracker"
                    Journal.log("tracker : " + status[hash])
                    // Sans aucun pair, on réessaie assez vite (sans passer sous 2 minutes : le tracker y verrait un abus).
                    wait = if (reply.peers.isEmpty()) 125 else reply.interval.coerceIn(125, 1800)
                } catch (e: Exception) {
                    failures++
                    val why = e.javaClass.simpleName + (e.message?.let { " : $it" } ?: "")
                    status[hash] = "annonce en échec ($failures) : $why"
                    Journal.log("tracker : " + status[hash])
                    wait = minOf(300, 30 * failures)
                }
                delay(wait * 1000L)
            }
        }
    }

    /** Dit au tracker qu'on quitte le torrent (il oublie notre adresse tout de suite). */
    fun stop(h: org.libtorrent4j.TorrentHandle, base: String?) {
        val hash = try { h.infoHash().toHex() } catch (_: Throwable) { return }
        jobs.remove(hash)?.cancel()
        status.remove(hash)
        if (base == null) return
        AppScope.scope.launch {
            try {
                val st = h.status()
                fetch(TrackerWire.announceUrl(base, hash, peerId, engine.listenPort(), st.allTimeUpload(), st.allTimeDownload(), (st.totalWanted() - st.totalWantedDone()).coerceAtLeast(0), "stopped"))
            } catch (_: Throwable) { /* pas grave : le tracker oubliera de lui-même */ }
        }
    }

    private fun fetch(url: String): AnnounceReply {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 15_000; c.readTimeout = 20_000
            c.setRequestProperty("User-Agent", "Seeduction-Android/" + Config.APP_VERSION)
            val code = c.responseCode
            val body = (if (code in 200..299) c.inputStream else c.errorStream)?.use { it.readBytes() } ?: ByteArray(0)
            if (body.isEmpty()) throw IllegalStateException("HTTP $code sans réponse")
            return TrackerWire.parse(body)
        } finally { c.disconnect() }
    }
}
