package org.seeduction.player

import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

/** Fiche d'un titre du catalogue : affiche, synopsis, puis « Lecture » avec les versions disponibles (film) ou les épisodes par saison (série). La disponibilité n'est que le nombre de seeders. */
class VodTitleActivity : AppCompatActivity() {
    private lateinit var content: LinearLayout
    private var data: VodTitle? = null
    private var season: Int? = null
    private var busy = false

    private val gold = Color.parseColor("#E0B84A")
    private val textColor = Color.parseColor("#E8ECF8")
    private val muted = Color.parseColor("#9AA3C0")
    private val panel = Color.parseColor("#141A33")

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun text(t: String, size: Float = 14f, color: Int = textColor, bold: Boolean = false) = TextView(this).apply {
        text = t; textSize = size; setTextColor(color); if (bold) setTypeface(typeface, Typeface.BOLD)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Journal.init(this)
        content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(16), dp(16), dp(24)) }
        setContentView(ScrollView(this).apply { addView(content, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); setBackgroundColor(Color.parseColor("#0A0E1C")) })
        content.addView(text("Chargement…", 14f, muted))
    }

    override fun onResume() {
        super.onResume()
        load()
    }

    private fun load() {
        val id = intent.getStringExtra(EXTRA_ID) ?: run { finish(); return }
        val token = Prefs(this).vodToken ?: run { finish(); return }
        lifecycleScope.launch {
            try {
                val t = VodApi.title(token, id)
                data = t
                if (season == null) season = (t.episodes.firstOrNull { it.percent != null && it.percent < 92 } ?: t.episodes.firstOrNull())?.season
                render()
            } catch (e: VodAuthException) {
                Prefs(this@VodTitleActivity).vodToken = null
                Toast.makeText(this@VodTitleActivity, e.message, Toast.LENGTH_LONG).show(); finish()
            } catch (e: Exception) {
                content.removeAllViews()
                content.addView(text("Impossible d'ouvrir ce titre : " + (e.message ?: "erreur réseau"), 14f, muted))
                content.addView(Button(this@VodTitleActivity).apply { text = "Réessayer"; setOnClickListener { load() } })
            }
        }
    }

    private fun play(torrentId: String, fileIndex: Int) {
        if (busy) return
        playVod(torrentId, fileIndex) { busy = it }
    }

    private fun row(title: String, info: String, infoColor: Int, percent: Int?, onClick: () -> Unit): View {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setBackgroundColor(panel); setPadding(dp(12), dp(10), dp(12), dp(10))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8) }
            isClickable = true; isFocusable = true; setOnClickListener { onClick() }
        }
        box.addView(text("▶  $title", 14.5f, textColor, true).apply { maxLines = 2 })
        box.addView(text(info, 12f, infoColor))
        if (percent != null) box.addView(android.widget.ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100; progress = percent })
        return box
    }

    private fun render() {
        val t = data ?: return
        content.removeAllViews()

        val head = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val w = dp(120)
        head.addView(ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP; Images.load(this, t.cover, w * 2) }, LinearLayout.LayoutParams(w, (w * 1.5).toInt()))
        val meta = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(14), 0, 0, 0) }
        meta.addView(text(t.title, 20f, textColor, true))
        val line = listOfNotNull(t.year?.toString(), t.runtime?.let { "${it} min" }, t.rating?.let { "★ " + String.format(java.util.Locale.US, "%.1f", it) }, if (t.kind == "serie") "Série" else "Film").joinToString(" · ")
        meta.addView(text(line, 13f, muted))
        if (t.genres.isNotEmpty()) meta.addView(text(t.genres.joinToString(" · "), 12f, muted))
        head.addView(meta, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        content.addView(head)

        t.synopsis?.let { content.addView(text(it, 13.5f, textColor).apply { setPadding(0, dp(14), 0, 0); setLineSpacing(0f, 1.15f) }) }

        if (t.kind == "serie" && t.episodes.isNotEmpty()) renderEpisodes(t) else renderVersions(t)
    }

    private fun renderVersions(t: VodTitle) {
        val best = t.versions.firstOrNull()
        if (best == null) { content.addView(text("\nAucune version disponible pour l'instant.", 14f, muted)); return }
        content.addView(Button(this).apply {
            text = if (best.percent != null && best.percent in 1..91) "▶  Reprendre (${best.percent} %)" else "▶  Lecture"
            textSize = 16f
            setOnClickListener { play(best.id, best.fileIndex) }
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(16) })
        content.addView(text(healthText(best.health, best.seeders) + " · " + best.label + " · " + formatSize(best.size), 12f, healthColor(best.health)).apply { gravity = Gravity.CENTER })

        if (t.versions.size > 1) {
            content.addView(text("Autres versions", 16f, gold, true).apply { setPadding(0, dp(18), 0, 0) })
            for (v in t.versions) {
                val subs = if (v.subtitles.isNotEmpty()) " · ST " + v.subtitles.joinToString("/") else ""
                content.addView(row(v.label, healthText(v.health, v.seeders) + " · " + formatSize(v.size) + subs, healthColor(v.health), v.percent) { play(v.id, v.fileIndex) })
            }
        }
        content.addView(text("Le film se télécharge pendant la lecture, directement entre ton téléphone et les seeders. Ce que tu regardes ici n'est pas compté dans ton ratio ; le partage reprend ensuite en arrière-plan (Wi-Fi seulement par défaut).", 11.5f, muted).apply { setPadding(0, dp(16), 0, 0) })
    }

    private fun renderEpisodes(t: VodTitle) {
        val seasons = t.episodes.mapNotNull { it.season }.distinct().sorted()
        if (seasons.isNotEmpty()) {
            val chips = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            for (s in seasons) chips.addView(Button(this).apply {
                text = "Saison $s"; textSize = 12.5f; alpha = if (s == season) 1f else 0.55f
                setOnClickListener { season = s; render() }
            })
            content.addView(android.widget.HorizontalScrollView(this).apply { addView(chips); setPadding(0, dp(14), 0, 0) })
        }
        val list = t.episodes.filter { season == null || it.season == season || it.season == null }
        for (e in list) {
            val info = healthText(e.health, e.seeders) + " · " + formatSize(e.size) + (e.resolution?.let { " · $it" } ?: "") + (e.language?.let { " · $it" } ?: "")
            content.addView(row(e.label, info, healthColor(e.health), e.percent) { play(e.torrentId, e.fileIndex) })
        }
        content.addView(text("Chaque épisode se télécharge pendant la lecture, directement entre ton téléphone et les seeders. Ce que tu regardes ici n'est pas compté dans ton ratio ; le partage reprend ensuite en arrière-plan (Wi-Fi seulement par défaut).", 11.5f, muted).apply { setPadding(0, dp(16), 0, 0) })
    }

    companion object { const val EXTRA_ID = "id" }
}
