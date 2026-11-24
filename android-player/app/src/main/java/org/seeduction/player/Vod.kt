package org.seeduction.player

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import android.widget.ImageView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/** « Seeduction Cinéma » : le catalogue vidéo (réservé aux donateurs, fondateurs et uploaders). Les modèles ci-dessous reflètent les réponses de /api/vod. */

/** La session du catalogue a expiré ou n'est plus autorisée : l'écran repasse à l'association par code. */
class VodAuthException(message: String) : Exception(message)

class VodItem(
    val id: String, val title: String, val subtitle: String?, val year: Int?, val kind: String?, val cover: String?,
    val seeders: Int, val health: String?, val quality: String?, val percent: Int?, val playTorrentId: String?, val playFileIndex: Int,
)

class VodRail(val id: String, val title: String, val items: List<VodItem>)

class VodVersion(
    val id: String, val label: String, val size: Long, val seeders: Int, val health: String, val fileIndex: Int, val percent: Int?, val subtitles: List<String>,
)

class VodEpisode(
    val season: Int?, val episode: Int?, val label: String, val torrentId: String, val fileIndex: Int,
    val size: Long, val seeders: Int, val health: String, val resolution: String?, val language: String?, val percent: Int?,
)

class VodTitle(
    val id: String, val title: String, val year: Int?, val kind: String, val cover: String?, val backdrop: String?, val synopsis: String?,
    val rating: Double?, val runtime: Int?, val genres: List<String>, val versions: List<VodVersion>, val episodes: List<VodEpisode>,
)

private fun JSONObject.str(k: String): String? = if (isNull(k)) null else optString(k).ifEmpty { null }
private fun JSONObject.intOrNull(k: String): Int? = if (isNull(k) || !has(k)) null else optInt(k)

private fun itemOf(o: JSONObject): VodItem {
    val play = o.optJSONObject("play")
    return VodItem(
        id = o.getString("id"), title = o.optString("title"), subtitle = o.str("subtitle"), year = o.intOrNull("year"), kind = o.str("kind"), cover = o.str("cover"),
        seeders = o.optInt("seeders"), health = o.str("health"), quality = o.str("quality"), percent = o.intOrNull("percent"),
        playTorrentId = play?.optString("torrentId")?.ifEmpty { null }, playFileIndex = play?.optInt("fileIndex", 0) ?: 0,
    )
}

object VodApi {
    private fun call(path: String, token: String?, method: String = "GET", body: String? = null): JSONObject {
        val c: HttpURLConnection = SiteApi.open(Config.SITE + "/api/vod" + path, method, body, 20000)
        if (token != null) c.setRequestProperty("Authorization", "Bearer $token")
        val text = SiteApi.readAll(c)
        val code = c.responseCode
        if (code !in 200..299) {
            val msg = try { JSONObject(text).optString("message") } catch (_: Exception) { "" }
            if (code == 401) throw VodAuthException(msg.ifEmpty { "Session expirée : reconnecte le catalogue avec un nouveau code." })
            if (code == 403) throw VodAuthException(msg.ifEmpty { "Réservé aux donateurs, aux membres fondateurs et aux uploaders." })
            throw IllegalStateException(msg.ifEmpty { "Le site a répondu $code." })
        }
        return if (text.isBlank()) JSONObject() else JSONObject(text)
    }

    /** Échange le code d'association affiché sur le site contre une session de l'application (le mot de passe n'est jamais demandé). Renvoie le pseudo. */
    suspend fun pair(code: String, prefs: Prefs): String = withContext(Dispatchers.IO) {
        val o = call("/exchange", null, "POST", JSONObject().put("code", code).toString())
        prefs.vodToken = o.getString("accessToken")
        prefs.vodUser = o.optString("username").ifEmpty { null }
        prefs.vodUser ?: ""
    }

    suspend fun home(token: String): List<VodRail> = withContext(Dispatchers.IO) {
        val arr = call("/home", token).optJSONArray("rails") ?: JSONArray()
        (0 until arr.length()).map { i ->
            val r = arr.getJSONObject(i)
            val items = r.optJSONArray("items") ?: JSONArray()
            VodRail(r.getString("id"), r.optString("title"), (0 until items.length()).map { itemOf(items.getJSONObject(it)) })
        }
    }

    suspend fun search(token: String, q: String): List<VodItem> = withContext(Dispatchers.IO) {
        val arr = call("/search?q=" + SiteApi.enc(q), token).optJSONArray("items") ?: JSONArray()
        (0 until arr.length()).map { itemOf(arr.getJSONObject(it)) }
    }

    suspend fun title(token: String, id: String): VodTitle = withContext(Dispatchers.IO) {
        val o = call("/title/" + SiteApi.enc(id), token)
        val vs = o.optJSONArray("versions") ?: JSONArray()
        val es = o.optJSONArray("episodes") ?: JSONArray()
        val gs = o.optJSONArray("genres") ?: JSONArray()
        VodTitle(
            id = o.getString("id"), title = o.optString("title"), year = o.intOrNull("year"), kind = o.optString("kind", "film"), cover = o.str("cover"), backdrop = o.str("backdrop"),
            synopsis = o.str("synopsis"), rating = if (o.isNull("rating")) null else o.optDouble("rating"), runtime = o.intOrNull("runtime"),
            genres = (0 until gs.length()).map { gs.getString(it) },
            versions = (0 until vs.length()).map {
                val v = vs.getJSONObject(it)
                val subs = v.optJSONArray("subtitles") ?: JSONArray()
                VodVersion(v.getString("id"), v.optString("label"), v.optLong("size"), v.optInt("seeders"), v.optString("health"), v.optInt("fileIndex"), v.intOrNull("percent"), (0 until subs.length()).map { s -> subs.getString(s) })
            },
            episodes = (0 until es.length()).map {
                val e = es.getJSONObject(it)
                VodEpisode(e.intOrNull("season"), e.intOrNull("episode"), e.optString("label"), e.getString("torrentId"), e.optInt("fileIndex"), e.optLong("size"), e.optInt("seeders"), e.optString("health"), e.str("resolution"), e.str("language"), e.intOrNull("percent"))
            },
        )
    }

    /** Jeton de lecture (à ouvrir comme seeduction://stream/<jeton>) : le .torrent remis porte le marqueur du catalogue, le téléchargement n'est pas compté pour le spectateur. */
    suspend fun play(token: String, torrentId: String, fileIndex: Int): String = withContext(Dispatchers.IO) {
        call("/play", token, "POST", JSONObject().put("torrentId", torrentId).put("fileIndex", fileIndex).toString()).getString("token")
    }
}

/** Texte lisible du nombre de seeders : c'est la seule mesure de disponibilité du catalogue. */
fun healthText(health: String?, seeders: Int): String = when (health) {
    "instant" -> "⚡ Démarrage rapide · $seeders seeders"
    "ok" -> "● Démarrage correct · $seeders seeders"
    "slow" -> "● Démarrage lent · $seeders seeder"
    else -> "$seeders seeders"
}

fun healthColor(health: String?): Int = when (health) {
    "instant" -> Color.parseColor("#34D399")
    "ok" -> Color.parseColor("#E0B84A")
    else -> Color.parseColor("#FB923C")
}

/** Chargement d'affiches : téléchargées en arrière-plan, réduites, gardées en mémoire (pas de bibliothèque d'images : l'APK reste léger). */
object Images {
    private val cache = object : LruCache<String, Bitmap>((Runtime.getRuntime().maxMemory() / 8).toInt().coerceAtLeast(4 * 1024 * 1024)) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }
    private val pool = Executors.newFixedThreadPool(4)
    private val ui = Handler(Looper.getMainLooper())
    private val placeholder = ColorDrawable(Color.parseColor("#1B2342"))

    fun absolute(url: String): String = if (url.startsWith("http", true)) url else Config.SITE + (if (url.startsWith("/")) url else "/$url")

    /** `maxWidth` : largeur utile en pixels (l'image est réduite à peu près à cette taille pour ménager la mémoire). */
    fun load(view: ImageView, url: String?, maxWidth: Int = 400) {
        view.tag = url
        view.setImageDrawable(placeholder)
        if (url == null) return
        val full = absolute(url)
        cache.get(full)?.let { view.setImageBitmap(it); return }
        pool.execute {
            val bmp = try {
                val c = URL(full).openConnection() as HttpURLConnection
                c.connectTimeout = 10000; c.readTimeout = 15000
                c.setRequestProperty("User-Agent", "Seeduction-Android/" + Config.APP_VERSION)
                val bytes = if (c.responseCode in 200..299) c.inputStream.use { it.readBytes() } else null
                if (bytes == null) null else {
                    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                    var sample = 1
                    while (bounds.outWidth / (sample * 2) >= maxWidth) sample *= 2
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
                }
            } catch (_: Exception) { null }
            if (bmp != null) {
                cache.put(full, bmp)
                ui.post { if (view.tag == url) view.setImageBitmap(bmp) }
            }
        }
    }
}
