package org.seeduction.player

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Bundle
import android.os.IBinder
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** « Mes téléchargements » : ce qui est téléchargé ou partagé en ce moment (lire, arrêter, reprendre, supprimer). On y arrive par les Paramètres. */
class MainActivity : AppCompatActivity() {
    private var service: TorrentService? = null
    private var connection: ServiceConnection? = null
    private lateinit var list: LinearLayout
    private lateinit var empty: android.widget.TextView
    private var refreshJob: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Journal.init(this)
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, 0, 0, dp(28)) }
        val bar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(6), dp(12), dp(16), dp(4)) }
        bar.addView(icon(R.drawable.ic_back, 24, Ui.TEXT).apply { setPadding(dp(10), dp(10), dp(10), dp(10)); layoutParams = LinearLayout.LayoutParams(dp(46), dp(46)); isClickable = true; setOnClickListener { finish() }; tvFocus(24f) })
        bar.addView(label("Mes téléchargements", 22f, Ui.TEXT, Ui.black))
        col.addView(bar)
        col.addView(label("Ce qui se télécharge pendant la lecture reste partagé en arrière-plan pour aider les autres membres (72 h ou ratio 1, la règle du site). Les fichiers sont dans le dossier de l'application ; les supprimer libère de la place.", 12.5f, Ui.MUTED).apply { setPadding(dp(18), dp(6), dp(18), dp(10)); setLineSpacing(0f, 1.2f) })
        empty = label("Rien pour l'instant.", 14f, Ui.MUTED).apply { setPadding(dp(18), dp(14), dp(18), 0) }
        col.addView(empty)
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.addView(list)
        setContentView(ScrollView(this).apply { addView(col, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); setBackgroundColor(Ui.BG); isVerticalScrollBarEnabled = false })
    }

    override fun onResume() {
        super.onResume()
        bindIfRunning()
        refreshJob?.cancel()
        refreshJob = lifecycleScope.launch { while (true) { refresh(); delay(2000) } }
    }

    override fun onPause() {
        super.onPause()
        refreshJob?.cancel()
        connection?.let { try { unbindService(it) } catch (_: Exception) { /* déjà détaché */ } }
        connection = null; service = null
    }

    /** Se relie au service seulement s'il tourne déjà (inutile de le démarrer pour afficher une liste vide). */
    private fun bindIfRunning() {
        if (service != null) return
        val conn = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName?, binder: IBinder?) { service = (binder as TorrentService.LocalBinder).service }
            override fun onServiceDisconnected(name: ComponentName?) { service = null }
        }
        val ok = try { bindService(Intent(this, TorrentService::class.java), conn, 0) } catch (_: Exception) { false }
        if (ok) connection = conn
    }

    private suspend fun refresh() {
        val svc = service
        val rows = if (svc == null) emptyList() else withContext(Dispatchers.Default) { try { svc.all() } catch (_: Exception) { emptyList() } }
        list.removeAllViews()
        empty.visibility = if (rows.isEmpty()) View.VISIBLE else View.GONE
        for ((info, st) in rows) list.addView(row(svc!!, info, st))
    }

    private fun row(svc: TorrentService, info: SessionInfo, st: SessionStats): View {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; background = roundRect(Ui.SURFACE, dpf(10f)); setPadding(dp(14), dp(12), dp(14), dp(12))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { setMargins(dp(16), dp(6), dp(16), dp(6)) }
        }
        box.addView(label(prettyTitle(info.name), 15f, Ui.TEXT, Ui.bold).apply { maxLines = 2 })
        val state = when { st.paused -> "En pause"; st.finished -> "Partage en cours"; else -> "Téléchargement " + (st.progress * 100).toInt() + " %" }
        box.addView(ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 1000; progress = (st.progress * 1000).toInt(); progressTintList = android.content.res.ColorStateList.valueOf(Ui.GOLD) },
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(4)).apply { topMargin = dp(8) })
        box.addView(label(state + " · ↓ " + formatSpeed(st.downRate) + " · ↑ " + formatSpeed(st.upRate) + " · " + st.peers + " pairs", 12f, Ui.MUTED).apply { setPadding(0, dp(6), 0, 0) })
        if (st.finished) {
            val hours = st.seedingSeconds / 3600
            box.addView(label(if (st.obligationDone) "✅ Obligation de partage remplie" else "Partage : " + hours + " h / " + Config.HNR_SEED_HOURS + " h · ratio " + String.format(java.util.Locale.US, "%.2f", st.ratio) + " / " + Config.HNR_RATIO.toInt(), 12f, if (st.obligationDone) Ui.OKGREEN else Ui.GOLD).apply { setPadding(0, dp(2), 0, 0) })
        }
        val buttons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, dp(10), 0, 0) }
        buttons.addView(chip("Lire", true) { startActivity(Intent(this, PlayerActivity::class.java).putExtra(PlayerActivity.EXTRA_SESSION, info.id)) })
        buttons.addView(View(this), LinearLayout.LayoutParams(dp(8), 1))
        buttons.addView(chip(if (st.paused) "Reprendre" else "Arrêter", false) { if (st.paused) svc.resume(info.id) else svc.pause(info.id, true); lifecycleScope.launch { refresh() } })
        buttons.addView(View(this), LinearLayout.LayoutParams(dp(8), 1))
        buttons.addView(chip("Supprimer", false) {
            val warn = if (st.finished && !st.obligationDone) "\n\nAttention : l'obligation de partage (72 h ou ratio 1) n'est pas remplie : supprimer maintenant peut compter comme un « hit & run »." else ""
            AlertDialog.Builder(this).setTitle("Supprimer ?").setMessage("Arrêter le partage de « " + prettyTitle(info.name) + " » ?$warn")
                .setPositiveButton("Supprimer le fichier") { _, _ -> svc.remove(info.id, true); lifecycleScope.launch { refresh() } }
                .setNeutralButton("Garder le fichier") { _, _ -> svc.remove(info.id, false); lifecycleScope.launch { refresh() } }
                .setNegativeButton("Annuler", null).show()
        })
        box.addView(buttons)
        return box
    }

    companion object { const val EXTRA_NO_REDIRECT = "noRedirect" }
}
