package org.seeduction.player

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.IBinder
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Écran d'accueil : explique comment lancer une lecture depuis le site, et liste les téléchargements / partages en cours (arrêter, reprendre, supprimer). */
class MainActivity : AppCompatActivity() {
    private var service: TorrentService? = null
    private var connection: ServiceConnection? = null
    private lateinit var list: LinearLayout
    private lateinit var empty: TextView
    private var refreshJob: Job? = null

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun text(t: String, size: Float = 15f, color: Int = Color.parseColor("#E8ECF8"), bold: Boolean = false) = TextView(this).apply {
        text = t; textSize = size; setTextColor(color); if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Journal.init(this)
        val prefs = Prefs(this)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(18), dp(24), dp(18), dp(24)) }
        root.addView(text("Seeduction", 28f, Color.parseColor("#E0B84A"), true))
        root.addView(text("Lecteur pour Android", 15f, Color.parseColor("#9AA3C0")))
        root.addView(text("\nRegarde un film ou une série directement depuis ton téléphone, sans limite de format. Sur le site Seeduction, ouvre la fiche d'un torrent et touche « Ouvrir dans le lecteur Seeduction » : ce lecteur s'ouvre tout seul, télécharge ce qu'il faut et lance la vidéo.\n", 14f))

        root.addView(Button(this).apply {
            text = "Ouvrir Seeduction"
            setOnClickListener { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Config.SITE))) }
        })

        root.addView(Switch(this).apply {
            text = "Partager seulement en Wi-Fi"
            setTextColor(Color.parseColor("#E8ECF8"))
            isChecked = prefs.wifiOnlySeed
            setPadding(0, dp(14), 0, dp(4))
            setOnCheckedChangeListener { _, on -> prefs.wifiOnlySeed = on }
        })
        root.addView(text("Le partage continue après la lecture (c'est la règle du site : 72 h ou ratio 1). Sur données mobiles, il se met en pause si ce réglage est actif ; une lecture en cours n'est jamais coupée.", 12f, Color.parseColor("#9AA3C0")))

        root.addView(text("\nTéléchargements et partages", 18f, Color.parseColor("#E0B84A"), true))
        empty = text("Rien pour l'instant.", 14f, Color.parseColor("#9AA3C0"))
        root.addView(empty)
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(list)

        root.addView(text("\nLes fichiers sont dans le dossier de l'application (Android/data/org.seeduction.player/files/Seeduction). Les supprimer ici libère de la place.", 12f, Color.parseColor("#9AA3C0")))
        setContentView(ScrollView(this).apply { addView(root, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); setBackgroundColor(Color.parseColor("#0A0E1C")) })
    }

    override fun onResume() {
        super.onResume()
        bindIfRunning()
        refreshJob?.cancel()
        refreshJob = lifecycleScope.launch {
            while (true) {
                refresh()
                delay(2000)
            }
        }
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
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#141A33"))
            setPadding(dp(12), dp(10), dp(12), dp(10))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(10) }
        }
        box.addView(text(info.name, 15f, bold = true).apply { maxLines = 2 })
        val state = when {
            st.paused -> "En pause"
            st.finished -> "Partage en cours"
            else -> "Téléchargement " + (st.progress * 100).toInt() + " %"
        }
        box.addView(ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 1000; progress = (st.progress * 1000).toInt() })
        box.addView(text(state + " · ↓ " + formatSpeed(st.downRate) + " · ↑ " + formatSpeed(st.upRate) + " · " + st.peers + " pairs", 12f, Color.parseColor("#9AA3C0")))
        if (st.finished) {
            val hours = st.seedingSeconds / 3600
            val obligation = if (st.obligationDone) "✅ Obligation de partage remplie" else "Partage : " + hours + " h / " + Config.HNR_SEED_HOURS + " h · ratio " + String.format(java.util.Locale.US, "%.2f", st.ratio) + " / " + Config.HNR_RATIO.toInt()
            box.addView(text(obligation, 12f, if (st.obligationDone) Color.parseColor("#34D399") else Color.parseColor("#FBBF24")))
        }
        val buttons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.START }
        buttons.addView(Button(this).apply { text = "▶ Lire"; setOnClickListener { startActivity(Intent(this@MainActivity, PlayerActivity::class.java).putExtra(PlayerActivity.EXTRA_SESSION, info.id)) } })
        buttons.addView(Button(this).apply {
            text = if (st.paused) "Reprendre" else "Arrêter"
            setOnClickListener { if (st.paused) svc.resume(info.id) else svc.pause(info.id, true); lifecycleScope.launch { refresh() } }
        })
        buttons.addView(Button(this).apply {
            text = "🗑"
            setOnClickListener {
                val warn = if (st.finished && !st.obligationDone) "\n\nAttention : l'obligation de partage (72 h ou ratio 1) n'est pas remplie : supprimer maintenant peut compter comme un « hit & run »." else ""
                AlertDialog.Builder(this@MainActivity).setTitle("Supprimer ?").setMessage("Arrêter le partage de « " + info.name + " » ?$warn")
                    .setPositiveButton("Supprimer le fichier") { _, _ -> svc.remove(info.id, true); lifecycleScope.launch { refresh() } }
                    .setNeutralButton("Garder le fichier") { _, _ -> svc.remove(info.id, false); lifecycleScope.launch { refresh() } }
                    .setNegativeButton("Annuler", null).show()
            }
        })
        box.addView(buttons)
        return box
    }
}
