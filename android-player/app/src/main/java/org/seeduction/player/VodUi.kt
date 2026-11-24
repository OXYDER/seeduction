package org.seeduction.player

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Outline
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/** Le look de Seeduction Cinéma : noir profond, or Seeduction, affiches nettes, textes blancs. */
object Ui {
    val BG = Color.parseColor("#06080F")
    val NAV = Color.parseColor("#0B0F19")
    val SURFACE = Color.parseColor("#11172A")
    val SURFACE2 = Color.parseColor("#1A2238")
    val LINE = Color.parseColor("#232B40")
    val TEXT = Color.parseColor("#F5F7FC")
    val MUTED = Color.parseColor("#9BA3BA")
    val GOLD = Color.parseColor("#E0B84A")
    val GOLD2 = Color.parseColor("#F3D78A")
    val OKGREEN = Color.parseColor("#34D399")
    val INK = Color.parseColor("#1C1404")
    val GLASS = Color.parseColor("#4D0B0F19")
    val black: Typeface get() = Typeface.create("sans-serif-black", Typeface.NORMAL)
    val bold: Typeface get() = Typeface.create("sans-serif-medium", Typeface.BOLD)
    val medium: Typeface get() = Typeface.create("sans-serif-medium", Typeface.NORMAL)
}

/** Télé ou box Android : détectée (mode télévision, pas d'écran tactile, Leanback) ou imposée dans les Paramètres. */
fun Context.isTv(): Boolean {
    when (Prefs(this).tvMode) { "on" -> return true; "off" -> return false }
    val ui = (getSystemService(Context.UI_MODE_SERVICE) as? android.app.UiModeManager)?.currentModeType == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION
    return ui || packageManager.hasSystemFeature("android.software.leanback") || !packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_TOUCHSCREEN)
}

/** Sélection à la télécommande : anneau doré et léger agrandissement sur l'élément qui a le focus (sans effet au toucher). */
fun View.tvFocus(radiusDp: Float = 8f) {
    isFocusable = true
    val ring = GradientDrawable().apply { setStroke(context.dp(3), Ui.GOLD2); cornerRadius = context.dpf(radiusDp); setColor(Color.TRANSPARENT) }
    setOnFocusChangeListener { v, has ->
        v.foreground = if (has) ring else null
        v.animate().scaleX(if (has) 1.06f else 1f).scaleY(if (has) 1.06f else 1f).setDuration(110).start()
    }
}

fun Context.dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
fun Context.dpf(v: Float): Float = v * resources.displayMetrics.density
fun Context.screenW(): Int = resources.displayMetrics.widthPixels

fun roundRect(color: Int, radiusPx: Float, stroke: Int? = null, strokePx: Int = 0) = GradientDrawable().apply {
    setColor(color); cornerRadius = radiusPx; if (stroke != null) setStroke(strokePx, stroke)
}

fun vGradient(top: Int, bottom: Int) = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(top, bottom))

fun Context.label(t: String, size: Float, color: Int = Ui.TEXT, face: Typeface? = null) = TextView(this).apply {
    text = t; textSize = size * (if (isTv()) 1.2f else 1f); setTextColor(color); if (face != null) typeface = face
}

fun Context.icon(res: Int, sizeDp: Int, tint: Int = Ui.TEXT) = ImageView(this).apply {
    setImageResource(res); setColorFilter(tint); layoutParams = LinearLayout.LayoutParams(dp(sizeDp), dp(sizeDp))
}

/** Bouton arrondi avec icône : plein or (action principale) ou verre (secondaire). */
fun Context.pillButton(text: String, iconRes: Int?, gold: Boolean, onClick: () -> Unit): View {
    val fg = if (gold) Ui.INK else Ui.TEXT
    val box = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; setPadding(dp(22), dp(11), dp(24), dp(11))
        background = if (gold) GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, intArrayOf(Ui.GOLD2, Ui.GOLD)).apply { cornerRadius = dpf(8f) } else roundRect(Color.parseColor("#33FFFFFF"), dpf(8f))
        isClickable = true; isFocusable = true; setOnClickListener { onClick() }
        tvFocus()
    }
    if (iconRes != null) box.addView(icon(iconRes, 22, fg))
    box.addView(label(text, 15f, fg, Ui.bold).apply { setPadding(dp(if (iconRes != null) 6 else 0), 0, 0, 0) })
    return box
}

/** Pastille de filtre (genre, tri, saison...). */
fun Context.chip(text: String, selected: Boolean, withArrow: Boolean = false, onClick: () -> Unit): View {
    val box = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(14), dp(7), dp(if (withArrow) 8 else 14), dp(7))
        background = roundRect(if (selected) Ui.GOLD else Ui.SURFACE2, dpf(18f), if (selected) null else Ui.LINE, 1)
        isClickable = true; isFocusable = true; setOnClickListener { onClick() }
        tvFocus(18f)
    }
    box.addView(label(text, 13f, if (selected) Ui.INK else Ui.TEXT, Ui.bold))
    if (withArrow) box.addView(icon(R.drawable.ic_expand, 18, if (selected) Ui.INK else Ui.MUTED))
    return box
}

/** Ouvre ce qui est touché : une saga (liste de ses films), une reprise directe (lecture), ou la fiche du titre. */
fun AppCompatActivity.openItem(item: VodItem) {
    when {
        item.type == "saga" -> startActivity(Intent(this, VodListActivity::class.java).putExtra(VodListActivity.EXTRA_TITLE, item.title).putExtra(VodListActivity.EXTRA_SAGA, item.id))
        item.playTorrentId != null -> playVod(item.playTorrentId, item.playFileIndex)
        else -> startActivity(Intent(this, VodTitleActivity::class.java).putExtra(VodTitleActivity.EXTRA_ID, item.id))
    }
}

fun AppCompatActivity.openMore(title: String, more: VodMore) {
    startActivity(Intent(this, VodListActivity::class.java).putExtra(VodListActivity.EXTRA_TITLE, title)
        .putExtra(VodListActivity.EXTRA_KIND, more.kind).putExtra(VodListActivity.EXTRA_GENRE, more.genre).putExtra(VodListActivity.EXTRA_SORT, more.sort)
        .putExtra(VodListActivity.EXTRA_SAGAS, more.sagas))
}

/** Lance une lecture du catalogue : le site remet un jeton, le lecteur existant le prend en charge (téléchargement dans l'ordre, VLC, reprise, partage). */
/** `queue` : les épisodes suivants (« torrent|fichier|libellé »), pour enchaîner automatiquement. */
fun AppCompatActivity.playVod(torrentId: String, fileIndex: Int, queue: List<String> = emptyList(), busy: (Boolean) -> Unit = {}) {
    val token = Prefs(this).vodToken ?: return
    busy(true)
    lifecycleScope.launch {
        try {
            val play = VodApi.play(token, torrentId, fileIndex)
            startActivity(Intent(this@playVod, PlayerActivity::class.java).putExtra(PlayerActivity.EXTRA_TOKEN, play).putStringArrayListExtra(PlayerActivity.EXTRA_QUEUE, ArrayList(queue)))
        } catch (e: VodAuthException) {
            Prefs(this@playVod).vodToken = null
            Toast.makeText(this@playVod, e.message, Toast.LENGTH_LONG).show()
            startActivity(Intent(this@playVod, VodHomeActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
        } catch (e: Exception) {
            Toast.makeText(this@playVod, e.message ?: "Lecture impossible", Toast.LENGTH_LONG).show()
        } finally { busy(false) }
    }
}

/**
 * Une affiche nette, coins légers. `caption` : titre et année dessous (grilles) ; sinon l'image seule (rangées). Une pastille indique le démarrage
 * (⚡ rapide, ● lent) d'après le nombre de seeders ; une barre dorée montre ce qui est commencé ; une saga porte le nombre de ses films.
 */
class PosterAdapter(private val widthPx: Int, private val caption: Boolean, private val onClick: (VodItem) -> Unit) : RecyclerView.Adapter<PosterAdapter.Holder>() {
    var items: List<VodItem> = emptyList()
        set(v) { field = v; notifyDataSetChanged() }

    fun append(more: List<VodItem>) { val start = items.size; items = items + more; notifyItemRangeInserted(start, more.size) }

    class Holder(val box: LinearLayout, val img: ImageView, val fallback: TextView, val pill: TextView, val bar: ProgressBar, val sagaTag: TextView, val title: TextView, val info: TextView) : RecyclerView.ViewHolder(box)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val c = parent.context
        val box = LinearLayout(c).apply { orientation = LinearLayout.VERTICAL; layoutParams = RecyclerView.LayoutParams(widthPx, ViewGroup.LayoutParams.WRAP_CONTENT); tvFocus(8f) }
        val frame = FrameLayout(c).apply {
            outlineProvider = object : ViewOutlineProvider() { override fun getOutline(view: View, outline: Outline) { outline.setRoundRect(0, 0, view.width, view.height, c.dpf(6f)) } }
            clipToOutline = true; setBackgroundColor(Ui.SURFACE2)
        }
        val img = ImageView(c).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
        frame.addView(img, FrameLayout.LayoutParams(widthPx, (widthPx * 1.5f).toInt()))
        val fallback = c.label("", 12f, Ui.TEXT, Ui.black).apply { gravity = Gravity.CENTER; setPadding(c.dp(6), c.dp(6), c.dp(6), c.dp(6)); visibility = View.GONE }
        frame.addView(fallback, FrameLayout.LayoutParams(widthPx, (widthPx * 1.5f).toInt()))
        val pill = c.label("", 10f, Ui.TEXT, Ui.bold).apply { setPadding(c.dp(6), c.dp(2), c.dp(6), c.dp(2)); visibility = View.GONE }
        frame.addView(pill, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.START).apply { setMargins(c.dp(5), c.dp(5), 0, 0) })
        val sagaTag = c.label("", 11f, Ui.INK, Ui.bold).apply { setPadding(c.dp(8), c.dp(3), c.dp(8), c.dp(3)); gravity = Gravity.CENTER; visibility = View.GONE; background = roundRect(Ui.GOLD, c.dpf(4f)) }
        frame.addView(sagaTag, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or Gravity.START).apply { setMargins(c.dp(5), 0, 0, c.dp(6)) })
        val bar = ProgressBar(c, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100; visibility = View.GONE; progressTintList = android.content.res.ColorStateList.valueOf(Ui.GOLD) }
        frame.addView(bar, FrameLayout.LayoutParams(widthPx, c.dp(3), Gravity.BOTTOM))
        box.addView(frame)
        val title = c.label("", 12f, Ui.TEXT, Ui.bold).apply { maxLines = 2; setPadding(0, c.dp(6), 0, 0); visibility = if (caption) View.VISIBLE else View.GONE }
        val info = c.label("", 11f, Ui.MUTED).apply { maxLines = 1; visibility = if (caption) View.VISIBLE else View.GONE }
        box.addView(title); box.addView(info)
        return Holder(box, img, fallback, pill, bar, sagaTag, title, info)
    }

    override fun getItemCount() = items.size

    override fun onBindViewHolder(h: Holder, position: Int) {
        val it = items[position]
        Images.load(h.img, it.cover, widthPx * 2)
        h.fallback.visibility = if (it.cover == null) View.VISIBLE else View.GONE
        h.fallback.text = it.title
        val saga = it.type == "saga"
        h.sagaTag.visibility = if (saga) View.VISIBLE else View.GONE
        h.sagaTag.text = it.subtitle ?: ""
        when {
            saga || it.seeders <= 0 || it.play() -> h.pill.visibility = View.GONE
            it.health == "instant" -> { h.pill.visibility = View.VISIBLE; h.pill.text = "⚡ " + it.seeders; h.pill.setTextColor(Ui.TEXT); h.pill.background = roundRect(Color.parseColor("#CC0F9D70"), h.box.context.dpf(4f)) }
            it.health == "slow" -> { h.pill.visibility = View.VISIBLE; h.pill.text = "● " + it.seeders; h.pill.setTextColor(Ui.TEXT); h.pill.background = roundRect(Color.parseColor("#CCC2570C"), h.box.context.dpf(4f)) }
            else -> h.pill.visibility = View.GONE
        }
        h.bar.visibility = if (it.percent != null) View.VISIBLE else View.GONE
        h.bar.progress = it.percent ?: 0
        h.title.text = it.title
        h.info.text = if (saga) (it.subtitle ?: "") else listOfNotNull(it.year?.toString(), it.quality).joinToString(" · ")
        h.box.setOnClickListener { _ -> onClick(it) }
    }

    private fun VodItem.play() = playTorrentId != null
}

/** Rangée horizontale d'affiches avec son titre et « Tout voir ». */
fun AppCompatActivity.railView(rail: VodRail): View {
    val c = this
    val tv = c.isTv()
    val side = if (tv) c.dp(48) else c.dp(16)
    val col = LinearLayout(c).apply { orientation = LinearLayout.VERTICAL; setPadding(0, c.dp(18), 0, 0); clipChildren = false; clipToPadding = false }
    val head = LinearLayout(c).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(side, 0, c.dp(10), c.dp(8)) }
    head.addView(c.label(rail.title, 17f, Ui.TEXT, Ui.black).apply { maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    if (rail.more != null) {
        val more = LinearLayout(c).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; isClickable = true; setPadding(c.dp(8), c.dp(4), 0, c.dp(4)); setOnClickListener { openMore(rail.title, rail.more) }; tvFocus(6f) }
        more.addView(c.label("Tout voir", 12.5f, Ui.GOLD, Ui.bold)); more.addView(c.icon(R.drawable.ic_chevron, 18, Ui.GOLD))
        head.addView(more)
    }
    col.addView(head)
    val w = (c.screenW() * (if (tv) 0.125f else 0.3f)).toInt()
    col.addView(RecyclerView(c).apply {
        clipChildren = false
        layoutManager = LinearLayoutManager(c, LinearLayoutManager.HORIZONTAL, false)
        adapter = if (rail.style == "top10") TopAdapter(w) { openItem(it) }.also { a -> a.items = rail.items } else PosterAdapter(w, rail.id == "continue") { openItem(it) }.also { a -> a.items = rail.items }
        setPadding(side, c.dp(8), c.dp(8), c.dp(8)); clipToPadding = false
        addItemDecoration(object : RecyclerView.ItemDecoration() { override fun getItemOffsets(outRect: android.graphics.Rect, view: View, parent: RecyclerView, state: RecyclerView.State) { outRect.right = c.dp(if (tv) 12 else 8) } })
        isNestedScrollingEnabled = false
    })
    return col
}

/** Grille d'affiches à 3 colonnes qui charge la suite en défilant. `loader(page)` renvoie les titres de la page et s'il y en a une autre. */
class PagedGrid(private val act: AppCompatActivity, private val loader: suspend (Int) -> Pair<List<VodItem>, Boolean>) {
    private val tv = act.isTv()
    private val cols = if (tv) 6 else 3
    private val gap = act.dp(5)
    private val cell = (act.screenW() - act.dp(if (tv) 96 else 22)) / cols
    private val adapter = PosterAdapter(cell - gap * 2, true) { act.openItem(it) }
    private var page = 0
    private var more = true
    private var loading = false
    private var job: Job? = null
    private val message = act.label("", 14f, Ui.MUTED).apply { gravity = Gravity.CENTER; setPadding(act.dp(24), act.dp(40), act.dp(24), 0); visibility = View.GONE }
    val recycler = RecyclerView(act).apply {
        val lm = GridLayoutManager(act, cols)
        clipChildren = false
        layoutManager = lm
        adapter = this@PagedGrid.adapter
        setPadding(act.dp(if (tv) 43 else 11), act.dp(10), act.dp(if (tv) 43 else 11), act.dp(12)); clipToPadding = false
        addItemDecoration(object : RecyclerView.ItemDecoration() { override fun getItemOffsets(outRect: android.graphics.Rect, view: View, parent: RecyclerView, state: RecyclerView.State) { outRect.set(gap, gap, gap, act.dp(10)) } })
        addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrolled(rv: RecyclerView, dx: Int, dy: Int) { if (dy > 0 && lm.findLastVisibleItemPosition() >= this@PagedGrid.adapter.itemCount - 7) next() }
        })
    }
    val view: View = FrameLayout(act).apply {
        addView(recycler, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        addView(message, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }

    /** Repart de la première page (changement de filtre ou de tri). */
    fun reset() {
        job?.cancel(); page = 0; more = true; loading = false
        adapter.items = emptyList(); message.visibility = View.GONE
        next()
    }

    /** Vide la grille sans rien charger (recherche effacée). */
    fun clear() { job?.cancel(); page = 0; more = true; loading = false; adapter.items = emptyList(); message.visibility = View.GONE }

    private fun next() {
        if (loading || !more) return
        loading = true
        val p = page + 1
        job = act.lifecycleScope.launch {
            try {
                val (items, hasMore) = loader(p)
                page = p; more = hasMore
                if (p == 1) adapter.items = items else adapter.append(items)
                if (p == 1 && items.isEmpty()) { message.text = "Rien à montrer ici pour l'instant : le catalogue ne propose que les titres qui ont au moins un seeder."; message.visibility = View.VISIBLE }
            } catch (e: VodAuthException) {
                Prefs(act).vodToken = null; Toast.makeText(act, e.message, Toast.LENGTH_LONG).show()
                act.startActivity(Intent(act, VodHomeActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
            } catch (e: Exception) {
                if (p == 1) { message.text = "Impossible de charger : " + (e.message ?: "erreur réseau") + "\nTouche pour réessayer."; message.visibility = View.VISIBLE; message.setOnClickListener { reset() } }
            } finally { loading = false }
        }
    }
}


/** Palmarès : un gros chiffre derrière chaque affiche, façon « Top 10 ». */
class TopAdapter(private val posterW: Int, private val onClick: (VodItem) -> Unit) : RecyclerView.Adapter<TopAdapter.Holder>() {
    var items: List<VodItem> = emptyList()
        set(v) { field = v; notifyDataSetChanged() }

    class Holder(val root: LinearLayout, val num: TextView, val img: ImageView) : RecyclerView.ViewHolder(root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val c = parent.context
        val numW = (posterW * 0.62f).toInt()
        val root = LinearLayout(c).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.BOTTOM; layoutParams = RecyclerView.LayoutParams(posterW + numW, ViewGroup.LayoutParams.WRAP_CONTENT); tvFocus(8f) }
        val num = c.label("", 92f, Color.parseColor("#56618F"), Ui.black).apply { gravity = Gravity.END or Gravity.BOTTOM; includeFontPadding = false; translationX = c.dpf(16f); setShadowLayer(8f, 0f, 2f, Color.BLACK) }
        root.addView(num, LinearLayout.LayoutParams(numW, (posterW * 1.5f).toInt()))
        val img = ImageView(c).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP; setBackgroundColor(Ui.SURFACE2)
            outlineProvider = object : ViewOutlineProvider() { override fun getOutline(view: View, outline: Outline) { outline.setRoundRect(0, 0, view.width, view.height, c.dpf(6f)) } }
            clipToOutline = true; elevation = c.dpf(4f)
        }
        root.addView(img, LinearLayout.LayoutParams(posterW, (posterW * 1.5f).toInt()))
        return Holder(root, num, img)
    }

    override fun getItemCount() = items.size

    override fun onBindViewHolder(h: Holder, position: Int) {
        val it = items[position]
        h.num.text = (position + 1).toString()
        Images.load(h.img, it.cover, posterW * 2)
        h.root.setOnClickListener { _ -> onClick(it) }
    }
}

/** Pastille ronde avec l'initiale du membre : ouvre les Paramètres (compte, lecteur, partages). */
fun AppCompatActivity.avatar(sizeDp: Int = 34): View {
    val initial = (Prefs(this).vodUser?.trim()?.firstOrNull() ?: 'S').uppercaseChar().toString()
    return TextView(this).apply {
        text = initial; gravity = Gravity.CENTER; textSize = sizeDp * 0.42f; typeface = Ui.black; setTextColor(Ui.INK)
        background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(Ui.GOLD2, Ui.GOLD)).apply { shape = GradientDrawable.OVAL }
        layoutParams = LinearLayout.LayoutParams(dp(sizeDp), dp(sizeDp))
        isClickable = true; tvFocus(sizeDp / 2f)
        setOnClickListener { startActivity(Intent(this@avatar, VodSettingsActivity::class.java)) }
    }
}

/** Écran de chargement : des silhouettes qui pulsent (affiche et rangées) en attendant le catalogue. */
fun AppCompatActivity.skeleton(): Pair<View, android.animation.ValueAnimator> {
    val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    val tv = isTv()
    col.addView(View(this).apply { setBackgroundColor(Ui.SURFACE) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, if (tv) (screenW() * 0.36f).toInt() else (screenW() * 1.0f).toInt()))
    repeat(2) {
        col.addView(View(this).apply { background = roundRect(Ui.SURFACE, dpf(4f)) }, LinearLayout.LayoutParams(dp(120), dp(16)).apply { setMargins(dp(if (tv) 48 else 16), dp(22), 0, dp(10)) })
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(dp(if (tv) 48 else 16), 0, 0, 0) }
        val w = (screenW() * (if (tv) 0.125f else 0.3f)).toInt()
        repeat(if (tv) 8 else 4) { row.addView(View(this).apply { background = roundRect(Ui.SURFACE, dpf(6f)) }, LinearLayout.LayoutParams(w, (w * 1.5f).toInt()).apply { rightMargin = dp(8) }) }
        col.addView(row)
    }
    val anim = android.animation.ValueAnimator.ofFloat(0.45f, 1f).apply {
        duration = 800; repeatMode = android.animation.ValueAnimator.REVERSE; repeatCount = android.animation.ValueAnimator.INFINITE
        addUpdateListener { col.alpha = it.animatedValue as Float }
        start()
    }
    return col to anim
}

/** QR code (noir sur blanc, marge comprise) généré sur l'appareil. */
fun qrBitmap(text: String, sizePx: Int): Bitmap {
    val m = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, sizePx, sizePx, mapOf(EncodeHintType.MARGIN to 1))
    val px = IntArray(sizePx * sizePx) { if (m.get(it % sizePx, it / sizePx)) Color.BLACK else Color.WHITE }
    return Bitmap.createBitmap(px, sizePx, sizePx, Bitmap.Config.ARGB_8888)
}
