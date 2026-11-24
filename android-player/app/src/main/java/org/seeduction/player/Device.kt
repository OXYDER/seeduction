package org.seeduction.player

import android.content.Context
import android.os.Build
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.lang.ref.WeakReference

/**
 * Cet appareil vu depuis le site (« Mes appareils ») : l'application se signale toutes les 12 secondes quand elle est ouverte, toutes les 3 secondes pendant une lecture
 * (avec le titre, la position et l'état), et reçoit en retour les commandes envoyées depuis le site (pause, avance, arrêt, lancer un titre).
 */
object DeviceSync {
    fun kind(ctx: Context): String = when {
        ctx.isTv() -> "tv"
        ctx.resources.configuration.smallestScreenWidthDp >= 600 -> "tablet"
        else -> "phone"
    }

    fun name(ctx: Context): String {
        val model = Build.MODEL?.trim().orEmpty()
        val maker = Build.MANUFACTURER?.trim().orEmpty().replaceFirstChar { it.uppercase() }
        val base = if (model.startsWith(maker, true) || maker.isEmpty()) model else "$maker $model"
        return when (kind(ctx)) { "tv" -> "Télé " + base.ifEmpty { "Android" }; else -> base.ifEmpty { "Appareil Android" } }.take(60)
    }

    /** `playing` : ce qui joue (null au repos). */
    fun body(ctx: Context, playing: JSONObject?): JSONObject {
        val b = JSONObject().put("deviceKey", Prefs(ctx).deviceKey).put("name", name(ctx)).put("kind", kind(ctx)).put("appVersion", Config.APP_VERSION)
        if (playing != null) b.put("playing", playing)
        return b
    }

    suspend fun ping(ctx: Context, token: String, playing: JSONObject?): List<RemoteCommand> = VodApi.devicePing(token, body(ctx, playing))
}

/** Présence au repos : tant qu'un écran du catalogue est visible, l'appareil se signale au site ; une commande « lancer ce titre » ouvre la lecture. */
object Presence {
    private var count = 0
    private var job: Job? = null
    private var top: WeakReference<AppCompatActivity>? = null

    fun enter(a: AppCompatActivity) {
        count++
        top = WeakReference(a)
        if (job != null) return
        val ctx = a.applicationContext
        job = AppScope.scope.launch {
            while (true) {
                val token = Prefs(ctx).vodToken
                if (token != null) {
                    try { handle(DeviceSync.ping(ctx, token, null)) } catch (_: VodAuthException) { /* session expirée : l'écran d'accueil le dira */ } catch (_: Exception) { /* hors ligne : on réessaie */ }
                }
                delay(12_000)
            }
        }
    }

    fun leave() {
        count = (count - 1).coerceAtLeast(0)
        if (count == 0) { job?.cancel(); job = null }
    }

    private fun handle(cmds: List<RemoteCommand>) {
        val start = cmds.lastOrNull { it.type == "start" && it.torrentId != null } ?: return
        val act = top?.get() ?: return
        act.runOnUiThread { act.playVod(start.torrentId!!, start.fileIndex, title = start.title ?: "") }
    }
}
