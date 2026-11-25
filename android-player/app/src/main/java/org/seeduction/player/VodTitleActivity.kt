package org.seeduction.player

import android.content.Intent
import android.graphics.Color
import android.graphics.Outline
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

/**
 * Fiche d'un titre : grande affiche, bande-annonce, titre, infos, « Lecture » (ou « Reprendre »), ma note et celle des membres, synopsis, équipe, distribution (touche une personne :
 * ses films et séries), puis les versions (film) ou les saisons et épisodes (série : « Tout lire », « Lire la saison », épisodes manquants à demander), la saga et les titres du même genre.
 * Jamais de nom de release : le titre et « Épisode 5 » suffisent. La disponibilité n'est que le nombre de seeders.
 */
class VodTitleActivity : AppCompatActivity() {
    private lateinit var content: LinearLayout
    private var data: VodTitle? = null
    private var season: Int? = null
    private var busy = false
    private var autoplayDone = false
    private var expanded = false
    private val requested = mutableSetOf<String>()
    private var community: VodCommunity? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Journal.init(this)
        content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        setContentView(ScrollView(this).apply { addView(content, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); setBackgroundColor(Ui.BG); isVerticalScrollBarEnabled = false })
        content.addView(label("Chargement…", 14f, Ui.MUTED).apply { setPadding(dp(16), dp(80), dp(16), 0) })
    }

    override fun onStart() { super.onStart(); Presence.enter(this) }
    override fun onStop() { super.onStop(); Presence.leave() }

    override fun onResume() {
        super.onResume()
        load()
    }

    private fun load() {
        val id = intent.getStringExtra(EXTRA_ID) ?: run { finish(); return }
        val prefs = Prefs(this)
        val token = prefs.vodToken ?: run { finish(); return }
        lifecycleScope.launch {
            try {
                // La connexion se mesure en arrière-plan (la fiche s'affiche sans attendre) : la mesure sert à la prochaine ouverture.
                val mbps = prefs.speedMbps
                launch { ConnectionSpeed.ensure(prefs, token) }
                val t = VodApi.title(token, id, mbps, prefs.audioPref)
                data = t
                community = t.community
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

    private fun epSub(e: VodEpisode) = if (e.season != null && e.episode != null) "Saison ${e.season} · Épisode ${e.episode}" else e.label

    /** `scope` : « all » (toute la série à la suite) ou « season » (jusqu'à la fin de la saison) ; vide pour un seul épisode qui laisse l'application proposer le suivant. */
    private fun play(torrentId: String, fileIndex: Int, scope: String = "", sub: String = "") {
        if (busy) return
        val t = data
        playVod(torrentId, fileIndex, series = t?.kind == "serie", scope = scope, title = t?.title ?: "", sub = sub) { busy = it }
    }

    /** Un épisode : si plusieurs releases existent (4K, 1080p, 720p…), on propose le choix avant de lire ; un épisode déjà commencé reprend là où il en était. */
    private fun playEpisode(e: VodEpisode, scope: String = "") {
        val started = e.options.firstOrNull { it.percent != null && it.percent in 1..91 }
        if (started != null) { play(started.torrentId, started.fileIndex, scope, epSub(e)); return }
        chooseQuality(epSub(e), e.options) { o -> play(o?.torrentId ?: e.torrentId, o?.fileIndex ?: e.fileIndex, scope, epSub(e)) }
    }

    private fun versionOptions(t: VodTitle) = t.versions.map {
        VodOption(it.id, it.fileIndex, it.size, it.seeders, it.health, it.quality.ifEmpty { it.label }, it.language, it.fit, it.recommended, it.percent, it.hdr,
            it.audioLanguages, it.subtitleNames, it.tech, it.startSeconds, it.fastest)
    }

    /** « Lecture » : le premier épisode à voir (série) ou le film, avec le choix de la qualité quand il y en a plusieurs. */
    private fun playMain(t: VodTitle) {
        if (t.kind == "serie" && t.episodes.isNotEmpty()) {
            val e = t.episodes.firstOrNull { it.percent != null && it.percent in 1..91 } ?: t.episodes.firstOrNull { it.percent == null || it.percent == 0 } ?: t.episodes.first()
            playEpisode(e)
        } else {
            val opts = versionOptions(t)
            val started = opts.firstOrNull { it.percent != null && it.percent in 1..91 }
            if (started != null) { play(started.torrentId, started.fileIndex); return }
            chooseQuality(t.title, opts) { o -> (o ?: opts.firstOrNull())?.let { play(it.torrentId, it.fileIndex) } }
        }
    }

    /** Une petite étiquette arrondie (« ★ Recommandé », « ⚡ Le plus rapide », « HDR »). */
    private fun badge(text: String, fg: Int, bg: Int, stroke: Int? = null) = label(text, 10.5f, fg, Ui.black).apply {
        letterSpacing = 0.04f; setPadding(dp(8), dp(3), dp(8), dp(3)); background = roundRect(bg, dpf(5f), stroke, if (stroke != null) 1 else 0)
    }

    /** Ce qui décrit une release : langues en toutes lettres, taille et détails techniques, ce que permettent le torrent et la connexion, sous-titres. */
    private fun releaseDetails(o: VodOption): LinearLayout {
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.addView(label(languagesText(o.audioLanguages, o.language), 14f, Ui.TEXT, Ui.bold).apply { maxLines = 2 })
        col.addView(label(listOfNotNull(formatSize(o.size), o.tech).joinToString("  ·  "), 12f, Ui.MUTED, Ui.medium).apply { setPadding(0, dp(2), 0, 0); maxLines = 2 })
        col.addView(label(listOfNotNull(fitText(o.fit, o.seeders), startText(o.startSeconds)).joinToString("  ·  "), 12f, fitColor(o.fit), Ui.bold).apply { setPadding(0, dp(3), 0, 0); maxLines = 2 })
        if (o.subtitleNames.isNotEmpty()) col.addView(label("Sous-titres : " + o.subtitleNames.joinToString(", "), 11.5f, Ui.MUTED).apply { setPadding(0, dp(2), 0, 0); maxLines = 2 })
        return col
    }

    /** Les étiquettes d'une release : recommandée (dorée), la plus rapide (verte), HDR, déjà commencée. */
    private fun releaseBadges(o: VodOption, many: Boolean): LinearLayout {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.END }
        fun add(v: View) { box.addView(v, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(4) }) }
        if (o.recommended && many) add(badge("★ RECOMMANDÉ", Ui.INK, Ui.GOLD))
        if (o.fastest) add(badge("⚡ LE PLUS RAPIDE", Color.parseColor("#34D399"), Color.parseColor("#0F2A22"), Color.parseColor("#34D399")))
        if (o.hdr) add(badge("HDR", Ui.GOLD2, Color.parseColor("#2A2310")))
        return box
    }

    /**
     * Écran de choix de la qualité : toutes les releases du même contenu, la plus belle d'abord, avec les langues en toutes lettres, la taille, le détail technique et ce que permettent
     * le torrent et ta connexion (délai de démarrage estimé). La recommandée (la plus belle qui démarre vite et se lit sans coupure) et la plus rapide sont marquées.
     * Une seule release, ou le réglage « Toujours la recommandée » : on lit tout de suite.
     */
    private fun chooseQuality(sub: String, options: List<VodOption>, onPick: (VodOption?) -> Unit) {
        if (options.size <= 1) { onPick(options.firstOrNull()); return }
        val rec = options.firstOrNull { it.recommended } ?: options.first()
        val prefs = Prefs(this)
        if (!prefs.askQuality) { onPick(rec); return }
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(18), dp(16), dp(18), dp(8)); setBackgroundColor(Ui.SURFACE) }
        lateinit var dialog: androidx.appcompat.app.AlertDialog
        root.addView(label("Choisir la qualité", 19f, Ui.TEXT, Ui.black))
        root.addView(label(sub, 12.5f, Ui.MUTED).apply { setPadding(0, dp(2), 0, dp(10)) })
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        for (o in options) {
            val isRec = o === rec
            val rowBox = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; isClickable = true; isFocusable = true
                background = roundRect(if (isRec) Color.parseColor("#1F1B0C") else Ui.SURFACE2, dpf(12f), if (isRec) Ui.GOLD else Ui.LINE, if (isRec) 2 else 1)
                setPadding(dp(14), dp(12), dp(12), dp(12)); tvFocus(12f)
                setOnClickListener { dialog.dismiss(); onPick(o) }
            }
            rowBox.addView(label(o.quality.ifEmpty { "?" }, 21f, if (isRec) Ui.GOLD else Ui.TEXT, Ui.black), LinearLayout.LayoutParams(dp(76), ViewGroup.LayoutParams.WRAP_CONTENT))
            rowBox.addView(releaseDetails(o), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            rowBox.addView(releaseBadges(o, true), LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { leftMargin = dp(8) })
            list.addView(rowBox, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(8) })
        }
        root.addView(android.widget.ScrollView(this).apply { addView(list) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        val link = if (prefs.speedMbps > 0f) "Ta connexion : " + speedText(prefs.speedMbps) else "Ta connexion n'est pas encore mesurée"
        root.addView(label("$link. Recommandé : la plus belle qualité qui démarre vite et se lit sans coupure, d'après la taille du fichier, les partageurs et ta connexion.", 11.5f, Ui.MUTED).apply { setPadding(0, dp(4), 0, dp(2)); setLineSpacing(0f, 1.15f) })
        dialog = androidx.appcompat.app.AlertDialog.Builder(this).setView(root).setNegativeButton("Annuler", null).create()
        dialog.show()
        // à la télécommande, le focus part sur le choix recommandé
        list.post { list.getChildAt(options.indexOf(rec))?.requestFocus() }
    }

    private fun side() = if (isTv()) dp(48) else dp(18)

    private fun runtimeText(min: Int) = if (min >= 60) "${min / 60} h ${String.format("%02d", min % 60)}" else "$min min"

    // ------------------------------------------------------------------ en-tête

    private fun metaLine(t: VodTitle): String {
        val seasons = t.episodes.mapNotNull { it.season }.distinct().size
        return listOfNotNull(
            t.year?.toString(), t.runtime?.let { runtimeText(it) }, if (t.kind == "serie" && seasons > 0) (if (seasons > 1) "$seasons saisons" else "1 saison") else null,
            t.rating?.let { "TMDB " + String.format(java.util.Locale.US, "%.1f", it) },
        ).joinToString("  ·  ")
    }

    private fun starRow(t: VodTitle): View {
        val box = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val stars = (1..5).map { n ->
            TextView(this).apply {
                text = "★"; textSize = if (isTv()) 26f else 30f; setPadding(dp(3), 0, dp(3), 0); isClickable = true; isFocusable = true; tvFocus(8f)
                setOnClickListener {
                    val cur = community?.mine ?: 0
                    val next = if (cur == n) 0 else n
                    val token = Prefs(this@VodTitleActivity).vodToken ?: return@setOnClickListener
                    community = VodCommunity(community?.average, community?.count ?: 0, if (next == 0) null else next); refreshStars(box)
                    lifecycleScope.launch {
                        try { community = VodApi.rate(token, t.id, next); refreshStars(box); Toast.makeText(this@VodTitleActivity, if (next == 0) "Note retirée" else "Merci ! $next ★ enregistré", Toast.LENGTH_SHORT).show() }
                        catch (e: Exception) { Toast.makeText(this@VodTitleActivity, e.message ?: "Note impossible", Toast.LENGTH_SHORT).show() }
                    }
                }
            }
        }
        stars.forEach { box.addView(it) }
        box.addView(label("", 12.5f, Ui.MUTED, Ui.medium).apply { setPadding(dp(10), 0, 0, 0); tag = "info" })
        box.tag = stars
        refreshStars(box)
        return box
    }

    @Suppress("UNCHECKED_CAST")
    private fun refreshStars(box: LinearLayout) {
        val stars = box.tag as List<TextView>
        val mine = community?.mine ?: 0
        stars.forEachIndexed { i, tv -> tv.setTextColor(if (i < mine) Ui.GOLD2 else Color.parseColor("#3A435C")) }
        val c = community
        box.findViewWithTag<TextView>("info")?.text = when {
            mine > 0 && c != null && c.count > 0 -> "Ta note · membres ${fmt1(c.average)} (${c.count})"
            mine > 0 -> "Ta note"
            c != null && c.count > 0 -> "Membres ${fmt1(c.average)} ★ (${c.count}) · touche pour noter"
            else -> "Touche une étoile pour noter"
        }
    }

    private fun fmt1(v: Double?) = if (v == null) "" else String.format(java.util.Locale.US, "%.1f", v)

    private fun trailerButton(t: VodTitle): View? {
        val key = t.trailerKey ?: return null
        return pillButton("Bande-annonce", R.drawable.ic_play, false) { startActivity(Intent(this, TrailerActivity::class.java).putExtra(TrailerActivity.EXTRA_KEY, key).putExtra(TrailerActivity.EXTRA_TITLE, t.title)) }
    }

    private fun infoRows(t: VodTitle): View? {
        val rows = listOfNotNull(
            if (t.directors.isNotEmpty()) (if (t.kind == "serie") "Création" else "Réalisation") to t.directors.joinToString(", ") { it.name } else null,
            if (t.writers.isNotEmpty()) "Scénario" to t.writers.joinToString(", ") { it.name } else null,
            if (t.studios.isNotEmpty()) "Studios" to t.studios.joinToString(", ") else null,
            if (t.countries.isNotEmpty()) "Pays" to t.countries.joinToString(", ") else null,
            if (t.languages.isNotEmpty()) "Langues" to t.languages.joinToString(", ") else null,
            t.released?.takeIf { it.length >= 10 }?.let { "Sortie" to it.substring(8, 10).trimStart('0') + "/" + it.substring(5, 7) + "/" + it.substring(0, 4) },
        )
        if (rows.isEmpty()) return null
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(side(), dp(18), side(), 0) }
        for ((k, v) in rows) {
            val r = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, dp(3), 0, dp(3)) }
            r.addView(label(k, 12.5f, Ui.MUTED, Ui.medium), LinearLayout.LayoutParams(dp(92), ViewGroup.LayoutParams.WRAP_CONTENT))
            r.addView(label(v, 13f, Ui.TEXT).apply { setLineSpacing(0f, 1.15f) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            box.addView(r)
        }
        return box
    }

    private fun openPerson(p: VodPerson) {
        startActivity(Intent(this, VodListActivity::class.java).putExtra(VodListActivity.EXTRA_TITLE, p.name).putExtra(VodListActivity.EXTRA_PERSON, p.id))
    }

    private fun castRail(t: VodTitle): View? {
        if (t.cast.isEmpty()) return null
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        box.addView(section("Distribution"))
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(side(), 0, side(), dp(4)) }
        val size = dp(if (isTv()) 96 else 76)
        for (p in t.cast) {
            val cell = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setPadding(dp(4), dp(4), dp(4), dp(4)); isClickable = true; isFocusable = true; setOnClickListener { openPerson(p) }; tvFocus(10f) }
            val img = ImageView(this).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                outlineProvider = object : ViewOutlineProvider() { override fun getOutline(view: View, outline: Outline) { outline.setOval(0, 0, view.width, view.height) } }
                clipToOutline = true
            }
            Images.load(img, p.photo, size * 2)
            cell.addView(img, LinearLayout.LayoutParams(size, size))
            cell.addView(label(p.name, 12f, Ui.TEXT, Ui.bold).apply { gravity = Gravity.CENTER; maxLines = 2; setPadding(0, dp(6), 0, 0) }, LinearLayout.LayoutParams(size + dp(16), ViewGroup.LayoutParams.WRAP_CONTENT))
            if (!p.character.isNullOrBlank()) cell.addView(label(p.character, 11f, Ui.MUTED).apply { gravity = Gravity.CENTER; maxLines = 2 }, LinearLayout.LayoutParams(size + dp(16), ViewGroup.LayoutParams.WRAP_CONTENT))
            row.addView(cell, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { rightMargin = dp(8) })
        }
        box.addView(HorizontalScrollView(this).apply { addView(row); isHorizontalScrollBarEnabled = false })
        return box
    }

    private fun render() {
        val t = data ?: return
        content.removeAllViews()
        val w = screenW()
        val tv = isTv() || wide()
        var rightCol: LinearLayout? = null

        if (tv) {
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(dp(48), dp(28), dp(48), dp(6)) }
            val pw = (w * 0.2f).toInt()
            val poster = ImageView(this).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                outlineProvider = object : ViewOutlineProvider() { override fun getOutline(view: View, outline: Outline) { outline.setRoundRect(0, 0, view.width, view.height, dpf(8f)) } }
                clipToOutline = true
            }
            Images.load(poster, t.cover, pw * 2)
            row.addView(poster, LinearLayout.LayoutParams(pw, (pw * 1.5f).toInt()))
            val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(32), 0, 0, 0) }
            col.addView(label(if (t.kind == "serie") "SÉRIE" else "FILM", 11f, Ui.GOLD, Ui.bold).apply { letterSpacing = 0.4f })
            col.addView(label(t.title, 30f, Ui.TEXT, Ui.black).apply { maxLines = 2 })
            t.tagline?.let { col.addView(label(it, 13f, Ui.GOLD2).apply { setPadding(0, dp(2), 0, 0); typeface = android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.ITALIC) }) }
            metaLine(t).takeIf { it.isNotEmpty() }?.let { col.addView(label(it, 13f, Ui.MUTED, Ui.medium).apply { setPadding(0, dp(6), 0, 0) }) }
            if (t.genres.isNotEmpty()) col.addView(label(t.genres.joinToString("  •  "), 12.5f, Ui.TEXT, Ui.medium).apply { setPadding(0, dp(2), 0, 0) })
            row.addView(col, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            rightCol = col
            content.addView(row)
        } else {
            val heroH = (w * 1.12f).toInt()
            val hero = FrameLayout(this)
            val img = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
            Images.load(img, t.cover, w * 2)
            hero.addView(img, FrameLayout.LayoutParams(w, heroH))
            hero.addView(View(this).apply { background = vGradient(Color.TRANSPARENT, Ui.BG) }, FrameLayout.LayoutParams(w, (heroH * 0.62f).toInt(), Gravity.BOTTOM))
            hero.addView(View(this).apply { background = vGradient(Color.parseColor("#B006080F"), Color.TRANSPARENT) }, FrameLayout.LayoutParams(w, dp(80), Gravity.TOP))
            hero.addView(icon(R.drawable.ic_back, 24, Ui.TEXT).apply {
                setPadding(dp(10), dp(10), dp(10), dp(10)); background = roundRect(Color.parseColor("#80000000"), dpf(24f)); isClickable = true; setOnClickListener { finish() }
                layoutParams = FrameLayout.LayoutParams(dp(44), dp(44)).apply { setMargins(dp(12), dp(10), 0, 0) }
            })
            val head = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(18), 0, dp(18), dp(6)) }
            head.addView(label(if (t.kind == "serie") "SÉRIE" else "FILM", 11f, Ui.GOLD, Ui.bold).apply { letterSpacing = 0.4f })
            head.addView(label(t.title, 31f, Ui.TEXT, Ui.black).apply { maxLines = 3; setShadowLayer(12f, 0f, 2f, Color.BLACK) })
            t.tagline?.let { head.addView(label(it, 13.5f, Ui.GOLD2).apply { setPadding(0, dp(3), 0, 0); typeface = android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.ITALIC); setShadowLayer(8f, 0f, 1f, Color.BLACK) }) }
            metaLine(t).takeIf { it.isNotEmpty() }?.let { head.addView(label(it, 13f, Ui.TEXT, Ui.medium).apply { setPadding(0, dp(7), 0, 0) }) }
            if (t.genres.isNotEmpty()) head.addView(label(t.genres.joinToString("  •  "), 12.5f, Ui.MUTED, Ui.medium).apply { setPadding(0, dp(2), 0, 0) })
            hero.addView(head, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
            content.addView(hero)
        }

        val main = if (t.kind == "serie") t.episodes.firstOrNull { it.percent != null && it.percent in 1..91 } else null
        val v0 = t.versions.firstOrNull()
        val resumePct = main?.percent ?: v0?.percent?.takeIf { it in 1..91 }
        val btnLabel = if (resumePct != null && resumePct in 1..91) "Reprendre ($resumePct %)" else "Lecture"
        val cta = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(if (tv) 0 else dp(18), dp(if (tv) 14 else 4), if (tv) 0 else dp(18), 0) }
        val lp = { LinearLayout.LayoutParams(if (tv) ViewGroup.LayoutParams.WRAP_CONTENT else ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8) } }
        val btn = pillButton(btnLabel, R.drawable.ic_play, true) { playMain(t) }
        cta.addView(btn, LinearLayout.LayoutParams(if (tv) ViewGroup.LayoutParams.WRAP_CONTENT else ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        if (tv) btn.post { btn.requestFocus() }
        // « Tout lire » : toute la série à la suite, depuis le premier épisode (ou celui qu'on avait commencé)
        if (t.kind == "serie" && t.episodes.size > 1) cta.addView(pillButton("Tout lire", R.drawable.ic_play, false) { playAll(t, "all") }, lp())
        trailerButton(t)?.let { cta.addView(it, lp()) }
        val best = if (t.kind == "serie") t.episodes.firstOrNull() else null
        val bestSeeders = best?.seeders ?: v0?.seeders ?: 0
        val bestHealth = best?.health ?: v0?.health
        cta.addView(label(healthText(bestHealth, bestSeeders), 12f, healthColor(bestHealth), Ui.bold).apply { gravity = if (tv) Gravity.START else Gravity.CENTER; setPadding(0, dp(10), 0, 0) })
        cta.addView(starRow(t).apply { setPadding(0, dp(10), 0, 0) })
        t.synopsis?.let { syn ->
            val tvSyn = label(syn, 14f, Color.parseColor("#D5DAE8")).apply { setLineSpacing(0f, 1.25f); setPadding(0, dp(14), 0, 0); maxLines = if (expanded) 40 else 4; ellipsize = android.text.TextUtils.TruncateAt.END; isClickable = true; isFocusable = true; tvFocus(6f) }
            tvSyn.setOnClickListener { expanded = !expanded; tvSyn.maxLines = if (expanded) 40 else 4 }
            cta.addView(tvSyn)
        }
        (rightCol ?: content).addView(cta)

        infoRows(t)?.let { content.addView(it) }
        castRail(t)?.let { content.addView(it) }

        if (t.kind == "serie" && t.episodes.isNotEmpty()) renderEpisodes(t) else renderVersions(t)

        t.saga?.let { content.addView(railView(VodRail("saga", "Dans la saga « ${it.name} »", it.items, null))) }
        if (t.similar.isNotEmpty()) content.addView(railView(VodRail("similar", "Dans le même genre", t.similar, null)))
        content.addView(label("Ce que tu regardes ici n'est pas compté dans ton ratio. Le titre se télécharge pendant la lecture, directement entre ton appareil et les seeders ; le partage reprend ensuite en arrière-plan (Wi-Fi seulement par défaut).", 11.5f, Ui.MUTED).apply { setPadding(side(), dp(22), side(), dp(30)); setLineSpacing(0f, 1.2f) })
    }

    /** « Tout lire » / « Lire la saison » : depuis l'épisode commencé s'il y en a un dans l'étendue, sinon depuis le premier. */
    private fun playAll(t: VodTitle, scope: String) {
        val pool = if (scope == "season") t.episodes.filter { it.season == season } else t.episodes
        val e = pool.firstOrNull { it.percent != null && it.percent in 1..91 } ?: pool.firstOrNull { it.percent == null || it.percent < 92 } ?: pool.firstOrNull() ?: return
        playEpisode(e, scope)
    }

    private fun section(t: String) = label(t, 17f, Ui.TEXT, Ui.black).apply { setPadding(side(), dp(22), side(), dp(8)) }

    private fun row(title: String, info: String, infoColor: Int, percent: Int?, num: String? = null, onClick: () -> Unit): View {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; background = roundRect(Ui.SURFACE, dpf(10f)); setPadding(dp(12), dp(11), dp(10), dp(11))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { setMargins(side(), dp(4), side(), dp(4)) }
            isClickable = true; isFocusable = true; setOnClickListener { onClick() }; tvFocus(10f)
        }
        if (num != null) box.addView(label(num, 22f, Ui.GOLD, Ui.black).apply { gravity = Gravity.CENTER }, LinearLayout.LayoutParams(dp(40), ViewGroup.LayoutParams.WRAP_CONTENT))
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.addView(label(title, 14.5f, Ui.TEXT, Ui.bold).apply { maxLines = 2 })
        col.addView(label(info, 12f, infoColor, Ui.medium).apply { setPadding(0, dp(2), 0, 0) })
        if (percent != null && percent > 0) col.addView(ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100; progress = percent; progressTintList = android.content.res.ColorStateList.valueOf(Ui.GOLD) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)).apply { topMargin = dp(7) })
        box.addView(col, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        box.addView(icon(R.drawable.ic_play, 26, Ui.GOLD))
        return box
    }

    private fun renderVersions(t: VodTitle) {
        if (t.versions.isEmpty()) { content.addView(label("Aucune version disponible pour l'instant.", 14f, Ui.MUTED).apply { setPadding(side(), dp(20), side(), 0) }); return }
        content.addView(section(if (t.versions.size > 1) "Versions" else "Version"))
        val many = t.versions.size > 1
        for ((i, o) in versionOptions(t).withIndex()) {
            val v = t.versions[i]
            val box = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
                background = roundRect(if (o.recommended && many) Color.parseColor("#1F1B0C") else Ui.SURFACE, dpf(12f), if (o.recommended && many) Ui.GOLD else Ui.LINE, 1)
                setPadding(dp(14), dp(12), dp(12), dp(12))
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { setMargins(side(), dp(4), side(), dp(4)) }
                isClickable = true; isFocusable = true; setOnClickListener { play(v.id, v.fileIndex) }; tvFocus(12f)
            }
            box.addView(label(o.quality.ifEmpty { "?" }, 21f, if (o.recommended && many) Ui.GOLD else Ui.TEXT, Ui.black), LinearLayout.LayoutParams(dp(76), ViewGroup.LayoutParams.WRAP_CONTENT))
            val mid = releaseDetails(o)
            if (o.percent != null && o.percent > 0) mid.addView(ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100; progress = o.percent; progressTintList = android.content.res.ColorStateList.valueOf(Ui.GOLD) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)).apply { topMargin = dp(7) })
            box.addView(mid, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            box.addView(releaseBadges(o, many), LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { leftMargin = dp(8) })
            box.addView(playCircle(o.percent), LinearLayout.LayoutParams(dp(40), dp(40)).apply { leftMargin = dp(6) })
            content.addView(box)
        }
    }

    /** Le bouton rond de lecture : or (à voir), blanc (commencé), discret (déjà vu). Pas d'icône de téléchargement : on lit directement. */
    private fun playCircle(percent: Int?): View {
        val seen = percent != null && percent >= 92
        val started = percent != null && percent in 1..91
        val bg = when { seen -> Ui.SURFACE2; started -> Color.parseColor("#F5F7FC"); else -> Ui.GOLD }
        val fg = when { seen -> Ui.MUTED; started -> Ui.INK; else -> Ui.INK }
        return FrameLayout(this).apply {
            background = roundRect(bg, dpf(20f))
            addView(icon(if (seen) R.drawable.ic_check else R.drawable.ic_play, 20, fg), FrameLayout.LayoutParams(dp(20), dp(20), Gravity.CENTER))
        }
    }

    /** Une ligne d'épisode : numéro, titre, qualité · langues · taille, ce que permet la connexion, progression, et le rond de lecture. */
    private fun episodeRow(e: VodEpisode): View {
        val n = e.episode
        val started = e.percent != null && e.percent in 1..91
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            background = roundRect(if (started) Color.parseColor("#14151C") else Ui.SURFACE, dpf(12f), if (started) Ui.GOLD else Ui.LINE, 1)
            setPadding(dp(14), dp(12), dp(12), dp(12))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { setMargins(side(), dp(4), side(), dp(4)) }
            isClickable = true; isFocusable = true; setOnClickListener { playEpisode(e) }; tvFocus(12f)
        }
        if (n != null) box.addView(label(n.toString(), 22f, Ui.GOLD, Ui.black).apply { gravity = Gravity.CENTER }, LinearLayout.LayoutParams(dp(34), ViewGroup.LayoutParams.WRAP_CONTENT))
        // image d'aperçu de l'épisode (16:9), quand le fournisseur en a une
        if (e.still != null) {
            val tw = dp(if (isTv() || wide()) 170 else 118)
            val thumb = FrameLayout(this).apply {
                outlineProvider = object : ViewOutlineProvider() { override fun getOutline(view: View, outline: Outline) { outline.setRoundRect(0, 0, view.width, view.height, dpf(8f)) } }
                clipToOutline = true; setBackgroundColor(Ui.SURFACE2)
            }
            val img = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
            Images.load(img, e.still, tw * 2)
            thumb.addView(img, FrameLayout.LayoutParams(tw, (tw * 0.5625f).toInt()))
            if (e.percent != null && e.percent > 0) thumb.addView(ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100; progress = e.percent; progressTintList = android.content.res.ColorStateList.valueOf(Ui.GOLD) }, FrameLayout.LayoutParams(tw, dp(3), Gravity.BOTTOM))
            box.addView(thumb, LinearLayout.LayoutParams(tw, (tw * 0.5625f).toInt()).apply { rightMargin = dp(12) })
        }
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.addView(label(if (n != null) (e.name?.let { "$n. $it" } ?: "Épisode $n") else e.label, 15f, Ui.TEXT, Ui.bold).apply { maxLines = 2 })
        if (e.runtime != null || e.overview != null) col.addView(label(listOfNotNull(e.runtime?.let { runtimeText(it) }, e.overview).joinToString("  ·  "), 12f, Color.parseColor("#C3C9DB")).apply { setPadding(0, dp(3), 0, 0); maxLines = if (isTv() || wide()) 3 else 2; ellipsize = android.text.TextUtils.TruncateAt.END; setLineSpacing(0f, 1.1f) })
        val quality = e.quality.ifEmpty { e.resolution ?: "" }
        col.addView(label(listOfNotNull(quality.ifEmpty { null }, languagesText(e.audioLanguages, e.language), formatSize(e.size)).joinToString("  ·  "), 12f, Ui.MUTED, Ui.medium).apply { setPadding(0, dp(2), 0, 0); maxLines = 2 })
        val fit = e.fit ?: "good"
        col.addView(label(listOfNotNull(fitText(fit, e.seeders), startText(e.startSeconds)).joinToString("  ·  ") + (if (e.options.size > 1) "  ·  ${e.options.size} versions" else ""), 12f, fitColor(fit), Ui.bold).apply { setPadding(0, dp(3), 0, 0); maxLines = 2 })
        if (e.still == null && e.percent != null && e.percent > 0) col.addView(ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100; progress = e.percent; progressTintList = android.content.res.ColorStateList.valueOf(Ui.GOLD) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)).apply { topMargin = dp(7) })
        box.addView(col, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        box.addView(playCircle(e.percent), LinearLayout.LayoutParams(dp(40), dp(40)).apply { leftMargin = dp(8) })
        return box
    }

    private fun missingRow(t: VodTitle, s: Int, ep: Int): View {
        val key = "$s:$ep"
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; background = roundRect(Color.parseColor("#0E1322"), dpf(10f), Ui.LINE, 1); setPadding(dp(12), dp(10), dp(10), dp(10))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { setMargins(side(), dp(4), side(), dp(4)) }
        }
        box.addView(label("$ep", 22f, Ui.MUTED, Ui.black).apply { gravity = Gravity.CENTER }, LinearLayout.LayoutParams(dp(40), ViewGroup.LayoutParams.WRAP_CONTENT))
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.addView(label("Épisode $ep", 14.5f, Ui.MUTED, Ui.bold))
        col.addView(label("Pas encore sur Seeduction", 12f, Color.parseColor("#FB923C"), Ui.medium).apply { setPadding(0, dp(2), 0, 0) })
        box.addView(col, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        val btn = chip(if (key in requested) "Demandé ✓" else "Demander", false) { requestMissing(t, s, ep) }
        box.addView(btn)
        return box
    }

    private fun requestMissing(t: VodTitle, s: Int, ep: Int) {
        val token = Prefs(this).vodToken ?: return
        val anchor = t.episodes.firstOrNull() ?: return
        lifecycleScope.launch {
            try {
                val st = VodApi.requestEpisode(token, anchor.torrentId, s, ep)
                requested.add("$s:$ep")
                Toast.makeText(this@VodTitleActivity, when (st) {
                    "created" -> "Demande envoyée sur le site : tu seras prévenu quand l'épisode arrive."
                    "already-mine" -> "Tu as déjà demandé cet épisode : il est en attente sur le site."
                    else -> "Un autre membre a déjà demandé cet épisode : il sera disponible dès qu'il arrive."
                }, Toast.LENGTH_LONG).show()
                render()
            } catch (e: Exception) { Toast.makeText(this@VodTitleActivity, e.message ?: "Demande impossible", Toast.LENGTH_LONG).show() }
        }
    }

    private fun renderEpisodes(t: VodTitle) {
        val seasons = t.episodes.mapNotNull { it.season }.distinct().sorted()
        content.addView(section(if (seasons.size > 1) "Saisons et épisodes" else "Épisodes"))
        if (seasons.size > 1) {
            val chips = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(side(), 0, side(), dp(6)) }
            for (s in seasons) { chips.addView(chip("Saison $s", s == season) { season = s; render() }); chips.addView(View(this), LinearLayout.LayoutParams(dp(8), 1)) }
            content.addView(HorizontalScrollView(this).apply { addView(chips); isHorizontalScrollBarEnabled = false })
        }
        val shown = t.episodes.filter { season == null || it.season == season || it.season == null }
        if (shown.size > 1) {
            val bar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(side(), dp(4), side(), dp(2)) }
            bar.addView(label(if (season != null) "Saison $season · ${shown.size} épisodes" else "${shown.size} épisodes", 12.5f, Ui.MUTED, Ui.medium), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            bar.addView(chip(if (season != null) "Lire la saison" else "Tout lire", true) { playAll(t, if (season != null) "season" else "all") })
            content.addView(bar)
        }
        var prev = 0
        for (e in shown) {
            // les épisodes qui manquent entre deux épisodes disponibles : on le montre et on propose de les demander
            val s = e.season; val n = e.episode
            if (s != null && n != null) {
                if (n - prev in 2..13 && (prev > 0 || n <= 13)) for (m in (prev + 1) until n) if (m >= 1) content.addView(missingRow(t, s, m))
                prev = n
            }
            content.addView(episodeRow(e))
        }
    }

    companion object {
        const val EXTRA_ID = "id"
        const val EXTRA_AUTOPLAY = "autoplay"
    }
}
