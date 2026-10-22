package org.seeduction.player

import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** Réponse du site à un lien de lecture : le .torrent personnalisé du membre (avec sa passkey) et le fichier à lire. */
class PlaySession(val torrent: ByteArray, val fileIndex: Int, val torrentId: String?, val torrentName: String?, val coverImage: String?)

class SubtitleFile(val file: File, val iso3: String?)

/** La dernière version de l'application publiée par le site (Admin > Lecteurs) et son adresse de téléchargement. */
class AppRelease(val version: String, val size: Long, val notes: String?, val url: String)

/** Un direct en cours : l'adresse du flux sur le relais (jamais celle de la source) et le titre de l'émission. */
class LiveInfo(val playbackUrl: String, val title: String)

/** Dialogue avec le site Seeduction (jeton de lecture, suivi « en train de regarder », sous-titres partagés). Aucune session web : tout passe par le jeton ou la passkey, comme le lecteur Windows. */
object SiteApi {
    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    private fun open(url: String, method: String = "GET", body: String? = null, timeoutMs: Int = 15000): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = method
        c.connectTimeout = timeoutMs; c.readTimeout = timeoutMs
        c.setRequestProperty("User-Agent", "Seeduction-Android/" + Config.APP_VERSION)
        if (body != null) {
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.outputStream.use { it.write(body.toByteArray()) }
        }
        return c
    }

    private fun readAll(c: HttpURLConnection): String {
        val stream = if (c.responseCode in 200..299) c.inputStream else (c.errorStream ?: return "")
        return stream.bufferedReader().use { it.readText() }
    }

    /** Échange le jeton du lien seeduction://stream/<jeton> contre le .torrent et le fichier à lire. */
    suspend fun session(token: String): PlaySession = withContext(Dispatchers.IO) {
        val c = open(Config.SITE + "/api/stream/session/" + enc(token))
        val text = readAll(c)
        if (c.responseCode !in 200..299) {
            val msg = try { JSONObject(text).optString("message") } catch (_: Exception) { "" }
            throw IllegalStateException(msg.ifEmpty { "Le lien de lecture a expiré ou est invalide (" + c.responseCode + "). Relance-le depuis Seeduction." })
        }
        val o = JSONObject(text)
        PlaySession(
            torrent = Base64.decode(o.getString("torrentBase64"), Base64.DEFAULT),
            fileIndex = o.optInt("fileIndex", 0),
            torrentId = o.optString("torrentId").ifEmpty { null },
            torrentName = o.optString("torrentName").ifEmpty { null },
            coverImage = o.optString("coverImage").ifEmpty { null },
        )
    }

    /** Échange le jeton du lien seeduction://live/<jeton> (à usage unique) contre l'adresse du direct en cours. */
    suspend fun live(token: String): LiveInfo = withContext(Dispatchers.IO) {
        val c = open(Config.SITE + "/api/live/player/" + enc(token))
        val text = readAll(c)
        if (c.responseCode !in 200..299) {
            val msg = try { JSONObject(text).optString("message") } catch (_: Exception) { "" }
            throw IllegalStateException(msg.ifEmpty { "Le lien du direct a expiré ou est invalide (" + c.responseCode + "). Relance-le depuis la page Direct." })
        }
        val o = JSONObject(text)
        val url = o.optString("playbackUrl")
        if (!Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(url)) throw IllegalStateException("Adresse du direct invalide.")
        LiveInfo(url, o.optString("title").ifEmpty { "Direct" })
    }

    /** Dernière version Android publiée sur le site, ou null si rien n'est publié. */
    suspend fun latestAndroid(): AppRelease? = withContext(Dispatchers.IO) {
        val c = open(Config.SITE + "/api/downloads/players")
        val text = readAll(c)
        if (c.responseCode !in 200..299) throw IllegalStateException("Le site a répondu " + c.responseCode)
        val a = JSONObject(text).optJSONObject("android") ?: return@withContext null
        AppRelease(a.getString("version"), a.optLong("size"), a.optString("notes").ifEmpty { null }, a.getString("url"))
    }

    /** « 🎬 Regarde X » sur le site + position de lecture (pour « Reprendre à xx:xx » et « Continuer à regarder »). Jamais bloquant. */
    suspend fun watching(passkey: String, torrentId: String, fileIndex: Int, positionSeconds: Int, durationSeconds: Int) {
        withContext(Dispatchers.IO) {
            try {
                val body = JSONObject().put("passkey", passkey).put("torrentId", torrentId).put("fileIndex", fileIndex)
                    .put("positionSeconds", positionSeconds).put("durationSeconds", durationSeconds).toString()
                val c = open(Config.SITE + "/api/stream/watching", "POST", body, 8000)
                c.responseCode; c.disconnect()
            } catch (e: Exception) { Journal.log("ping « regarde » : " + e.message) }
        }
    }

    suspend fun stopWatching(passkey: String) {
        withContext(Dispatchers.IO) {
            try {
                val c = open(Config.SITE + "/api/stream/watching/stop", "POST", JSONObject().put("passkey", passkey).toString(), 6000)
                c.responseCode; c.disconnect()
            } catch (_: Exception) { /* pas grave */ }
        }
    }

    /** Dernière position connue du site pour ce fichier (une reprise qui suit le membre d'un appareil à l'autre) ; 0 si inconnue. */
    suspend fun serverPosition(passkey: String, torrentId: String, fileIndex: Int): Int = withContext(Dispatchers.IO) {
        try {
            val c = open(Config.SITE + "/api/stream/resume?passkey=" + enc(passkey) + "&torrentId=" + enc(torrentId) + "&fileIndex=" + fileIndex, timeoutMs = 6000)
            val text = readAll(c)
            if (c.responseCode !in 200..299) 0 else JSONObject(text).optInt("positionSeconds", 0)
        } catch (_: Exception) { 0 }
    }

    /** Sous-titres partagés par les membres sur la fiche du torrent, copiés dans le dossier de cache. Jamais bloquant. */
    suspend fun subtitles(passkey: String, torrentId: String, fileIndex: Int, dir: File): List<SubtitleFile> = withContext(Dispatchers.IO) {
        try {
            val c = open(Config.SITE + "/api/subtitles/player?passkey=" + enc(passkey) + "&torrentId=" + enc(torrentId) + "&fileIndex=" + fileIndex, timeoutMs = 6000)
            if (c.responseCode !in 200..299) return@withContext emptyList()
            val arr = JSONArray(readAll(c))
            dir.mkdirs()
            val out = mutableListOf<SubtitleFile>()
            for (i in 0 until minOf(arr.length(), 8)) {
                val s = arr.getJSONObject(i)
                val id = s.optString("id")
                if (id.isEmpty()) continue
                val r = open(Config.SITE + "/api/subtitles/" + enc(id) + "/play?passkey=" + enc(passkey), timeoutMs = 8000)
                if (r.responseCode !in 200..299) continue
                val iso = s.optString("iso3").ifEmpty { null }
                val f = File(dir, (iso ?: "und").filter { it.isLetter() }.take(3).ifEmpty { "und" } + "-" + (i + 1) + ".srt")
                f.writeText(readAll(r))
                out.add(SubtitleFile(f, iso))
            }
            out
        } catch (e: Exception) { Journal.log("sous-titres indisponibles : " + e.message); emptyList() }
    }
}
