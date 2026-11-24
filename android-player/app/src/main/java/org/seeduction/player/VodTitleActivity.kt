package org.seeduction.player

import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

/**
 * Fiche d'un titre : grande affiche, titre, infos, « Lecture » (ou « Reprendre »), synopsis, puis les versions (film) ou les épisodes par saison (série), la saga
 * et les titres du même genre. La disponibilité n'est que le nombre de seeders.
 */
class VodTitleActivity : AppCompatActivity() {
    private lateinit var content: LinearLayout
    private var data: VodTitle? = null
    private var season: Int? = null
    private var busy = false
    private var autoplayDone = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Journal.init(this)
        content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        setContentView(ScrollView(this).apply { addView(content, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); setBackgroundColor(Ui.BG); isVerticalScrollBarEnabled = false })
        content.addView(label("Chargement…", 14f, Ui.MUTED).apply { setPadding(dp(16), dp(80), dp(16), 0) })
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
                if (intent.getBooleanExtra(EXTRA_AUTOPLAY, false) && !autoplayDone) { autoplayDone = true; playMain(t) }
            } catch (e: VodAuthException) {
                Prefs(this@VodTitleActivity).vodToken = null
                Toast.makeText(this@VodTitleActivity, e.message, Toast.LENGTH_LONG).show(); finish()
            } catch (e: Exception) {
                content.removeAllViews()
                content.addView(label("Impossible d'ouvrir ce titre :\n" + (e.message ?: "erreur réseau"), 14f, Ui.MUTED).apply { setPadding(dp(16), dp(80), dp(16), dp(12)) })
                content.addView(pillButton("Réessayer", null, true) { load() }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { leftMargin = dp(16) })
            }
        }
    }

    private fun play(torrentId: String, fileIndex: Int) {
        if (busy) return
        playVod(torrentId, fileIndex) { busy = it }
    }

    /** « Lecture » : le premier épisode à voir (série) ou la version la mieux seedée (film). */
    private fun playMain(t: VodTitle) {
        if (t.kind == "serie" && t.episodes.isNotEmpty()) {
            val e = t.episodes.firstOrNull { it.percent != null && it.percent in 1..91 } ?: t.episodes.firstOrNull { it.percent == null || it.percent == 0 } ?: t.episodes.first()
            play(e.torrentId, e.fileIndex)
        } else t.versions.firstOrNull()?.let { play(it.id, it.fileIndex) }
    }

    private fun render() {
        val t = data ?: return
        content.removeAllViews()
        val w = screenW()
        val heroH = (w * 1.05f).toInt()

        val hero = FrameLayout(this)
        val img = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
        Images.load(img, t.cover, w * 2)
        hero.addView(img, FrameLayout.LayoutParams(w, heroH))
        hero.addView(View(this).apply { background = vGradient(Color.TRANSPARENT, Ui.BG) }, FrameLayout.LayoutParams(w, (heroH * 0.6f).toInt(), Gravity.BOTTOM))
        hero.addView(View(this).apply { background = vGradient(Color.parseColor("#B006080F"), Color.TRANSPARENT) }, FrameLayout.LayoutParams(w, dp(80), Gravity.TOP))
        hero.addView(icon(R.drawable.ic_back, 24, Ui.TEXT).apply {
            setPadding(dp(10), dp(10), dp(10), dp(10)); background = roundRect(Color.parseColor("#80000000"), dpf(24f)); isClickable = true; setOnClickListener { finish() }
            layoutParams = FrameLayout.LayoutParams(dp(44), dp(44)).apply { setMargins(dp(12), dp(10), 0, 0) }
        })
        val head = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(18), 0, dp(18), dp(6)) }
        head.addView(label(if (t.kind == "serie") "SÉRIE" else "FILM", 11f, Ui.GOLD, Ui.bold).apply { letterSpacing = 0.4f })
        head.addView(label(t.title, 30f, Ui.TEXT, Ui.black).apply { maxLines = 3; setShadowLayer(12f, 0f, 2f, Color.BLACK) })
        val meta = listOfNotNull(t.year?.toString(), t.runtime?.let { "${it} min" }, t.rating?.let { "★ " + String.format(java.util.Locale.US, "%.1f", it) }, if (t.kind == "serie" && t.episodes.isNotEmpty()) "${t.episodes.mapNotNull { it.season }.distinct().size.coerceAtLeast(1)} saison(s)" else null)
        if (meta.isNotEmpty()) head.addView(label(meta.joinToString("   "), 13f, Ui.MUTED, Ui.medium).apply { setPadding(0, dp(6), 0, 0) })
        if (t.genres.isNotEmpty()) head.addView(label(t.genres.joinToString("  •  "), 12.5f, Ui.TEXT, Ui.medium).apply { setPadding(0, dp(2), 0, 0) })
        hero.addView(head, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        content.addView(hero)

        val main = if (t.kind == "serie") t.episodes.firstOrNull { it.percent != null && it.percent in 1..91 } else null
        val v0 = t.versions.firstOrNull()
        val resumePct = main?.percent ?: v0?.percent?.takeIf { it in 1..91 }
        val btnLabel = if (resumePct != null && resumePct in 1..91) "Reprendre ($resumePct %)" else "Lecture"
        val cta = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(18), dp(4), dp(18), 0) }
        val btn = pillButton(btnLabel, R.drawable.ic_play, true) { playMain(t) }
        cta.addView(btn, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        val best = if (t.kind == "serie") t.episodes.firstOrNull() else null
        val bestSeeders = best?.seeders ?: v0?.seeders ?: 0
        val bestHealth = best?.health ?: v0?.health
        cta.addView(label(healthText(bestHealth, bestSeeders), 12f, healthColor(bestHealth), Ui.bold).apply { gravity = Gravity.CENTER; setPadding(0, dp(8), 0, 0) })
        t.synopsis?.let { cta.addView(label(it, 14f, Color.parseColor("#D5DAE8")).apply { setLineSpacing(0f, 1.25f); setPadding(0, dp(14), 0, 0) }) }
        content.addView(cta)

        if (t.kind == "serie" && t.episodes.isNotEmpty()) renderEpisodes(t) else renderVersions(t)

        t.saga?.let { content.addView(railView(VodRail("saga", "Dans la saga « ${it.name} »", it.items, null))) }
        if (t.similar.isNotEmpty()) content.addView(railView(VodRail("similar", "Dans le même genre", t.similar, null)))
        content.addView(label("Ce que tu regardes ici n'est pas compté dans ton ratio. Le titre se télécharge pendant la lecture, directement entre ton téléphone et les seeders ; le partage reprend ensuite en arrière-plan (Wi-Fi seulement par défaut).", 11.5f, Ui.MUTED).apply { setPadding(dp(18), dp(22), dp(18), dp(30)); setLineSpacing(0f, 1.2f) })
    }

    private fun section(t: String) = label(t, 17f, Ui.TEXT, Ui.black).apply { setPadding(dp(18), dp(22), dp(18), dp(8)) }

    private fun row(title: String, info: String, infoColor: Int, percent: Int?, onClick: () -> Unit): View {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; background = roundRect(Ui.SURFACE, dpf(8f)); setPadding(dp(14), dp(11), dp(10), dp(11))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { setMargins(dp(18), dp(4), dp(18), dp(4)) }
            isClickable = true; isFocusable = true; setOnClickListener { onClick() }
        }
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.addView(label(title, 14.5f, Ui.TEXT, Ui.bold).apply { maxLines = 2 })
        col.addView(label(info, 12f, infoColor, Ui.medium).apply { setPadding(0, dp(2), 0, 0) })
        if (percent != null && percent > 0) col.addView(ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100; progress = percent; progressTintList = android.content.res.ColorStateList.valueOf(Ui.GOLD) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)).apply { topMargin = dp(7) })
        box.addView(col, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        box.addView(icon(R.drawable.ic_play, 26, Ui.GOLD))
        return box
    }

    private fun renderVersions(t: VodTitle) {
        if (t.versions.isEmpty()) { content.addView(label("Aucune version disponible pour l'instant.", 14f, Ui.MUTED).apply { setPadding(dp(18), dp(20), dp(18), 0) }); return }
        if (t.versions.size > 1) content.addView(section("Versions"))
        else content.addView(section("Version"))
        for (v in t.versions) {
            val subs = if (v.subtitles.isNotEmpty()) " · ST " + v.subtitles.joinToString("/") else ""
            content.addView(row(v.label, healthText(v.health, v.seeders) + " · " + formatSize(v.size) + subs, healthColor(v.health), v.percent) { play(v.id, v.fileIndex) })
        }
    }

    private fun renderEpisodes(t: VodTitle) {
        val seasons = t.episodes.mapNotNull { it.season }.distinct().sorted()
        content.addView(section("Épisodes"))
        if (seasons.size > 1) {
            val chips = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(dp(18), 0, dp(18), dp(6)) }
            for (s in seasons) { chips.addView(chip("Saison $s", s == season) { season = s; render() }); chips.addView(View(this), LinearLayout.LayoutParams(dp(8), 1)) }
            content.addView(HorizontalScrollView(this).apply { addView(chips); isHorizontalScrollBarEnabled = false })
        }
        for (e in t.episodes.filter { season == null || it.season == season || it.season == null }) {
            val info = healthText(e.health, e.seeders) + " · " + formatSize(e.size) + (e.resolution?.let { " · $it" } ?: "") + (e.language?.let { " · $it" } ?: "")
            content.addView(row(e.label, info, healthColor(e.health), e.percent) { play(e.torrentId, e.fileIndex) })
        }
    }

    companion object {
        const val EXTRA_ID = "id"
        const val EXTRA_AUTOPLAY = "autoplay"
    }
}
