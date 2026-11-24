package org.seeduction.player

import android.content.Intent
import android.graphics.Color
import android.graphics.Outline
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

private val GOLD = Color.parseColor("#E0B84A")
private val TEXT = Color.parseColor("#E8ECF8")
private val MUTED = Color.parseColor("#9AA3C0")
private val PANEL = Color.parseColor("#141A33")

/** Lance une lecture du catalogue : le site remet un jeton, le lecteur existant le prend en charge (téléchargement dans l'ordre, VLC, reprise, partage). */
fun AppCompatActivity.playVod(torrentId: String, fileIndex: Int, busy: (Boolean) -> Unit = {}) {
    val token = Prefs(this).vodToken ?: return
    busy(true)
    lifecycleScope.launch {
        try {
            val play = VodApi.play(token, torrentId, fileIndex)
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("seeduction://stream/$play"), this@playVod, PlayerActivity::class.java))
        } catch (e: VodAuthException) {
            Prefs(this@playVod).vodToken = null
            Toast.makeText(this@playVod, e.message, Toast.LENGTH_LONG).show()
            startActivity(Intent(this@playVod, VodHomeActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
        } catch (e: Exception) {
            Toast.makeText(this@playVod, e.message ?: "Lecture impossible", Toast.LENGTH_LONG).show()
        } finally { busy(false) }
    }
}

/** Une affiche du catalogue (ou d'une ligne « Reprendre ») : image, titre, ligne d'information, barre de progression si le titre est entamé. */
class PosterAdapter(private val widthPx: Int, private val onClick: (VodItem) -> Unit) : RecyclerView.Adapter<PosterAdapter.Holder>() {
    var items: List<VodItem> = emptyList()
        set(v) { field = v; notifyDataSetChanged() }

    class Holder(val box: LinearLayout, val img: ImageView, val title: TextView, val info: TextView, val bar: ProgressBar) : RecyclerView.ViewHolder(box)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val ctx = parent.context
        val d = ctx.resources.displayMetrics.density
        val box = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL; layoutParams = RecyclerView.LayoutParams(widthPx, ViewGroup.LayoutParams.WRAP_CONTENT) }
        val frame = FrameLayout(ctx)
        val img = ImageView(ctx).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            outlineProvider = object : ViewOutlineProvider() { override fun getOutline(view: View, outline: Outline) { outline.setRoundRect(0, 0, view.width, view.height, 8 * d) } }
            clipToOutline = true
        }
        frame.addView(img, FrameLayout.LayoutParams(widthPx, (widthPx * 1.5).toInt()))
        val bar = ProgressBar(ctx, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100; visibility = View.GONE }
        frame.addView(bar, FrameLayout.LayoutParams(widthPx, (4 * d).toInt(), Gravity.BOTTOM))
        box.addView(frame)
        val title = TextView(ctx).apply { setTextColor(TEXT); textSize = 12.5f; maxLines = 2; setTypeface(typeface, Typeface.BOLD); setPadding(0, (6 * d).toInt(), 0, 0) }
        val info = TextView(ctx).apply { setTextColor(MUTED); textSize = 11f; maxLines = 2 }
        box.addView(title); box.addView(info)
        return Holder(box, img, title, info, bar)
    }

    override fun getItemCount() = items.size

    override fun onBindViewHolder(h: Holder, position: Int) {
        val it = items[position]
        Images.load(h.img, it.cover, widthPx * 2)
        h.title.text = it.title + (it.year?.let { y -> " ($y)" } ?: "")
        if (it.subtitle != null) { h.info.text = it.subtitle; h.info.setTextColor(MUTED) }
        else { h.info.text = listOfNotNull(it.quality, healthText(it.health, it.seeders).takeIf { _ -> it.seeders > 0 }).joinToString(" · "); h.info.setTextColor(healthColor(it.health)) }
        h.bar.visibility = if (it.percent != null) View.VISIBLE else View.GONE
        h.bar.progress = it.percent ?: 0
        h.box.setOnClickListener { _ -> onClick(it) }
    }
}

/**
 * « Seeduction Cinéma » : l'accueil du catalogue vidéo (rails, recherche). Sans session, l'écran demande le code d'association affiché sur la page « Lecteur » du site (ou s'ouvre par le lien seeduction://vod/<code>).
 */
class VodHomeActivity : AppCompatActivity() {
    private lateinit var prefs: Prefs
    private lateinit var content: LinearLayout
    private var loadJob: Job? = null
    private var searchJob: Job? = null
    private var pairing = false

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun text(t: String, size: Float = 15f, color: Int = TEXT, bold: Boolean = false) = TextView(this).apply {
        text = t; textSize = size; setTextColor(color); if (bold) setTypeface(typeface, Typeface.BOLD)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Journal.init(this)
        prefs = Prefs(this)
        render()
        handleLink(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleLink(intent)
    }

    /** Lien seeduction://vod/<code> (bouton du site) : on associe tout de suite. */
    private fun handleLink(i: Intent?) {
        val code = if (i?.action == Intent.ACTION_VIEW) i.data?.lastPathSegment else null
        if (!code.isNullOrBlank()) connect(code)
    }

    override fun onResume() {
        super.onResume()
        if (prefs.vodToken != null && !pairing) loadHome()
    }

    private fun render() {
        val token = prefs.vodToken
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.parseColor("#0A0E1C")); setPadding(dp(14), dp(18), dp(14), 0) }

        val bar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        bar.addView(text("🎬 Seeduction Cinéma", 20f, GOLD, true), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        if (token != null) {
            bar.addView(Button(this).apply { text = "Mes partages"; textSize = 12f; setOnClickListener { startActivity(Intent(this@VodHomeActivity, MainActivity::class.java).putExtra(MainActivity.EXTRA_NO_REDIRECT, true)) } })
            bar.addView(Button(this).apply { text = "Quitter"; textSize = 12f; setOnClickListener { prefs.vodToken = null; prefs.vodUser = null; render() } })
        } else {
            bar.addView(Button(this).apply { text = "Lecteur"; textSize = 12f; setOnClickListener { startActivity(Intent(this@VodHomeActivity, MainActivity::class.java).putExtra(MainActivity.EXTRA_NO_REDIRECT, true)) } })
        }
        root.addView(bar)

        content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        if (token == null) renderPairing() else renderCatalog(root)
        root.addView(ScrollView(this).apply { addView(content, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); isFillViewport = true }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
    }

    // ------------------------------------------------------------------ association

    private fun renderPairing() {
        content.removeAllViews()
        content.addView(text("\nLe catalogue de films et de séries de Seeduction, sur ton téléphone.", 15f))
        content.addView(text("Réservé aux donateurs ❤️, aux membres fondateurs et aux uploaders.", 13f, MUTED).apply { setPadding(0, dp(6), 0, dp(14)) })
        content.addView(text("1. Sur le site Seeduction, ouvre la page « Lecteur » (menu Aide ou Téléchargements).\n2. Dans « Seeduction Cinéma », touche « Connecter l'application » : un code de 8 caractères s'affiche (valable 5 minutes).\n3. Saisis-le ici.", 13.5f, MUTED))
        val field = EditText(this).apply {
            hint = "Code (ex. K7M2QX9A)"; setHintTextColor(MUTED); setTextColor(TEXT); textSize = 20f
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            imeOptions = EditorInfo.IME_ACTION_DONE; gravity = Gravity.CENTER; setSingleLine()
        }
        content.addView(field, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(18) })
        val go = Button(this).apply { text = "Connecter" }
        go.setOnClickListener { connect(field.text.toString()) }
        field.setOnEditorActionListener { _, _, _ -> go.performClick(); true }
        content.addView(go)
        content.addView(Button(this).apply { text = "Ouvrir la page du site"; setOnClickListener { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Config.SITE + "/player"))) } })
    }

    private fun connect(code: String) {
        val clean = code.uppercase().filter { it.isLetterOrDigit() }
        if (clean.length < 6) { Toast.makeText(this, "Saisis le code affiché sur le site.", Toast.LENGTH_SHORT).show(); return }
        pairing = true
        lifecycleScope.launch {
            try {
                val name = VodApi.pair(clean, prefs)
                Toast.makeText(this@VodHomeActivity, "Connecté" + (if (name.isNotEmpty()) " : $name" else ""), Toast.LENGTH_SHORT).show()
                pairing = false
                render(); loadHome()
            } catch (e: Exception) {
                pairing = false
                Toast.makeText(this@VodHomeActivity, e.message ?: "Association impossible", Toast.LENGTH_LONG).show()
            }
        }
    }

    // ------------------------------------------------------------------ catalogue

    private lateinit var searchBox: EditText
    private lateinit var results: LinearLayout
    private lateinit var rails: LinearLayout

    private fun renderCatalog(root: LinearLayout) {
        searchBox = EditText(this).apply {
            hint = "🔍 Rechercher un film ou une série"; setHintTextColor(MUTED); setTextColor(TEXT); textSize = 15f
            inputType = InputType.TYPE_CLASS_TEXT; imeOptions = EditorInfo.IME_ACTION_SEARCH; setSingleLine()
            setOnEditorActionListener { _, _, _ -> search(text.toString()); true }
            addTextChangedListener(object : android.text.TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, a: Int) {}
                override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) { if ((s?.length ?: 0) == 0) showRails() }
                override fun afterTextChanged(s: android.text.Editable?) {}
            })
        }
        content.addView(searchBox)
        results = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; visibility = View.GONE }
        rails = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(results); content.addView(rails)
        rails.addView(text("Chargement du catalogue…", 14f, MUTED).apply { setPadding(0, dp(18), 0, 0) })
    }

    private fun showRails() { if (::results.isInitialized) { results.visibility = View.GONE; rails.visibility = View.VISIBLE } }

    private fun posterWidth() = (resources.displayMetrics.widthPixels / 3.3f).toInt().coerceIn(dp(100), dp(150))

    private fun open(item: VodItem) {
        if (item.playTorrentId != null) playVod(item.playTorrentId, item.playFileIndex)
        else startActivity(Intent(this, VodTitleActivity::class.java).putExtra(VodTitleActivity.EXTRA_ID, item.id))
    }

    private fun loadHome() {
        val token = prefs.vodToken ?: return
        if (!::rails.isInitialized) return
        loadJob?.cancel()
        loadJob = lifecycleScope.launch {
            try {
                val list = VodApi.home(token)
                rails.removeAllViews()
                if (list.isEmpty()) rails.addView(text("Rien à regarder pour l'instant : le catalogue ne montre que les titres qui ont au moins un seeder.", 14f, MUTED).apply { setPadding(0, dp(18), 0, 0) })
                for (r in list) {
                    rails.addView(text(r.title, 16f, GOLD, true).apply { setPadding(0, dp(16), 0, dp(6)) })
                    rails.addView(RecyclerView(this@VodHomeActivity).apply {
                        layoutManager = LinearLayoutManager(this@VodHomeActivity, LinearLayoutManager.HORIZONTAL, false)
                        adapter = PosterAdapter(posterWidth()) { open(it) }.also { a -> a.items = r.items }
                        addItemDecoration(object : RecyclerView.ItemDecoration() {
                            override fun getItemOffsets(outRect: android.graphics.Rect, view: View, parent: RecyclerView, state: RecyclerView.State) { outRect.right = dp(10) }
                        })
                        isNestedScrollingEnabled = false
                    })
                }
                rails.addView(View(this@VodHomeActivity), LinearLayout.LayoutParams(1, dp(24)))
            } catch (e: VodAuthException) {
                prefs.vodToken = null; Toast.makeText(this@VodHomeActivity, e.message, Toast.LENGTH_LONG).show(); render()
            } catch (e: Exception) {
                Journal.log("catalogue : " + e.message)
                rails.removeAllViews()
                rails.addView(text("Impossible de charger le catalogue : " + (e.message ?: "erreur réseau"), 14f, MUTED).apply { setPadding(0, dp(18), 0, 0) })
                rails.addView(Button(this@VodHomeActivity).apply { text = "Réessayer"; setOnClickListener { loadHome() } })
            }
        }
    }

    private fun search(q: String) {
        val token = prefs.vodToken ?: return
        val term = q.trim()
        if (term.length < 2) { showRails(); return }
        searchJob?.cancel()
        results.visibility = View.VISIBLE; rails.visibility = View.GONE
        results.removeAllViews()
        results.addView(text("Recherche…", 14f, MUTED).apply { setPadding(0, dp(14), 0, 0) })
        searchJob = lifecycleScope.launch {
            try {
                val items = VodApi.search(token, term)
                results.removeAllViews()
                if (items.isEmpty()) { results.addView(text("Aucun titre disponible pour « $term » (seuls ceux qui ont au moins un seeder sont montrés).", 14f, MUTED).apply { setPadding(0, dp(14), 0, 0) }); return@launch }
                val span = 3
                val w = (resources.displayMetrics.widthPixels - dp(28) - dp(10) * (span - 1)) / span
                results.addView(RecyclerView(this@VodHomeActivity).apply {
                    layoutManager = GridLayoutManager(this@VodHomeActivity, span)
                    adapter = PosterAdapter(w) { open(it) }.also { a -> a.items = items }
                    addItemDecoration(object : RecyclerView.ItemDecoration() {
                        override fun getItemOffsets(outRect: android.graphics.Rect, view: View, parent: RecyclerView, state: RecyclerView.State) { outRect.bottom = dp(12); outRect.right = dp(10) }
                    })
                    isNestedScrollingEnabled = false
                    setPadding(0, dp(12), 0, dp(20))
                })
            } catch (e: VodAuthException) {
                prefs.vodToken = null; Toast.makeText(this@VodHomeActivity, e.message, Toast.LENGTH_LONG).show(); render()
            } catch (e: Exception) {
                results.removeAllViews()
                results.addView(text("Recherche impossible : " + (e.message ?: "erreur réseau"), 14f, MUTED).apply { setPadding(0, dp(14), 0, 0) })
            }
        }
    }
}
