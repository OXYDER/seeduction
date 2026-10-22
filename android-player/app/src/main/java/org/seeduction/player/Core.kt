package org.seeduction.player

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Réglages et constantes du lecteur Seeduction pour Android. */
object Config {
    val SITE: String get() = BuildConfig.SITE_BASE_URL.trimEnd('/')
    /** Version de l'application (build.gradle.kts) : affichée à l'écran et comparée à celle publiée par le site pour proposer une mise à jour. */
    val APP_VERSION: String get() = BuildConfig.VERSION_NAME

    // Alignés avec HNR_SEED_HOURS / HNR_RATIO du site (backend/src/common/utils/economy.ts) : une estimation locale pour informer le membre ; l'obligation réelle reste calculée par le tracker.
    const val HNR_SEED_HOURS = 72
    const val HNR_RATIO = 1.0

    /** Combien de mégaoctets on télécharge en avance devant la position de lecture. */
    const val READ_AHEAD_BYTES = 24L * 1024 * 1024
    /** Tampon de départ : début du fichier (pour démarrer) avant de lancer la lecture. */
    const val PREBUFFER_BYTES = 6L * 1024 * 1024
}

/** Portée de coroutines qui survit à l'écran (envoi final de la position au site quand le lecteur se ferme). */
object AppScope { val scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.IO) }

/** Journal texte simple (en plus de logcat), pour diagnostiquer après coup ; remis à zéro au-delà de 1 Mo. */
object Journal {
    private var file: File? = null
    fun init(ctx: Context) { file = File(ctx.filesDir, "lecteur.log") }
    fun log(msg: String) {
        Log.i("Seeduction", msg)
        try {
            val f = file ?: return
            if (f.exists() && f.length() > 1_000_000) f.writeText("")
            f.appendText("[" + SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date()) + "] " + msg + "\n")
        } catch (_: Exception) { /* pas grave */ }
    }
}

/** Une lecture / un partage : un torrent du site et le fichier qu'on regarde. Enregistrée pour reprendre le partage après un redémarrage. */
data class SessionInfo(
    val id: String,
    val infoHash: String,
    val name: String,
    val torrentId: String?,
    val fileIndex: Int,
    val coverImage: String?,
    val passkey: String?,
    val addedAt: Long,
    var completedAt: Long = 0,
    var stopped: Boolean = false,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id).put("infoHash", infoHash).put("name", name).put("torrentId", torrentId).put("fileIndex", fileIndex)
        .put("coverImage", coverImage).put("passkey", passkey).put("addedAt", addedAt).put("completedAt", completedAt).put("stopped", stopped)

    companion object {
        fun fromJson(o: JSONObject) = SessionInfo(
            id = o.getString("id"), infoHash = o.getString("infoHash"), name = o.optString("name"), torrentId = o.optString("torrentId").ifEmpty { null },
            fileIndex = o.optInt("fileIndex", 0), coverImage = o.optString("coverImage").ifEmpty { null }, passkey = o.optString("passkey").ifEmpty { null },
            addedAt = o.optLong("addedAt"), completedAt = o.optLong("completedAt"), stopped = o.optBoolean("stopped"),
        )
    }
}

/** Préférences et mémoire locale : sessions, positions de lecture, réglage « Wi-Fi seulement ». */
class Prefs(ctx: Context) {
    private val p = ctx.getSharedPreferences("seeduction", Context.MODE_PRIVATE)

    var wifiOnlySeed: Boolean
        get() = p.getBoolean("wifiOnlySeed", true)
        set(v) { p.edit().putBoolean("wifiOnlySeed", v).apply() }

    fun sessions(): MutableList<SessionInfo> {
        val out = mutableListOf<SessionInfo>()
        try {
            val arr = JSONArray(p.getString("sessions", "[]"))
            for (i in 0 until arr.length()) out.add(SessionInfo.fromJson(arr.getJSONObject(i)))
        } catch (_: Exception) { /* liste illisible : on repart de zéro */ }
        return out
    }

    fun saveSessions(list: List<SessionInfo>) {
        val arr = JSONArray()
        list.forEach { arr.put(it.toJson()) }
        p.edit().putString("sessions", arr.toString()).apply()
    }

    /** Version qu'on a choisi d'ignorer (« Ignorer cette version » dans la proposition de mise à jour). */
    var skippedVersion: String?
        get() = p.getString("skippedVersion", null)
        set(v) { p.edit().putString("skippedVersion", v).apply() }

    /** Dernière vérification réussie des mises à jour (millisecondes) : on ne redemande pas plus d'une fois toutes les 6 heures. */
    var lastUpdateCheck: Long
        get() = p.getLong("lastUpdateCheck", 0)
        set(v) { p.edit().putLong("lastUpdateCheck", v).apply() }

    /** Dernière position de lecture (secondes) d'un fichier, pour reprendre là où on s'est arrêté. */
    fun position(torrentId: String?, fileIndex: Int): Int = if (torrentId == null) 0 else p.getInt("pos:$torrentId:$fileIndex", 0)
    fun savePosition(torrentId: String?, fileIndex: Int, seconds: Int) { if (torrentId != null) p.edit().putInt("pos:$torrentId:$fileIndex", seconds).apply() }
}

/** Le téléphone est-il sur une connexion non limitée (Wi-Fi, Ethernet) ? */
fun isUnmetered(ctx: Context): Boolean {
    val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
    return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
}

/** Négatif si a < b, 0 si égales, positif si a > b (« 1.2 » égale « 1.2.0 ») : même règle que le site (app-version.ts). */
fun compareVersions(a: String, b: String): Int {
    val pa = a.trim().split('.').map { it.toIntOrNull() ?: 0 }
    val pb = b.trim().split('.').map { it.toIntOrNull() ?: 0 }
    for (i in 0 until maxOf(pa.size, pb.size)) {
        val d = (pa.getOrElse(i) { 0 }) - (pb.getOrElse(i) { 0 })
        if (d != 0) return d
    }
    return 0
}

fun formatSize(bytes: Long): String {
    val units = arrayOf("o", "Ko", "Mo", "Go", "To")
    var v = bytes.toDouble(); var i = 0
    while (v >= 1024 && i < units.size - 1) { v /= 1024; i++ }
    return (if (i == 0) v.toLong().toString() else String.format(Locale.US, "%.1f", v)) + " " + units[i]
}

fun formatSpeed(bytesPerSec: Int) = formatSize(bytesPerSec.toLong()) + "/s"

fun formatClock(totalSeconds: Long): String {
    val s = totalSeconds.coerceAtLeast(0)
    val h = s / 3600; val m = (s % 3600) / 60; val sec = s % 60
    return if (h > 0) String.format(Locale.US, "%d:%02d:%02d", h, m, sec) else String.format(Locale.US, "%d:%02d", m, sec)
}

/** « abcdef… » → passkey du site, lue dans l'adresse d'annonce du .torrent personnalisé (…/<passkey>/announce?stream=1). */
fun extractPasskey(announce: String?): String? {
    if (announce == null) return null
    return Regex("/([^/?]+)/announce(?:\\?|$)", RegexOption.IGNORE_CASE).find(announce)?.groupValues?.get(1)
}

/** « seeduction://live/<jeton> » (lien du bouton « Ouvrir dans le lecteur Seeduction » de la page « Canadiens en direct ») → le jeton, ou null si ce n'est pas un lien de direct. */
fun liveTokenOf(link: String?): String? = Regex("^seeduction://live/([^/?#]+)", RegexOption.IGNORE_CASE).find(link ?: "")?.groupValues?.get(1)

/** Adresse d'annonce (« announce ») lue directement dans le .torrent bencodé, sans dépendre de libtorrent : sert à retrouver la passkey et à ajouter le tracker si le moteur ne l'a pas retenu. */
fun announceOf(torrent: ByteArray): String? {
    val text = String(torrent, Charsets.ISO_8859_1)
    val m = Regex("8:announce([0-9]+):").find(text) ?: return null
    val len = m.groupValues[1].toIntOrNull() ?: return null
    val start = m.range.last + 1
    if (len <= 0 || start + len > text.length) return null
    return String(torrent, start, len, Charsets.UTF_8)
}
