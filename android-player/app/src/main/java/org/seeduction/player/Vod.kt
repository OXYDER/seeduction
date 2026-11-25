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

/** « Seeduction TV » : le catalogue vidéo (réservé aux donateurs, fondateurs et uploaders). Les modèles ci-dessous reflètent les réponses de /api/vod. */

/** La session du catalogue a expiré ou n'est plus autorisée : l'écran repasse à l'association par code. */
class VodAuthException(message: String) : Exception(message)

class VodItem(
    val id: String, val title: String, val subtitle: String?, val year: Int?, val kind: String?, val cover: String?,
    val seeders: Int, val health: String?, val quality: String?, val percent: Int?, val playTorrentId: String?, val playFileIndex: Int,
    /** « saga » : une collection de films (id = celui de la collection) ; sinon un film ou une série. */
    val type: String? = null, val genres: List<String> = emptyList(), val synopsis: String? = null, val versions: Int = 0,
    /** « Reprendre la lecture » : image large, repère d'épisode (S1:E3) et minutes restantes. */
    val backdrop: String? = null, val epLabel: String? = null, val remainingMin: Int? = null,
)

/** « Tout voir » d'une rangée : les critères de la liste complète. */
class VodMore(val kind: String?, val genre: String?, val sort: String?, val sagas: Boolean)

class VodRail(val id: String, val title: String, val items: List<VodItem>, val more: VodMore?, val style: String? = null)

class VodHome(val heroes: List<VodItem>, val rails: List<VodRail>)

/** Erreur du site avec son code HTTP et son message en français. */
class ApiError(val code: Int, message: String) : Exception(message)

class LoginResult(val token: String?, val needsProfile: Boolean, val message: String?)

class FamilyProfile(val id: String, val name: String, val hasPin: Boolean, val blocked: Boolean)

class VodGenre(val name: String, val count: Int)

class VodSaga(val id: String, val name: String, val items: List<VodItem>)

class VodVersion(
    val id: String, val label: String, val size: Long, val seeders: Int, val health: String, val fileIndex: Int, val percent: Int?, val subtitles: List<String>,
    val quality: String = "", val fit: String = "good", val language: String? = null, val hdr: Boolean = false, val recommended: Boolean = false,
    val audioLanguages: List<String> = emptyList(), val subtitleNames: List<String> = emptyList(), val tech: String? = null,
    val startSeconds: Int? = null, val fastest: Boolean = false,
)

/** Une release proposée avant la lecture (même film ou même épisode) : qualité, langue, taille, et si elle est recommandée d'après la vitesse du torrent. */
class VodOption(
    val torrentId: String, val fileIndex: Int, val size: Long, val seeders: Int, val health: String, val quality: String, val language: String?,
    val fit: String, val recommended: Boolean, val percent: Int?, val hdr: Boolean = false,
    val audioLanguages: List<String> = emptyList(), val subtitleNames: List<String> = emptyList(), val tech: String? = null,
    val startSeconds: Int? = null, val fastest: Boolean = false,
)

class VodEpisode(
    val season: Int?, val episode: Int?, val label: String, val torrentId: String, val fileIndex: Int,
    val size: Long, val seeders: Int, val health: String, val resolution: String?, val language: String?, val percent: Int?,
    val options: List<VodOption> = emptyList(),
    val quality: String = "", val audioLanguages: List<String> = emptyList(), val fit: String? = null, val startSeconds: Int? = null,
    /** Fiche de l'épisode (TMDB, TVmaze ou TheTVDB) : vrai titre, résumé, image d'aperçu, durée en minutes. */
    val name: String? = null, val overview: String? = null, val still: String? = null, val runtime: Int? = null,
)

class VodPerson(val id: String, val name: String, val photo: String?, val character: String?)

/** Note des membres (moyenne, nombre de notes) et ma note de 1 à 5. */
class VodCommunity(val average: Double?, val count: Int, val mine: Int?)

class VodTitle(
    val id: String, val title: String, val year: Int?, val kind: String, val cover: String?, val backdrop: String?, val synopsis: String?,
    val rating: Double?, val runtime: Int?, val genres: List<String>, val versions: List<VodVersion>, val episodes: List<VodEpisode>,
    val saga: VodSaga?, val similar: List<VodItem>,
    val tagline: String? = null, val trailerKey: String? = null, val countries: List<String> = emptyList(), val languages: List<String> = emptyList(),
    val studios: List<String> = emptyList(), val cast: List<VodPerson> = emptyList(), val directors: List<VodPerson> = emptyList(), val writers: List<VodPerson> = emptyList(),
    val community: VodCommunity = VodCommunity(null, 0, null), val released: String? = null,
)

/** Un épisode qui manque, avec l'état de la demande déjà faite sur le site (« mine », « others » ou aucune). */
class MissingEpisode(val season: Int, val episode: Int, val requestState: String?, val requestAt: String?)

class NextRef(val season: Int, val episode: Int, val torrentId: String, val fileIndex: Int)

/** L'épisode suivant d'une série : « next » (le bon), « gap » (il en manque avant le suivant disponible), « missing » (le suivant n'existe pas encore sur le site), « end ». */
class NextResult(val status: String, val show: String, val cover: String?, val curSeason: Int?, val curEpisode: Int?, val next: NextRef?, val missing: List<MissingEpisode>)

/** Une commande envoyée depuis le site (pause, avance, arrêt, lancer un titre). */
class RemoteCommand(val type: String, val value: Int, val torrentId: String?, val fileIndex: Int, val title: String?)

class PersonPage(val name: String, val photo: String?, val items: List<VodItem>)

private fun JSONObject.str(k: String): String? = if (isNull(k)) null else optString(k).ifEmpty { null }
private fun JSONObject.intOrNull(k: String): Int? = if (isNull(k) || !has(k)) null else optInt(k)

private fun itemOf(o: JSONObject): VodItem {
    val play = o.optJSONObject("play")
    val gs = o.optJSONArray("genres") ?: JSONArray()
    return VodItem(
        id = o.getString("id"), title = o.optString("title"), subtitle = o.str("subtitle"), year = o.intOrNull("year"), kind = o.str("kind"), cover = o.str("cover"),
        seeders = o.optInt("seeders"), health = o.str("health"), quality = o.str("quality"), percent = o.intOrNull("percent"),
        playTorrentId = play?.optString("torrentId")?.ifEmpty { null }, playFileIndex = play?.optInt("fileIndex", 0) ?: 0,
        type = o.str("type"), genres = (0 until gs.length()).map { gs.getString(it) }, synopsis = o.str("synopsis"), versions = o.optInt("versions"),
        backdrop = o.str("backdrop"), epLabel = o.str("epLabel"), remainingMin = o.intOrNull("remainingMin"),
    )
}

private fun itemsOf(arr: JSONArray?): List<VodItem> = if (arr == null) emptyList() else (0 until arr.length()).map { itemOf(arr.getJSONObject(it)) }

private fun strList(a: JSONArray?): List<String> = if (a == null) emptyList() else (0 until a.length()).map { a.getString(it) }

object VodApi {
    private fun call(path: String, token: String?, method: String = "GET", body: String? = null): JSONObject {
        val c: HttpURLConnection = SiteApi.open(Config.SITE + "/api/vod" + path, method, body, 20000, token)
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

    // ---- connexion par identifiant (ou courriel) et mot de passe : les mêmes routes que le site

    private fun raw(path: String, method: String, body: String?, token: String?): JSONObject {
        val c = SiteApi.open(Config.SITE + path, method, body, 20000, token)
        val text = SiteApi.readAll(c)
        if (c.responseCode !in 200..299) {
            val msg = try { JSONObject(text).optString("message") } catch (_: Exception) { "" }
            throw ApiError(c.responseCode, msg.ifEmpty { "Le site a répondu " + c.responseCode + "." })
        }
        return if (text.isBlank()) JSONObject() else JSONObject(text)
    }

    /** Identifiant ou courriel + mot de passe (+ code de double authentification si le compte en a une). Un compte famille renvoie `needsProfile` : il reste à choisir le profil. */
    suspend fun login(identifier: String, password: String, totp: String?): LoginResult = withContext(Dispatchers.IO) {
        val b = JSONObject().put("usernameOrEmail", identifier).put("password", password)
        if (!totp.isNullOrBlank()) b.put("totpToken", totp)
        val o = raw("/api/auth/login", "POST", b.toString(), null)
        when {
            o.optBoolean("needsVerification") -> LoginResult(null, false, "Confirme d'abord ton courriel sur le site : un code t'y a été envoyé.")
            o.optBoolean("needsProfile") -> LoginResult(o.getString("accessToken"), true, null)
            else -> LoginResult(o.getString("accessToken"), false, null)
        }
    }

    suspend fun familyProfiles(accountToken: String): List<FamilyProfile> = withContext(Dispatchers.IO) {
        val arr = raw("/api/family/picker", "GET", null, accountToken).optJSONArray("profiles") ?: JSONArray()
        (0 until arr.length()).map { val p = arr.getJSONObject(it); FamilyProfile(p.getString("id"), p.optString("name"), p.optBoolean("hasPin"), p.optBoolean("blocked")) }
    }

    suspend fun familySelect(accountToken: String, profileId: String, pin: String): String = withContext(Dispatchers.IO) {
        raw("/api/family/select", "POST", JSONObject().put("profileId", profileId).put("pin", pin).toString(), accountToken).getString("accessToken")
    }

    /** Échange la session de connexion (7 jours) contre celle de l'application (60 jours) ; refusé sans droit au catalogue. Renvoie le pseudo. */
    suspend fun longSession(token: String, prefs: Prefs): String = withContext(Dispatchers.IO) {
        val o = raw("/api/vod/token", "POST", "{}", token)
        prefs.vodToken = o.getString("accessToken")
        prefs.vodUser = o.optString("username").ifEmpty { null }
        prefs.vodUser ?: ""
    }

    /** Télé ou box : demande un code à afficher à l'écran (le membre le saisit sur le site). */
    class DeviceCode(val deviceCode: String, val userCode: String, val expiresInSeconds: Int, val intervalSeconds: Int)

    suspend fun deviceStart(): DeviceCode = withContext(Dispatchers.IO) {
        val o = call("/device/start", null, "POST", "{}")
        DeviceCode(o.getString("deviceCode"), o.getString("userCode"), o.optInt("expiresInSeconds", 600), o.optInt("intervalSeconds", 3).coerceAtLeast(2))
    }

    /** Le code a-t-il été saisi sur le site ? Renvoie le pseudo (et enregistre la session) une fois connecté, sinon null. */
    suspend fun devicePoll(deviceCode: String, prefs: Prefs): String? = withContext(Dispatchers.IO) {
        val o = call("/device/poll", null, "POST", JSONObject().put("deviceCode", deviceCode).toString())
        if (o.optString("status") != "approved") return@withContext null
        prefs.vodToken = o.getString("accessToken")
        prefs.vodUser = o.optString("username").ifEmpty { null }
        prefs.vodUser ?: ""
    }

    suspend fun home(token: String): VodHome = withContext(Dispatchers.IO) {
        val o = call("/home", token)
        val arr = o.optJSONArray("rails") ?: JSONArray()
        val hs = itemsOf(o.optJSONArray("heroes"))
        VodHome(
            heroes = if (hs.isNotEmpty()) hs else listOfNotNull(o.optJSONObject("hero")?.let { itemOf(it) }),
            rails = (0 until arr.length()).map { i ->
                val r = arr.getJSONObject(i)
                val m = r.optJSONObject("more")
                VodRail(r.getString("id"), r.optString("title"), itemsOf(r.optJSONArray("items")), m?.let { VodMore(it.str("kind"), it.str("genre"), it.str("sort"), it.optBoolean("sagas")) }, r.str("style"))
            },
        )
    }

    /** Liste paginée (onglets Films / Séries, « Tout voir », genres, A–Z, recherche) : renvoie les titres et s'il y a une page suivante. */
    suspend fun browse(token: String, params: Map<String, String?>, page: Int): Pair<List<VodItem>, Boolean> = withContext(Dispatchers.IO) {
        val qs = params.filterValues { !it.isNullOrEmpty() }.entries.joinToString("&") { it.key + "=" + SiteApi.enc(it.value!!) } + "&page=$page&size=30"
        val o = call("/browse?$qs", token)
        Pair(itemsOf(o.optJSONArray("items")), o.optBoolean("hasMore"))
    }

    suspend fun genres(token: String, kind: String?): List<VodGenre> = withContext(Dispatchers.IO) {
        val arr = call("/genres" + (if (kind != null) "?kind=" + SiteApi.enc(kind) else ""), token).optJSONArray("genres") ?: JSONArray()
        (0 until arr.length()).map { VodGenre(arr.getJSONObject(it).optString("name"), arr.getJSONObject(it).optInt("n")) }
    }

    suspend fun sagas(token: String): List<VodItem> = withContext(Dispatchers.IO) { itemsOf(call("/sagas", token).optJSONArray("items")) }

    suspend fun saga(token: String, id: String): VodSaga = withContext(Dispatchers.IO) {
        val o = call("/saga/" + SiteApi.enc(id), token)
        VodSaga(o.optString("id"), o.optString("name"), itemsOf(o.optJSONArray("items")))
    }

    /** Mesure la connexion de l'appareil : télécharge quelques Mo du site et renvoie le débit en Mbit/s (0 si la mesure échoue). */
    suspend fun measureSpeed(token: String): Float = withContext(Dispatchers.IO) {
        try {
            val c = SiteApi.open(Config.SITE + "/api/vod/speedtest", "GET", null, 20000, token)
            if (c.responseCode !in 200..299) return@withContext 0f
            val buf = ByteArray(64 * 1024)
            var total = 0L
            val t0 = System.nanoTime()
            c.inputStream.use { ins -> while (true) { val n = ins.read(buf); if (n < 0) break; total += n } }
            val secs = (System.nanoTime() - t0) / 1e9
            if (secs <= 0.05 || total < 500_000) 0f else (total * 8 / secs / 1e6).toFloat()
        } catch (_: Exception) { 0f }
    }

    suspend fun title(token: String, id: String, mbps: Float = 0f, lang: String? = null): VodTitle = withContext(Dispatchers.IO) {
        val q = listOfNotNull(if (mbps > 0f) "mbps=" + String.format(java.util.Locale.US, "%.1f", mbps) else null, lang?.takeIf { it != "auto" }?.let { "lang=$it" }).joinToString("&")
        val o = call("/title/" + SiteApi.enc(id) + (if (q.isNotEmpty()) "?$q" else ""), token)
        val vs = o.optJSONArray("versions") ?: JSONArray()
        val es = o.optJSONArray("episodes") ?: JSONArray()
        val gs = o.optJSONArray("genres") ?: JSONArray()
        val sg = o.optJSONObject("saga")
        VodTitle(
            id = o.getString("id"), title = o.optString("title"), year = o.intOrNull("year"), kind = o.optString("kind", "film"), cover = o.str("cover"), backdrop = o.str("backdrop"),
            synopsis = o.str("synopsis"), rating = if (o.isNull("rating")) null else o.optDouble("rating"), runtime = o.intOrNull("runtime"),
            genres = (0 until gs.length()).map { gs.getString(it) },
            versions = (0 until vs.length()).map {
                val v = vs.getJSONObject(it)
                val subs = v.optJSONArray("subtitles") ?: JSONArray()
                VodVersion(v.getString("id"), v.optString("label"), v.optLong("size"), v.optInt("seeders"), v.optString("health"), v.optInt("fileIndex"), v.intOrNull("percent"), (0 until subs.length()).map { s -> subs.getString(s) },
                    quality = v.optString("quality"), fit = v.optString("fit", "good"), language = v.str("language"), hdr = v.optBoolean("hdr"), recommended = v.optBoolean("recommended"),
                    audioLanguages = strList(v.optJSONArray("audioLanguages")), subtitleNames = strList(v.optJSONArray("subtitleNames")), tech = v.str("tech"), startSeconds = v.intOrNull("startSeconds"), fastest = v.optBoolean("fastest"))
            },
            episodes = (0 until es.length()).map {
                val e = es.getJSONObject(it)
                VodEpisode(e.intOrNull("season"), e.intOrNull("episode"), e.optString("label"), e.getString("torrentId"), e.optInt("fileIndex"), e.optLong("size"), e.optInt("seeders"), e.optString("health"), e.str("resolution"), e.str("language"), e.intOrNull("percent"),
                    options = optionsOf(e.optJSONArray("options")),
                    quality = e.optString("quality"), audioLanguages = strList(e.optJSONArray("audioLanguages")), fit = e.str("fit"), startSeconds = e.intOrNull("startSeconds"),
                    name = e.str("name"), overview = e.str("overview"), still = e.str("still"), runtime = e.intOrNull("runtime"))
            },
            saga = sg?.let { VodSaga(it.optString("id"), it.optString("name"), itemsOf(it.optJSONArray("items"))) },
            similar = itemsOf(o.optJSONArray("similar")),
            tagline = o.str("tagline"), trailerKey = o.optJSONObject("trailer")?.str("key"),
            countries = strList(o.optJSONArray("countries")), languages = strList(o.optJSONArray("languages")), studios = strList(o.optJSONArray("studios")),
            cast = people(o.optJSONArray("cast")), directors = people(o.optJSONArray("directors")), writers = people(o.optJSONArray("writers")),
            community = communityOf(o.optJSONObject("community")), released = o.str("released"),
        )
    }

    private fun people(arr: JSONArray?): List<VodPerson> = if (arr == null) emptyList() else (0 until arr.length()).map {
        val o = arr.getJSONObject(it); VodPerson(o.optString("id"), o.optString("name"), o.str("photo"), o.str("character"))
    }

    /** L'épisode qui suit celui-ci (sans en sauter un), ou ce qui manque. */
    suspend fun next(token: String, torrentId: String, fileIndex: Int): NextResult = withContext(Dispatchers.IO) {
        val o = call("/next?torrentId=" + SiteApi.enc(torrentId) + "&fileIndex=$fileIndex", token)
        val n = o.optJSONObject("next")
        val cur = o.optJSONObject("current")
        val ms = o.optJSONArray("missing") ?: JSONArray()
        NextResult(
            o.optString("status", "end"), o.optString("show"), o.str("cover"), cur?.intOrNull("season"), cur?.intOrNull("episode"),
            n?.let { NextRef(it.optInt("season"), it.optInt("episode"), it.getString("torrentId"), it.optInt("fileIndex")) },
            (0 until ms.length()).map { val m = ms.getJSONObject(it); val r = m.optJSONObject("request"); MissingEpisode(m.optInt("season"), m.optInt("episode"), r?.str("state"), r?.str("at")) },
        )
    }

    /** Demande, sur le site, d'un épisode manquant : renvoie « created », « already-mine » ou « already-others ». */
    suspend fun requestEpisode(token: String, torrentId: String, season: Int, episode: Int): String = withContext(Dispatchers.IO) {
        call("/request-episode", token, "POST", JSONObject().put("torrentId", torrentId).put("season", season).put("episode", episode).toString()).optString("status")
    }

    /** Ma note (1 à 5, 0 la retire) ; renvoie la note des membres mise à jour. */
    suspend fun rate(token: String, torrentId: String, score: Int): VodCommunity = withContext(Dispatchers.IO) {
        communityOf(call("/rate", token, "POST", JSONObject().put("torrentId", torrentId).put("score", score).toString()))
    }

    fun communityOf(o: JSONObject?): VodCommunity = VodCommunity(if (o == null || o.isNull("average")) null else o.optDouble("average"), o?.optInt("count") ?: 0, o?.intOrNull("mine"))

    /** Une personne de la distribution : sa photo et ses films et séries disponibles. */
    suspend fun person(token: String, id: String): PersonPage = withContext(Dispatchers.IO) {
        val o = call("/person/" + SiteApi.enc(id), token)
        PersonPage(o.optString("name"), o.str("photo"), itemsOf(o.optJSONArray("items")))
    }

    /** Signale l'appareil (et ce qui joue) et reçoit les commandes envoyées depuis le site. */
    suspend fun devicePing(token: String, body: JSONObject): List<RemoteCommand> = withContext(Dispatchers.IO) {
        val arr = call("/devices/ping", token, "POST", body.toString()).optJSONArray("commands") ?: JSONArray()
        (0 until arr.length()).map { val c = arr.getJSONObject(it); RemoteCommand(c.optString("type"), c.optInt("value"), c.str("torrentId"), c.optInt("fileIndex"), c.str("title")) }
    }

    /** Jeton de lecture (à ouvrir comme seeduction://stream/<jeton>) : le .torrent remis porte le marqueur du catalogue, le téléchargement n'est pas compté pour le spectateur. */
    suspend fun play(token: String, torrentId: String, fileIndex: Int): String = withContext(Dispatchers.IO) {
        call("/play", token, "POST", JSONObject().put("torrentId", torrentId).put("fileIndex", fileIndex).toString()).getString("token")
    }
}

/** Texte lisible du nombre de seeders : c'est la seule mesure de disponibilité du catalogue. */
private fun optionsOf(a: JSONArray?): List<VodOption> = (0 until (a?.length() ?: 0)).map {
    val o = a!!.getJSONObject(it)
    VodOption(o.getString("torrentId"), o.optInt("fileIndex"), o.optLong("size"), o.optInt("seeders"), o.optString("health"), o.optString("quality"), o.str("language"),
        o.optString("fit", "good"), o.optBoolean("recommended"), o.intOrNull("percent"),
        audioLanguages = strList(o.optJSONArray("audioLanguages")), subtitleNames = strList(o.optJSONArray("subtitleNames")), tech = o.str("tech"),
        startSeconds = o.intOrNull("startSeconds"), fastest = o.optBoolean("fastest"))
}

/** « démarre en ~8 s » : le délai estimé avant que la lecture commence. */
fun startText(seconds: Int?): String? = seconds?.let { if (it < 60) "démarre en ~$it s" else "démarre en ~" + ((it + 30) / 60) + " min" }

/** Les langues d'une release en toutes lettres : « Français (France) · Anglais ». */
fun languagesText(names: List<String>, fallback: String?): String = if (names.isNotEmpty()) names.joinToString(" · ") else (fallback ?: "Langue non précisée")

/** Ta connexion en mots : « 85 Mbit/s ». */
fun speedText(mbps: Float): String = "" + Math.round(mbps) + " Mbit/s"

/** Ce que permettent le torrent et ta connexion pour cette release (le serveur estime : taille, partageurs, débit mesuré). */
fun fitText(fit: String?, seeders: Int): String = when (fit) {
    "great" -> "⚡ Très fluide · $seeders seeders"
    "good" -> "● Fluide · $seeders seeders"
    "weak" -> "● Peut saccader ou attendre · $seeders seeder" + (if (seeders > 1) "s" else "")
    else -> "Personne ne partage"
}

fun fitColor(fit: String?): Int = when (fit) {
    "great" -> Color.parseColor("#34D399")
    "good" -> Color.parseColor("#E0B84A")
    else -> Color.parseColor("#FB923C")
}

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

/** La connexion de l'appareil, mesurée sur le site (quelques Mo) : sert au serveur à recommander la qualité qui démarre vite. */
object ConnectionSpeed {
    private const val FRESH_MS = 20 * 60_000L
    @Volatile private var running = false

    /** Mesure si aucune mesure ne date de moins de vingt minutes (ou si `force`). Renvoie le débit connu en Mbit/s, 0 si inconnu. */
    suspend fun ensure(prefs: Prefs, token: String, force: Boolean = false): Float {
        if (!force && prefs.speedMbps > 0f && System.currentTimeMillis() - prefs.speedAt < FRESH_MS) return prefs.speedMbps
        if (running) return prefs.speedMbps
        running = true
        try {
            val v = VodApi.measureSpeed(token)
            if (v > 0f) {
                // Une mesure isolée peut être trop basse (démarrage lent de la connexion) : on garde un peu de la précédente si elle est récente.
                val old = prefs.speedMbps
                prefs.speedMbps = if (!force && old > 0f && System.currentTimeMillis() - prefs.speedAt < 6 * 3_600_000L) v * 0.6f + old * 0.4f else v
                prefs.speedAt = System.currentTimeMillis()
            }
        } finally { running = false }
        return prefs.speedMbps
    }
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
    private fun fetch(full: String, maxWidth: Int): Bitmap? = try {
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

    /** Charge une image en avance (affiches qui défilent) : elle s'affichera sans attente. */
    fun prefetch(url: String?, maxWidth: Int = 400) {
        if (url == null) return
        val full = absolute(url)
        if (cache.get(full) != null) return
        pool.execute { fetch(full, maxWidth)?.let { cache.put(full, it) } }
    }

    /** `maxWidth` : largeur utile en pixels (l'image est réduite à peu près à cette taille pour ménager la mémoire). */
    fun load(view: ImageView, url: String?, maxWidth: Int = 400) {
        view.tag = url
        view.animate().cancel(); view.alpha = 1f
        view.setImageDrawable(placeholder)
        if (url == null) return
        val full = absolute(url)
        cache.get(full)?.let { view.setImageBitmap(it); return }
        pool.execute {
            val bmp = fetch(full, maxWidth)
            if (bmp != null) {
                cache.put(full, bmp)
                ui.post { if (view.tag == url) { view.setImageBitmap(bmp); view.alpha = 0f; view.animate().alpha(1f).setDuration(260).start() } }
            }
        }
    }
}
